"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/dal";
import { nowIso, transaction, type Executor } from "@/lib/db/client";
import { formError, idSchema, optionalText, qtyMilliSchema, validationError, type FormState } from "@/lib/forms";
import { nextDocumentNumber } from "@/lib/inventory/service";
import { PRIORITIES, WO_STATUS_LABELS, type WoStatus } from "@/lib/production/constants";

const dueDateSchema = z
  .string()
  .default("")
  .transform((v, ctx) => {
    const value = v.trim();
    if (value === "") return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
      ctx.addIssue({ code: "custom", message: "Enter a valid date." });
      return z.NEVER;
    }
    return value;
  });

const workOrderSchema = z.object({
  itemId: idSchema,
  qty: qtyMilliSchema({ label: "quantity" }),
  dueDate: dueDateSchema,
  priority: z.enum(PRIORITIES, "Choose a priority."),
  workstationId: idSchema,
  materialLocationId: idSchema,
  outputLocationId: idSchema,
  notes: optionalText(500),
});

/** Ideal cycle time for the work order: the routing step on its workstation, if the recipe has one. */
async function cycleTimeFor(tx: Executor, bomId: number, workstationId: number): Promise<number | null> {
  const step = await tx.get<{ ms: number }>(
    "SELECT MAX(ideal_cycle_time_ms) AS ms FROM bom_routing_steps WHERE bom_id = ? AND workstation_id = ?",
    [bomId, workstationId],
  );
  return step?.ms ?? null;
}

async function validateRefs(tx: Executor, w: z.infer<typeof workOrderSchema>): Promise<FormState | null> {
  const ws = await tx.get<{ is_active: number }>("SELECT is_active FROM workstations WHERE id = ?", [w.workstationId]);
  if (!ws?.is_active) return { status: "error", message: "Please correct the highlighted fields.", fieldErrors: { workstationId: ["Choose an active workstation."] } };
  const locs = await tx.get<{ n: number }>("SELECT COUNT(DISTINCT id) AS n FROM locations WHERE is_active = 1 AND id IN (?, ?)", [
    w.materialLocationId,
    w.outputLocationId,
  ]);
  const expected = w.materialLocationId === w.outputLocationId ? 1 : 2;
  if ((locs?.n ?? 0) !== expected) return formError("One of the selected locations is no longer active.");
  return null;
}

export async function createWorkOrder(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("workorders.manage");
  const parsed = workOrderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const w = parsed.data;
  const releaseNow = formData.get("releaseNow") === "true";

  const result = await transaction(async (tx): Promise<FormState | number> => {
    const bom = await tx.get<{ id: number; sku: string }>(
      "SELECT h.id, i.sku FROM bom_headers h JOIN items i ON i.id = h.item_id WHERE h.item_id = ? AND h.is_active = 1 AND i.is_active = 1",
      [w.itemId],
    );
    if (!bom) {
      return { status: "error", message: "Please correct the highlighted fields.", fieldErrors: { itemId: ["This item has no active bill of materials."] } };
    }
    const invalid = await validateRefs(tx, w);
    if (invalid) return invalid;

    const woNumber = await nextDocumentNumber(tx, "work_orders", "wo_number", "WO");
    const now = nowIso();
    const { lastID } = await tx.run(
      `INSERT INTO work_orders (wo_number, bom_id, item_id, workstation_id, qty_target_milli, status, priority, due_date,
                                ideal_cycle_time_ms, material_location_id, output_location_id, notes, created_by, released_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        woNumber,
        bom.id,
        w.itemId,
        w.workstationId,
        w.qty,
        releaseNow ? "RELEASED" : "DRAFT",
        w.priority,
        w.dueDate,
        await cycleTimeFor(tx, bom.id, w.workstationId),
        w.materialLocationId,
        w.outputLocationId,
        w.notes,
        user.id,
        releaseNow ? now : null,
      ],
    );
    await writeAudit(
      { userId: user.id, action: "work_order.create", entityType: "work_order", entityId: lastID, details: { woNumber, sku: bom.sku, qty_milli: w.qty, released: releaseNow } },
      tx,
    );
    return lastID;
  });

  if (typeof result !== "number") return result;
  redirect(`/production/work-orders/${result}`);
}

export async function updateWorkOrder(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("workorders.manage");
  const parsed = workOrderSchema.omit({ itemId: true }).extend({ id: idSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const { id, ...w } = parsed.data;

  const result = await transaction(async (tx): Promise<FormState> => {
    const wo = await tx.get<{ status: WoStatus; bom_id: number; item_id: number; workstation_id: number; wo_number: string }>(
      "SELECT status, bom_id, item_id, workstation_id, wo_number FROM work_orders WHERE id = ?",
      [id],
    );
    if (!wo) return formError("Work order not found.");
    if (!["DRAFT", "RELEASED", "ON_HOLD"].includes(wo.status)) {
      return formError(`A work order that is ${WO_STATUS_LABELS[wo.status].toLowerCase()} can't be edited.`);
    }
    const ran = await tx.get("SELECT id FROM production_logs WHERE work_order_id = ? LIMIT 1", [id]);
    if (ran && w.workstationId !== wo.workstation_id) {
      return { status: "error", message: "Please correct the highlighted fields.", fieldErrors: { workstationId: ["Production has started; the workstation can't change."] } };
    }
    const invalid = await validateRefs(tx, { ...w, itemId: wo.item_id });
    if (invalid) return invalid;

    await tx.run(
      `UPDATE work_orders SET qty_target_milli = ?, due_date = ?, priority = ?, workstation_id = ?, ideal_cycle_time_ms = ?,
              material_location_id = ?, output_location_id = ?, notes = ?, updated_at = ? WHERE id = ?`,
      [w.qty, w.dueDate, w.priority, w.workstationId, await cycleTimeFor(tx, wo.bom_id, w.workstationId), w.materialLocationId, w.outputLocationId, w.notes, nowIso(), id],
    );
    await writeAudit({ userId: user.id, action: "work_order.update", entityType: "work_order", entityId: id, details: { qty_milli: w.qty, due: w.dueDate, priority: w.priority } }, tx);
    return { status: "success", message: `${wo.wo_number} updated.` };
  });

  if (result.status === "success") refresh();
  return result;
}

