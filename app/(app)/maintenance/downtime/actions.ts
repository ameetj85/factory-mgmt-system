"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/dal";
import { nowIso, transaction } from "@/lib/db/client";
import { formError, idSchema, optionalText, validationError, type FormState } from "@/lib/forms";
import { claimIdempotencyKey, InventoryError } from "@/lib/inventory/service";
import { DOWNTIME_REASON_VALUES, downtimeReasonLabel, isPlannedReason } from "@/lib/maintenance/constants";
import { overlappingDowntime } from "@/lib/maintenance/service";
import { loadWorkOrder, startRunWithin } from "@/lib/production/service";

async function run(fn: () => Promise<FormState>): Promise<FormState> {
  try {
    const result = await fn();
    if (result.status === "success") refresh();
    return result;
  } catch (error) {
    if (error instanceof InventoryError) return formError(error.message);
    throw error;
  }
}

const startSchema = z.object({
  workstationId: idSchema,
  reasonCode: z.enum(DOWNTIME_REASON_VALUES),
  notes: z.string().max(500).optional(),
  key: z.uuid(),
});

/**
 * Flags a machine as stopped right now. Any open production run on it is paused at the same instant,
 * so run time and stop time never overlap.
 */
export async function startDowntime(input: z.input<typeof startSchema>): Promise<FormState> {
  const user = await requirePermission("downtime.report");
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return formError("Choose a reason for the stop.");
  const { workstationId, reasonCode, key } = parsed.data;
  const notes = parsed.data.notes?.trim() || null;

  return run(() =>
    transaction(async (tx): Promise<FormState> => {
      if (!(await claimIdempotencyKey(tx, key, "downtime.start", user.id))) return { status: "success", message: "Already recorded." };
      const ws = await tx.get<{ code: string; is_active: number }>("SELECT code, is_active FROM workstations WHERE id = ?", [workstationId]);
      if (!ws?.is_active) return formError("Workstation not found.");
      const open = await tx.get<{ id: number }>("SELECT id FROM downtime_logs WHERE workstation_id = ? AND ended_at IS NULL", [workstationId]);
      if (open) return formError(`${ws.code} is already stopped (event #${open.id}). Resolve it first.`);

      const now = nowIso();
      const openRun = await tx.get<{ id: number }>("SELECT id FROM production_logs WHERE workstation_id = ? AND end_time IS NULL", [workstationId]);
      if (openRun) await tx.run("UPDATE production_logs SET end_time = ?, end_reason = 'PAUSED' WHERE id = ?", [now, openRun.id]);

      const planned = isPlannedReason(reasonCode);
      const { lastID } = await tx.run(
        `INSERT INTO downtime_logs (workstation_id, reason_code, is_planned, started_at, notes, reported_by, paused_run_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [workstationId, reasonCode, planned ? 1 : 0, now, notes, user.id, openRun?.id ?? null],
      );
      await tx.run("UPDATE workstations SET status = ?, updated_at = ? WHERE id = ?", [planned ? "MAINTENANCE" : "DOWN", now, workstationId]);
      await writeAudit(
        { userId: user.id, action: "downtime.start", entityType: "downtime", entityId: lastID, details: { workstation: ws.code, reason: reasonCode, pausedRunId: openRun?.id ?? null } },
        tx,
      );
      return {
        status: "success",
        message: `${ws.code} stopped: ${downtimeReasonLabel(reasonCode)}.${openRun ? " The active run was paused." : ""}`,
      };
    }),
  );
}

const resolveSchema = z.object({
  downtimeId: idSchema,
  resolutionNotes: z.string().max(500).optional(),
  resumeRun: z.boolean().default(false),
  key: z.uuid(),
});

/** Ends a stoppage. Optionally resumes the run it paused as a fresh run segment, keeping intervals clean. */
export async function resolveDowntime(input: z.input<typeof resolveSchema>): Promise<FormState> {
  const user = await requirePermission("downtime.report");
  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) return formError("Invalid request.");
  const { downtimeId, resumeRun, key } = parsed.data;
  const notes = parsed.data.resolutionNotes?.trim() || null;

  return run(() =>
    transaction(async (tx): Promise<FormState> => {
      if (!(await claimIdempotencyKey(tx, key, "downtime.resolve", user.id))) return { status: "success", message: "Already recorded." };
      const d = await tx.get<{ id: number; workstation_id: number; ended_at: string | null; paused_run_id: number | null; code: string }>(
        "SELECT d.id, d.workstation_id, d.ended_at, d.paused_run_id, w.code FROM downtime_logs d JOIN workstations w ON w.id = d.workstation_id WHERE d.id = ?",
        [downtimeId],
      );
      if (!d) return formError("Downtime event not found.");
      if (d.ended_at) return formError("This stoppage has already been resolved.");

      const now = nowIso();
      await tx.run("UPDATE downtime_logs SET ended_at = ?, resolved_by = ?, resolution_notes = ? WHERE id = ?", [now, user.id, notes, d.id]);
      await tx.run("UPDATE workstations SET status = 'IDLE', updated_at = ? WHERE id = ?", [now, d.workstation_id]);

      let resumed: string | null = null;
      if (resumeRun && d.paused_run_id) {
        const paused = await tx.get<{ work_order_id: number }>("SELECT work_order_id FROM production_logs WHERE id = ?", [d.paused_run_id]);
        const wo = paused ? await loadWorkOrder(tx, paused.work_order_id) : undefined;
        if (wo && (wo.status === "RELEASED" || wo.status === "IN_PROGRESS")) {
          await startRunWithin(tx, wo, d.workstation_id, "RUN", user.id);
          resumed = wo.wo_number;
        }
      }

      await writeAudit(
        { userId: user.id, action: "downtime.resolve", entityType: "downtime", entityId: d.id, details: { workstation: d.code, resumed } },
        tx,
      );
      return { status: "success", message: resumed ? `${d.code} is back up. Production resumed on ${resumed}.` : `${d.code} is back up.` };
    }),
  );
}

const isoSchema = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date and time.")
  .transform((v) => nowIso(new Date(v)));

const pastSchema = z
  .object({
    workstationId: idSchema,
    reasonCode: z.enum(DOWNTIME_REASON_VALUES, "Choose a reason."),
    isPlanned: z.string().optional().transform((v) => v === "true"),
    startedAt: isoSchema,
    endedAt: isoSchema,
    notes: optionalText(500),
  })
  .refine((d) => d.endedAt > d.startedAt, { message: "The end must be after the start.", path: ["endedAt"] })
  .refine((d) => Date.parse(d.endedAt) <= Date.now() + 60_000, { message: "The end can't be in the future.", path: ["endedAt"] })
  .refine((d) => Date.parse(d.endedAt) - Date.parse(d.startedAt) <= 14 * 86_400_000, { message: "A single event can't exceed 14 days.", path: ["endedAt"] });

/** Supervisors record stoppages that weren't logged live. Rejects anything overlapping an existing event. */
export async function logPastDowntime(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("maintenance.manage");
  const parsed = pastSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const d = parsed.data;

  return run(() =>
    transaction(async (tx): Promise<FormState> => {
      const ws = await tx.get<{ code: string }>("SELECT code FROM workstations WHERE id = ?", [d.workstationId]);
      if (!ws) return formError("Workstation not found.");
      const conflict = await overlappingDowntime(tx, d.workstationId, d.startedAt, d.endedAt);
      if (conflict) {
        return {
          status: "error",
          message: `This overlaps downtime event #${conflict} on ${ws.code}. Overlapping stops would double-count lost time.`,
          fieldErrors: { startedAt: ["Overlaps an existing event."] },
        };
      }
      const { lastID } = await tx.run(
        `INSERT INTO downtime_logs (workstation_id, reason_code, is_planned, started_at, ended_at, notes, reported_by, resolved_by, is_retroactive)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [d.workstationId, d.reasonCode, d.isPlanned ? 1 : 0, d.startedAt, d.endedAt, d.notes, user.id, user.id],
      );
      await writeAudit(
        { userId: user.id, action: "downtime.log_past", entityType: "downtime", entityId: lastID, details: { workstation: ws.code, reason: d.reasonCode, from: d.startedAt, to: d.endedAt, planned: d.isPlanned } },
        tx,
      );
      return { status: "success", message: `Downtime recorded on ${ws.code}.` };
    }),
  );
}
