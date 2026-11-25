"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/dal";
import { nowIso, transaction, type Executor } from "@/lib/db/client";
import { formError, idSchema, optionalText, qtyMilliSchema, type FormState } from "@/lib/forms";
import { InventoryError } from "@/lib/inventory/service";
import { parsePercentBp, parseSecondsMs } from "@/lib/production/constants";
import { assertNoBomCycle } from "@/lib/production/service";

const lineSchema = z.object({
  componentId: idSchema,
  qty: qtyMilliSchema({ label: "quantity per unit" }),
  scrapPct: z
    .string()
    .default("")
    .transform((v, ctx) => {
      const bp = parsePercentBp(v);
      if (bp === null) {
        ctx.addIssue({ code: "custom", message: "Enter a percentage from 0 to 100." });
        return z.NEVER;
      }
      return bp;
    }),
});

const stepSchema = z.object({
  workstationId: idSchema,
  operationName: z.string().trim().min(2, "Name the operation.").max(80, "Use at most 80 characters."),
  cycleSeconds: z.string().transform((v, ctx) => {
    const ms = parseSecondsMs(v);
    if (ms === null) {
      ctx.addIssue({ code: "custom", message: "Enter seconds per unit, e.g. 30 or 0.5." });
      return z.NEVER;
    }
    return ms;
  }),
  setupMinutes: z
    .string()
    .default("0")
    .transform((v, ctx) => {
      const value = v.trim() || "0";
      if (!/^\d+$/.test(value)) {
        ctx.addIssue({ code: "custom", message: "Whole minutes." });
        return z.NEVER;
      }
      return Number(value);
    }),
});

const headerSchema = z.object({
  bomId: z.coerce.number().int().positive().optional(),
  itemId: idSchema,
  notes: optionalText(500),
  activate: z.string().optional().transform((v) => v === "on" || v === "true"),
});

function parseJsonArray(formData: FormData, key: string): unknown {
  try {
    return JSON.parse(String(formData.get(key) ?? "[]"));
  } catch {
    return [];
  }
}

function collectErrors(prefix: string, error: z.ZodError, into: Record<string, string[]>) {
  for (const issue of error.issues) {
    const key = issue.path.length ? `${prefix}.${issue.path.join(".")}` : prefix;
    (into[key] ??= []).push(issue.message);
  }
}

async function activateWithinTx(tx: Executor, bomId: number, itemId: number) {
  const components = await tx.all<{ component_item_id: number }>("SELECT component_item_id FROM bom_lines WHERE bom_id = ?", [bomId]);
  await assertNoBomCycle(tx, itemId, components.map((c) => c.component_item_id));
  await tx.run("UPDATE bom_headers SET is_active = 0, updated_at = ? WHERE item_id = ? AND is_active = 1", [nowIso(), itemId]);
  await tx.run("UPDATE bom_headers SET is_active = 1, updated_at = ? WHERE id = ?", [nowIso(), bomId]);
}

/**
 * Creates a new BOM version for an item, or edits an existing version that no work order has used yet.
 * Redirects to the BOM's page on success.
 */