export type WoTransition = "release" | "hold" | "resume" | "cancel" | "complete";

/** Lifecycle moves a manager can make. Starting and finishing runs happens on the shop floor. */
export async function transitionWorkOrder(workOrderId: number, transition: WoTransition, reason?: string): Promise<FormState> {
  const user = await requirePermission("workorders.manage");
  const id = idSchema.parse(workOrderId);
  const note = typeof reason === "string" ? reason.trim().slice(0, 300) || null : null;

  const result = await transaction(async (tx): Promise<FormState> => {
    const wo = await tx.get<{ status: WoStatus; wo_number: string; started_at: string | null }>(
      "SELECT status, wo_number, started_at FROM work_orders WHERE id = ?",
      [id],
    );
    if (!wo) return formError("Work order not found.");
    const openRun = await tx.get<{ id: number }>("SELECT id FROM production_logs WHERE work_order_id = ? AND end_time IS NULL", [id]);
    const now = nowIso();
    const refuse = (msg: string): FormState => formError(msg);

    let next: WoStatus;
    let extra = "";
    const params: (string | number | null)[] = [];
    switch (transition) {
      case "release":
        if (wo.status !== "DRAFT") return refuse("Only draft work orders can be released.");
        next = "RELEASED";
        extra = ", released_at = ?";
        params.push(now);
        break;
      case "hold":
        if (wo.status !== "RELEASED" && wo.status !== "IN_PROGRESS") return refuse("Only released or in-progress work orders can be put on hold.");
        if (openRun) return refuse("An operator is running this work order. Pause the run on the shop floor first.");
        next = "ON_HOLD";
        break;
      case "resume":
        if (wo.status !== "ON_HOLD") return refuse("This work order isn't on hold.");
        next = wo.started_at ? "IN_PROGRESS" : "RELEASED";
        break;
      case "cancel": {
        if (!["DRAFT", "RELEASED", "ON_HOLD"].includes(wo.status)) return refuse("Only work orders that haven't started can be cancelled.");
        const ran = await tx.get("SELECT id FROM production_logs WHERE work_order_id = ? LIMIT 1", [id]);
        if (ran) return refuse("Production has been logged against this work order, so it can't be cancelled. Complete it instead.");
        next = "CANCELLED";
        break;
      }
      case "complete":
        if (wo.status !== "IN_PROGRESS" && wo.status !== "ON_HOLD") return refuse("Only work orders that have started can be completed.");
        if (openRun) return refuse("An operator is running this work order. Finish the run on the shop floor first.");
        next = "COMPLETED";
        extra = ", completed_at = ?";
        params.push(now);
        break;
      default:
        return refuse("Unknown action.");
    }

    await tx.run(`UPDATE work_orders SET status = ?, updated_at = ?${extra} WHERE id = ?`, [next, now, ...params, id]);
    await writeAudit(
      { userId: user.id, action: `work_order.${transition}`, entityType: "work_order", entityId: id, details: { from: wo.status, to: next, note } },
      tx,
    );
    return { status: "success", message: `${wo.wo_number} is now ${WO_STATUS_LABELS[next].toLowerCase()}.` };
  });

  if (result.status === "success") refresh();
  return result;
}
