"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/dal";
import { nowIso, transaction } from "@/lib/db/client";
import { formError, idSchema, optionalText, validationError, type FormState } from "@/lib/forms";
import { claimIdempotencyKey } from "@/lib/inventory/service";
import { overlappingDowntime, runtimeSeconds } from "@/lib/maintenance/service";

const positiveInt = (label: string) =>
  z
    .string()
    .default("")
    .transform((v, ctx) => {
      const value = v.trim();
      if (value === "") return null;
      if (!/^\d+$/.test(value) || Number(value) <= 0) {
        ctx.addIssue({ code: "custom", message: `Enter a whole number of ${label}.` });
        return z.NEVER;
      }
      return Number(value);
    });

const planSchema = z
  .object({
    workstationId: idSchema,
    title: z.string().trim().min(3, "Describe the task.").max(120, "Use at most 120 characters."),
    instructions: optionalText(2000),
    triggerType: z.enum(["CALENDAR", "RUNTIME"], "Choose how it's scheduled."),
    intervalDays: positiveInt("days"),
    intervalHours: positiveInt("hours"),
    estimatedMinutes: positiveInt("minutes"),
  })
  .superRefine((p, ctx) => {
    if (p.triggerType === "CALENDAR" && !p.intervalDays) ctx.addIssue({ code: "custom", message: "How many days between services?", path: ["intervalDays"] });
    if (p.triggerType === "RUNTIME" && !p.intervalHours) ctx.addIssue({ code: "custom", message: "How many runtime hours between services?", path: ["intervalHours"] });
  });

