"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/dal";
import { nowIso, transaction } from "@/lib/db/client";
import { formError, idSchema, type FormState } from "@/lib/forms";
import { postTxn } from "@/lib/inventory/service";
import { formatQty } from "@/lib/quantity";

function done(result: FormState): FormState {
  if (result.status === "success") refresh();
  return result;
}

const placeSchema = z.object({
  itemId: idSchema,
  batchNumber: z.string().trim().min(1, "Choose the lot.").max(60).transform((v) => v.toUpperCase()),
  reason: z.string().trim().min(3, "Say why the lot is held.").max(200),
});

export async function placeHold(input: z.input<typeof placeSchema>): Promise<FormState> {
  const user = await requirePermission("quality.manage");
  const parsed = placeSchema.safeParse(input);
  if (!parsed.success) return formError(parsed.error.issues[0]?.message ?? "Check the hold.");
  const h = parsed.data;
  return done(
    await transaction(async (tx): Promise<FormState> => {
      const item = await tx.get<{ sku: string }>("SELECT sku FROM items WHERE id = ?", [h.itemId]);
      if (!item) return formError("Item not found.");
      if (!(await tx.get("SELECT id FROM inventory_txns WHERE item_id = ? AND batch_number = ? LIMIT 1", [h.itemId, h.batchNumber]))) {
        return formError(`No lot ${h.batchNumber} of ${item.sku} has been recorded.`);
      }
      if (await tx.get("SELECT id FROM lot_holds WHERE item_id = ? AND batch_number = ? AND status = 'ACTIVE'", [h.itemId, h.batchNumber])) {
        return formError(`Lot ${h.batchNumber} is already on hold.`);
      }
      const { lastID } = await tx.run("INSERT INTO lot_holds (item_id, batch_number, reason, placed_by) VALUES (?, ?, ?, ?)", [h.itemId, h.batchNumber, h.reason, user.id]);
      await writeAudit({ userId: user.id, action: "quality.hold_place", entityType: "lot_hold", entityId: lastID, details: { sku: item.sku, lot: h.batchNumber, reason: h.reason } }, tx);
      return { status: "success", message: `Lot ${h.batchNumber} of ${item.sku} is on hold.` };
    }),
  );
}

const resolveSchema = z.object({
  holdId: idSchema,
  disposition: z.enum(["release", "scrap"]),
  notes: z.string().trim().min(3, "Record the disposition decision.").max(500),
});

/**
 * Closes a hold. "release" returns the lot to use; "scrap" writes the remaining stock of that lot off as
 * SCRAP at every location, in the same transaction.
 */
export async function resolveHold(input: z.input<typeof resolveSchema>): Promise<FormState> {
  const user = await requirePermission("quality.manage");
  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) return formError(parsed.error.issues[0]?.message ?? "Check the decision.");
  const { holdId, disposition, notes } = parsed.data;

  return done(
    await transaction(async (tx): Promise<FormState> => {
      const hold = await tx.get<{ id: number; item_id: number; batch_number: string; status: string; sku: string; uom: string }>(
        "SELECT h.id, h.item_id, h.batch_number, h.status, i.sku, i.uom FROM lot_holds h JOIN items i ON i.id = h.item_id WHERE h.id = ?",
        [holdId],
      );
      if (!hold) return formError("Hold not found.");
      if (hold.status !== "ACTIVE") return formError("This hold has already been resolved.");

      let scrapped = 0;
      if (disposition === "scrap") {
        const balances = await tx.all<{ location_id: number; qty_milli: number }>(
          "SELECT location_id, qty_milli FROM stock_levels WHERE item_id = ? AND batch_number = ? AND qty_milli > 0",
          [hold.item_id, hold.batch_number],
        );
        for (const b of balances) {
          await postTxn(tx, {
            itemId: hold.item_id,
            locationId: b.location_id,
            batchNumber: hold.batch_number,
            qtyChangeMilli: -b.qty_milli,
            txnType: "SCRAP",
            referenceType: "lot_hold",
            referenceId: hold.id,
            notes: `Quality scrap: ${notes}`,
            userId: user.id,
          });
          scrapped += b.qty_milli;
        }
      }

      await tx.run("UPDATE lot_holds SET status = ?, resolved_by = ?, resolved_at = ?, resolution_notes = ? WHERE id = ?", [
        disposition === "release" ? "RELEASED" : "SCRAPPED",
        user.id,
        nowIso(),
        notes,
        hold.id,
      ]);
      await writeAudit(
        { userId: user.id, action: disposition === "release" ? "quality.hold_release" : "quality.hold_scrap", entityType: "lot_hold", entityId: hold.id, details: { sku: hold.sku, lot: hold.batch_number, scrapped_milli: scrapped, notes } },
        tx,
      );
      return {
        status: "success",
        message:
          disposition === "release"
            ? `Lot ${hold.batch_number} released for use.`
            : `Lot ${hold.batch_number} scrapped${scrapped ? ` (${formatQty(scrapped, hold.uom)} written off)` : ""}.`,
      };
    }),
  );
}
