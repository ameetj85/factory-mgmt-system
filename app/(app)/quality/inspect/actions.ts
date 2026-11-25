"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/dal";
import { transaction } from "@/lib/db/client";
import { formError, idSchema, type FormState } from "@/lib/forms";
import { claimIdempotencyKey, nextDocumentNumber } from "@/lib/inventory/service";
import { formatMeasure, parseSignedMilli, withinLimits } from "@/lib/quality/constants";
import { getChecklist } from "@/lib/quality/service";

const inspectionSchema = z.object({
  templateId: idSchema,
  itemId: idSchema,
  batchNumber: z.string().trim().min(1, "Choose the lot.").max(60).transform((v) => v.toUpperCase()),
  workOrderId: z.number().int().positive().nullable().default(null),
  receiptId: z.number().int().positive().nullable().default(null),
  sampleSize: z.number().int().min(1).max(100000).default(1),
  notes: z.string().max(1000).default(""),
  placeHold: z.boolean().default(false),
  results: z.array(
    z.object({
      criterionId: z.number().int().positive(),
      verdict: z.enum(["pass", "fail"]).nullable().default(null),
      value: z.string().default(""),
      note: z.string().max(300).default(""),
    }),
  ),
  key: z.uuid(),
});

export type InspectionInput = z.input<typeof inspectionSchema>;

/**
 * Records an inspection. Pass/fail for measurements is re-judged here against the checklist's limits,
 * never trusted from the client. A failed critical check always puts the lot on hold; other failures
 * hold it only when the inspector asks.
 */
export async function recordInspection(input: InspectionInput): Promise<FormState & { inspectionId?: number }> {
  const user = await requirePermission("quality.inspect");
  const parsed = inspectionSchema.safeParse(input);
  if (!parsed.success) return formError(parsed.error.issues[0]?.message ?? "Check the inspection.");
  const i = parsed.data;

  const result = await transaction(async (tx): Promise<FormState & { inspectionId?: number }> => {
    if (!(await claimIdempotencyKey(tx, i.key, "quality.inspect", user.id))) return { status: "success", message: "Already recorded." };
    const checklist = await getChecklist(i.templateId, tx);
    if (!checklist || !checklist.is_active) return formError("This checklist is no longer active.");
    if (checklist.item_id && checklist.item_id !== i.itemId) return formError("This checklist is for a different item.");
    const item = await tx.get<{ sku: string }>("SELECT sku FROM items WHERE id = ?", [i.itemId]);
    if (!item) return formError("Item not found.");

    if (i.workOrderId) {
      const wo = await tx.get<{ wo_number: string; item_id: number }>("SELECT wo_number, item_id FROM work_orders WHERE id = ?", [i.workOrderId]);
      if (!wo || wo.item_id !== i.itemId || wo.wo_number !== i.batchNumber) return formError("The lot doesn't match the work order.");
    } else {
      const exists = await tx.get("SELECT id FROM inventory_txns WHERE item_id = ? AND batch_number = ? LIMIT 1", [i.itemId, i.batchNumber]);
      if (!exists) return formError(`No lot ${i.batchNumber} of ${item.sku} has been recorded.`);
    }

    const byId = new Map(i.results.map((r) => [r.criterionId, r]));
    const evaluated = [];
    for (const c of checklist.criteria) {
      const r = byId.get(c.id);
      if (c.criterion_type === "PASS_FAIL") {
        if (!r?.verdict) return formError(`Mark "${c.label}" as pass or fail.`);
        evaluated.push({ c, value: null as number | null, passed: r.verdict === "pass", note: r.note.trim() || null });
      } else {
        const value = r ? parseSignedMilli(r.value) : null;
        if (value === null) return formError(`Enter a measurement for "${c.label}".`);
        evaluated.push({ c, value, passed: withinLimits(value, c.min_milli, c.max_milli), note: r?.note.trim() || null });
      }
    }

    const failed = evaluated.filter((e) => !e.passed);
    const criticalFailed = failed.some((e) => e.c.is_critical);
    const outcome = failed.length ? "FAIL" : "PASS";
    const number = await nextDocumentNumber(tx, "inspections", "inspection_number", "INS");
    const { lastID } = await tx.run(
      `INSERT INTO inspections (inspection_number, template_id, template_name, stage, item_id, batch_number, work_order_id, receipt_id,
                                sample_size, result, inspector_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [number, checklist.id, checklist.name, checklist.stage, i.itemId, i.batchNumber, i.workOrderId, i.receiptId, i.sampleSize, outcome, user.id, i.notes.trim() || null],
    );
    for (const e of evaluated) {
      await tx.run(
        `INSERT INTO inspection_results (inspection_id, criterion_id, label, criterion_type, unit, target_milli, min_milli, max_milli,
                                         is_critical, value_milli, passed, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [lastID, e.c.id, e.c.label, e.c.criterion_type, e.c.unit, e.c.target_milli, e.c.min_milli, e.c.max_milli, e.c.is_critical, e.value, e.passed ? 1 : 0, e.note],
      );
    }

    let held = false;
    if (outcome === "FAIL" && (criticalFailed || i.placeHold)) {
      const existing = await tx.get("SELECT id FROM lot_holds WHERE item_id = ? AND batch_number = ? AND status = 'ACTIVE'", [i.itemId, i.batchNumber]);
      if (!existing) {
        const first = failed[0];
        const reason = `Failed ${number}: ${first.c.label}${first.value !== null ? ` (${formatMeasure(first.value, first.c.unit)})` : ""}${failed.length > 1 ? ` +${failed.length - 1} more` : ""}`;
        await tx.run("INSERT INTO lot_holds (item_id, batch_number, reason, inspection_id, placed_by) VALUES (?, ?, ?, ?, ?)", [
          i.itemId,
          i.batchNumber,
          reason.slice(0, 200),
          lastID,
          user.id,
        ]);
      }
      held = true;
    }

    await writeAudit(
      { userId: user.id, action: "quality.inspection", entityType: "inspection", entityId: lastID, details: { number, sku: item.sku, lot: i.batchNumber, result: outcome, held } },
      tx,
    );
    return {
      status: "success",
      inspectionId: lastID,
      message:
        outcome === "PASS"
          ? `${number}: lot ${i.batchNumber} passed.`
          : `${number}: lot ${i.batchNumber} failed ${failed.length} check${failed.length === 1 ? "" : "s"}.${held ? " The lot is now on quality hold." : ""}`,
    };
  });

  if (result.status === "success") refresh();
  return result;
}