export async function savePmPlan(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("maintenance.manage");
  const idRaw = formData.get("id");
  const planId = idRaw ? idSchema.parse(idRaw) : null;
  const parsed = planSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const p = parsed.data;
  const intervalDays = p.triggerType === "CALENDAR" ? p.intervalDays : null;
  const intervalHours = p.triggerType === "RUNTIME" ? p.intervalHours : null;

  const result = await transaction(async (tx): Promise<FormState> => {
    const ws = await tx.get<{ code: string }>("SELECT code FROM workstations WHERE id = ? AND is_active = 1", [p.workstationId]);
    if (!ws) return formError("Choose an active machine.");

    if (planId) {
      const before = await tx.get<{ trigger_type: string; workstation_id: number }>("SELECT trigger_type, workstation_id FROM pm_plans WHERE id = ?", [planId]);
      if (!before) return formError("Plan not found.");
      if (before.trigger_type !== p.triggerType || before.workstation_id !== p.workstationId) {
        return formError("A plan's machine and trigger type can't change. Create a new plan instead.");
      }
      await tx.run(
        `UPDATE pm_plans SET title = ?, instructions = ?, interval_days = ?, interval_runtime_hours = ?, estimated_minutes = ?, updated_at = ?
          WHERE id = ?`,
        [p.title, p.instructions, intervalDays, intervalHours, p.estimatedMinutes, nowIso(), planId],
      );
      await writeAudit({ userId: user.id, action: "maintenance.plan_update", entityType: "pm_plan", entityId: planId, details: { title: p.title } }, tx);
      return { status: "success", message: "Maintenance plan updated." };
    }

    const runtime = (await runtimeSeconds(tx, p.workstationId)).get(p.workstationId) ?? 0;
    const { lastID } = await tx.run(
      `INSERT INTO pm_plans (workstation_id, title, instructions, trigger_type, interval_days, interval_runtime_hours, baseline_at,
                             baseline_runtime_seconds, estimated_minutes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [p.workstationId, p.title, p.instructions, p.triggerType, intervalDays, intervalHours, nowIso(), runtime, p.estimatedMinutes, user.id],
    );
    await writeAudit(
      { userId: user.id, action: "maintenance.plan_create", entityType: "pm_plan", entityId: lastID, details: { workstation: ws.code, title: p.title, trigger: p.triggerType } },
      tx,
    );
    return { status: "success", message: `Plan "${p.title}" added for ${ws.code}.` };
  });

  if (result.status === "success") refresh();
  return result;
}

export async function setPmPlanActive(planId: number, active: boolean): Promise<FormState> {
  const user = await requirePermission("maintenance.manage");
  const id = idSchema.parse(planId);
  const result = await transaction(async (tx): Promise<FormState> => {
    const plan = await tx.get<{ title: string }>("SELECT title FROM pm_plans WHERE id = ?", [id]);
    if (!plan) return formError("Plan not found.");
    await tx.run("UPDATE pm_plans SET is_active = ?, updated_at = ? WHERE id = ?", [active ? 1 : 0, nowIso(), id]);
    await writeAudit({ userId: user.id, action: active ? "maintenance.plan_resume" : "maintenance.plan_pause", entityType: "pm_plan", entityId: id }, tx);
    return { status: "success", message: `"${plan.title}" ${active ? "resumed" : "paused"}.` };
  });
  if (result.status === "success") refresh();
  return result;
}

const completeSchema = z.object({
  planId: idSchema,
  notes: z.string().max(1000).optional(),
  downtimeMinutes: z.number().int().min(0).max(24 * 60).default(0),
  key: z.uuid(),
});

/**
 * Records a completed service and restarts the plan's interval from now. Optionally logs the time the
 * machine was out of service as planned maintenance downtime ending now.
 */
export async function completePm(input: z.input<typeof completeSchema>): Promise<FormState> {
  const user = await requirePermission("maintenance.manage");
  const parsed = completeSchema.safeParse(input);
  if (!parsed.success) return formError("Enter downtime as whole minutes (up to 24 hours).");
  const { planId, downtimeMinutes, key } = parsed.data;
  const notes = parsed.data.notes?.trim() || null;

  const result = await transaction(async (tx): Promise<FormState> => {
    if (!(await claimIdempotencyKey(tx, key, "maintenance.complete", user.id))) return { status: "success", message: "Already recorded." };
    const plan = await tx.get<{ id: number; workstation_id: number; title: string; is_active: number }>(
      "SELECT id, workstation_id, title, is_active FROM pm_plans WHERE id = ?",
      [planId],
    );
    if (!plan) return formError("Plan not found.");
    if (!plan.is_active) return formError("This plan is paused. Resume it before recording a service.");

    const now = new Date();
    const nowStr = nowIso(now);
    let downtimeId: number | null = null;
    if (downtimeMinutes > 0) {
      const start = nowIso(new Date(now.getTime() - downtimeMinutes * 60_000));
      const conflict = await overlappingDowntime(tx, plan.workstation_id, start, nowStr);
      if (conflict) return formError(`That period overlaps downtime event #${conflict}. Lower the minutes or leave it at 0.`);
      ({ lastID: downtimeId } = await tx.run(
        `INSERT INTO downtime_logs (workstation_id, reason_code, is_planned, started_at, ended_at, notes, reported_by, resolved_by, is_retroactive)
         VALUES (?, 'PLANNED_MAINTENANCE', 1, ?, ?, ?, ?, ?, 1)`,
        [plan.workstation_id, start, nowStr, `PM: ${plan.title}`, user.id, user.id],
      ));
    }

    const runtime = (await runtimeSeconds(tx, plan.workstation_id)).get(plan.workstation_id) ?? 0;
    const { lastID } = await tx.run(
      "INSERT INTO pm_completions (plan_id, completed_by, completed_at, runtime_seconds, notes, downtime_id) VALUES (?, ?, ?, ?, ?, ?)",
      [plan.id, user.id, nowStr, runtime, notes, downtimeId],
    );
    await tx.run("UPDATE pm_plans SET baseline_at = ?, baseline_runtime_seconds = ?, updated_at = ? WHERE id = ?", [nowStr, runtime, nowStr, plan.id]);
    await writeAudit(
      { userId: user.id, action: "maintenance.complete", entityType: "pm_plan", entityId: plan.id, details: { completionId: lastID, downtimeMinutes } },
      tx,
    );
    return { status: "success", message: `"${plan.title}" recorded as done. The next interval starts now.` };
  });

  if (result.status === "success") refresh();
  return result;
}
