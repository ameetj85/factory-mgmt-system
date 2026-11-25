"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/dal";
import { nowIso, transaction } from "@/lib/db/client";
import { ITEM_TYPES, UNITS_OF_MEASURE } from "@/lib/inventory/constants";
import {
  formError,
  idSchema,
  optionalCentsSchema,
  optionalText,
  qtyMilliSchema,
  validationError,
  type FormState,
} from "@/lib/forms";

const UOM_VALUES = UNITS_OF_MEASURE.map((u) => u.value) as [string, ...string[]];

const itemSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(2, "Use at least 2 characters.")
    .max(40, "Use at most 40 characters.")
    .regex(/^[A-Za-z0-9._/-]+$/, "Use letters, numbers, dots, dashes, slashes or underscores.")
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(2, "Enter a name.").max(120, "Use at most 120 characters."),
  description: optionalText(1000),
  type: z.enum(ITEM_TYPES, "Choose an item type."),
  uom: z.enum(UOM_VALUES, "Choose a unit of measure."),
  reorderPoint: qtyMilliSchema({ allowZero: true, label: "reorder point" }),
  standardCost: optionalCentsSchema,
});

const SKU_TAKEN: FormState = {
  status: "error",
  message: "Please correct the highlighted fields.",
  fieldErrors: { sku: ["That SKU is already in use."] },
};

export async function createItem(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("items.manage");
  const parsed = itemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const item = parsed.data;

  const result = await transaction(async (tx): Promise<FormState> => {
    if (await tx.get("SELECT id FROM items WHERE sku = ?", [item.sku])) return SKU_TAKEN;
    const { lastID } = await tx.run(
      `INSERT INTO items (sku, name, description, type, uom, reorder_point_milli, standard_cost_cents, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [item.sku, item.name, item.description, item.type, item.uom, item.reorderPoint, item.standardCost, user.id],
    );
    await writeAudit(
      { userId: user.id, action: "item.create", entityType: "item", entityId: lastID, details: { sku: item.sku, name: item.name, type: item.type } },
      tx,
    );
    return { status: "success", message: `${item.sku} added to the item master.` };
  });

  if (result.status === "success") refresh();
  return result;
}

export async function updateItem(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("items.manage");
  const parsed = itemSchema.extend({ id: idSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const { id, ...item } = parsed.data;

  const result = await transaction(async (tx): Promise<FormState> => {
    const before = await tx.get<Record<string, unknown>>(
      "SELECT sku, name, description, type, uom, reorder_point_milli, standard_cost_cents FROM items WHERE id = ?",
      [id],
    );
    if (!before) return formError("Item not found.");
    if (await tx.get("SELECT id FROM items WHERE sku = ? AND id <> ?", [item.sku, id])) return SKU_TAKEN;

    // Changing the unit of measure would silently reinterpret every quantity already on the ledger.
    if (before.uom !== item.uom) {
      const used = await tx.get("SELECT id FROM inventory_txns WHERE item_id = ? LIMIT 1", [id]);
      if (used) {
        return {
          status: "error",
          message: "Please correct the highlighted fields.",
          fieldErrors: { uom: ["The unit can't change once stock has been recorded for this item."] },
        };
      }
    }

    await tx.run(
      `UPDATE items SET sku = ?, name = ?, description = ?, type = ?, uom = ?, reorder_point_milli = ?,
              standard_cost_cents = ?, updated_at = ? WHERE id = ?`,
      [item.sku, item.name, item.description, item.type, item.uom, item.reorderPoint, item.standardCost, nowIso(), id],
    );

    const after: Record<string, unknown> = {
      sku: item.sku,
      name: item.name,
      description: item.description,
      type: item.type,
      uom: item.uom,
      reorder_point_milli: item.reorderPoint,
      standard_cost_cents: item.standardCost,
    };
    const changes = Object.fromEntries(
      Object.keys(after)
        .filter((k) => before[k] !== after[k])
        .map((k) => [k, { from: before[k], to: after[k] }]),
    );
    if (Object.keys(changes).length > 0) {
      await writeAudit({ userId: user.id, action: "item.update", entityType: "item", entityId: id, details: changes }, tx);
    }
    return { status: "success", message: `${item.sku} updated.` };
  });

  if (result.status === "success") refresh();
  return result;
}

export async function setItemActive(itemId: number, active: boolean): Promise<FormState> {
  const user = await requirePermission("items.manage");
  const id = idSchema.parse(itemId);

  const result = await transaction(async (tx): Promise<FormState> => {
    const item = await tx.get<{ sku: string }>("SELECT sku FROM items WHERE id = ?", [id]);
    if (!item) return formError("Item not found.");
    if (!active) {
      const stock = await tx.get<{ qty: number | null }>(
        "SELECT SUM(qty_change_milli) AS qty FROM inventory_txns WHERE item_id = ?",
        [id],
      );
      if ((stock?.qty ?? 0) !== 0) {
        return formError(`${item.sku} still has stock on hand. Ship, consume or adjust it to zero before archiving.`);
      }
    }
    await tx.run("UPDATE items SET is_active = ?, updated_at = ? WHERE id = ?", [active ? 1 : 0, nowIso(), id]);
    await writeAudit({ userId: user.id, action: active ? "item.restore" : "item.archive", entityType: "item", entityId: id }, tx);
    return { status: "success", message: `${item.sku} ${active ? "restored" : "archived"}.` };
  });

  if (result.status === "success") refresh();
  return result;
}