export async function saveBom(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("bom.manage");
  const header = headerSchema.safeParse(Object.fromEntries(formData));
  if (!header.success) return formError("Choose the item this recipe makes.");

  const fieldErrors: Record<string, string[]> = {};
  const lines = z.array(lineSchema).min(1, "Add at least one component.").max(100).safeParse(parseJsonArray(formData, "lines"));
  if (!lines.success) collectErrors("lines", lines.error, fieldErrors);
  const steps = z.array(stepSchema).max(30).safeParse(parseJsonArray(formData, "steps"));
  if (!steps.success) collectErrors("steps", steps.error, fieldErrors);
  if (!lines.success || !steps.success) return { status: "error", message: "Some rows need attention.", fieldErrors };

  const { bomId, itemId, notes, activate } = header.data;
  const componentIds = lines.data.map((l) => l.componentId);
  if (new Set(componentIds).size !== componentIds.length) {
    return { status: "error", message: "Each component can appear only once. Combine duplicate rows." };
  }
  if (componentIds.includes(itemId)) return formError("An item can't be a component of itself.");

  let savedId: number;
  try {
    const result = await transaction(async (tx): Promise<number | FormState> => {
      const item = await tx.get<{ sku: string; type: string; is_active: number }>("SELECT sku, type, is_active FROM items WHERE id = ?", [itemId]);
      if (!item || !item.is_active) return formError("The selected item is no longer active.");
      if (item.type === "raw") return formError("Raw materials are purchased, not produced. Choose a WIP or finished item.");

      const placeholders = componentIds.map(() => "?").join(", ");
      const active = await tx.get<{ n: number }>(`SELECT COUNT(*) AS n FROM items WHERE is_active = 1 AND id IN (${placeholders})`, componentIds);
      if ((active?.n ?? 0) !== componentIds.length) return formError("One of the components is no longer active.");

      const workstationIds = [...new Set(steps.data.map((s) => s.workstationId))];
      if (workstationIds.length) {
        const ws = await tx.get<{ n: number }>(
          `SELECT COUNT(*) AS n FROM workstations WHERE is_active = 1 AND id IN (${workstationIds.map(() => "?").join(", ")})`,
          workstationIds,
        );
        if ((ws?.n ?? 0) !== workstationIds.length) return formError("One of the workstations is no longer active.");
      }

      await assertNoBomCycle(tx, itemId, componentIds);

      let id: number;
      let version: number;
      if (bomId) {
        const existing = await tx.get<{ item_id: number; version: number }>("SELECT item_id, version FROM bom_headers WHERE id = ?", [bomId]);
        if (!existing) return formError("Bill of materials not found.");
        if (existing.item_id !== itemId) return formError("A recipe's item can't change. Create a new BOM instead.");
        const used = await tx.get("SELECT id FROM work_orders WHERE bom_id = ? LIMIT 1", [bomId]);
        if (used) return formError("Work orders already use this version. Save your changes as a new version instead.");
        id = bomId;
        version = existing.version;
        await tx.run("UPDATE bom_headers SET notes = ?, updated_at = ? WHERE id = ?", [notes, nowIso(), id]);
        await tx.run("DELETE FROM bom_lines WHERE bom_id = ?", [id]);
        await tx.run("DELETE FROM bom_routing_steps WHERE bom_id = ?", [id]);
      } else {
        const last = await tx.get<{ v: number | null }>("SELECT MAX(version) AS v FROM bom_headers WHERE item_id = ?", [itemId]);
        version = (last?.v ?? 0) + 1;
        ({ lastID: id } = await tx.run("INSERT INTO bom_headers (item_id, version, notes, created_by) VALUES (?, ?, ?, ?)", [itemId, version, notes, user.id]));
      }

      for (const [i, line] of lines.data.entries()) {
        await tx.run(
          "INSERT INTO bom_lines (bom_id, component_item_id, quantity_required_milli, scrap_factor_bp, sort_order) VALUES (?, ?, ?, ?, ?)",
          [id, line.componentId, line.qty, line.scrapPct, i],
        );
      }
      for (const [i, step] of steps.data.entries()) {
        await tx.run(
          `INSERT INTO bom_routing_steps (bom_id, sequence, workstation_id, operation_name, ideal_cycle_time_ms, setup_time_minutes)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [id, (i + 1) * 10, step.workstationId, step.operationName, step.cycleSeconds, step.setupMinutes],
        );
      }

      const hasActive = await tx.get("SELECT id FROM bom_headers WHERE item_id = ? AND is_active = 1 AND id <> ?", [itemId, id]);
      if (activate || !hasActive) await activateWithinTx(tx, id, itemId);

      await writeAudit(
        {
          userId: user.id,
          action: bomId ? "bom.update" : "bom.create",
          entityType: "bom",
          entityId: id,
          details: { sku: item.sku, version, lines: lines.data.length, steps: steps.data.length },
        },
        tx,
      );
      return id;
    });
    if (typeof result !== "number") return result;
    savedId = result;
  } catch (error) {
    if (error instanceof InventoryError) return formError(error.message);
    throw error;
  }

  redirect(`/production/boms/${savedId}`);
}

export async function setBomActive(bomId: number, active: boolean): Promise<FormState> {
  const user = await requirePermission("bom.manage");
  const id = idSchema.parse(bomId);
  try {
    const result = await transaction(async (tx): Promise<FormState> => {
      const bom = await tx.get<{ item_id: number; version: number; sku: string }>(
        "SELECT h.item_id, h.version, i.sku FROM bom_headers h JOIN items i ON i.id = h.item_id WHERE h.id = ?",
        [id],
      );
      if (!bom) return formError("Bill of materials not found.");
      if (active) {
        await activateWithinTx(tx, id, bom.item_id);
      } else {
        await tx.run("UPDATE bom_headers SET is_active = 0, updated_at = ? WHERE id = ?", [nowIso(), id]);
      }
      await writeAudit({ userId: user.id, action: active ? "bom.activate" : "bom.deactivate", entityType: "bom", entityId: id, details: { sku: bom.sku, version: bom.version } }, tx);
      return {
        status: "success",
        message: active ? `${bom.sku} v${bom.version} is now the active recipe.` : `${bom.sku} v${bom.version} deactivated.`,
      };
    });
    if (result.status === "success") refresh();
    return result;
  } catch (error) {
    if (error instanceof InventoryError) return formError(error.message);
    throw error;
  }
}
