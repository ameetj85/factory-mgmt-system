"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/dal";
import { nowIso, transaction } from "@/lib/db/client";
import { formError, idSchema, optionalText, validationError, type FormState } from "@/lib/forms";
import { factoryTimeZone } from "@/lib/maintenance/service";
import { addDays, localDate } from "@/lib/maintenance/shift-math";

function done(result: FormState): FormState {
  if (result.status === "success") refresh();
  return result;
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.");

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function setFactoryTimeZone(timeZone: string): Promise<FormState> {
  const user = await requirePermission("shifts.manage");
  if (!isValidTimeZone(timeZone)) return formError("That isn't a recognised time zone.");
  const result = await transaction(async (tx): Promise<FormState> => {
    const before = await factoryTimeZone(tx);
    await tx.run("UPDATE app_settings SET value = ?, updated_at = ? WHERE key = 'factory_timezone'", [timeZone, nowIso()]);
    await writeAudit({ userId: user.id, action: "shift.timezone", entityType: "setting", entityId: "factory_timezone", details: { from: before, to: timeZone } }, tx);
    return { status: "success", message: `Shift times now use ${timeZone}.` };
  });
  return done(result);
}

const breakSchema = z.object({
  name: z.string().trim().min(1, "Name the break.").max(40),
  offsetMinutes: z.coerce.number().int("Whole minutes.").min(0, "Can't be negative."),
  durationMinutes: z.coerce.number().int("Whole minutes.").min(1, "At least 1 minute."),
});

const templateSchema = z.object({
  name: z.string().trim().min(2, "Name the shift.").max(40, "Use at most 40 characters."),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour time, e.g. 06:00."),
  durationMinutes: z.coerce.number().int().min(15, "At least 15 minutes.").max(1440, "At most 24 hours."),
});

export async function saveShiftTemplate(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("shifts.manage");
  const parsed = templateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const t = parsed.data;
  const idRaw = formData.get("id");
  const id = idRaw ? idSchema.parse(idRaw) : null;

  let breaksRaw: unknown = [];
  try {
    breaksRaw = JSON.parse(String(formData.get("breaks") ?? "[]"));
  } catch {
    // fall through to validation
  }
  const breaks = z.array(breakSchema).max(10).safeParse(breaksRaw);
  if (!breaks.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of breaks.error.issues) (fieldErrors[`breaks.${issue.path.join(".")}`] ??= []).push(issue.message);
    return { status: "error", message: "Check the breaks.", fieldErrors };
  }
  const outside = breaks.data.findIndex((b) => b.offsetMinutes + b.durationMinutes > t.durationMinutes);
  if (outside >= 0) {
    return { status: "error", message: "Breaks must fall within the shift.", fieldErrors: { [`breaks.${outside}.offsetMinutes`]: ["Ends after the shift does."] } };
  }

  const result = await transaction(async (tx): Promise<FormState> => {
    const clash = await tx.get("SELECT id FROM shift_templates WHERE name = ? AND id <> ?", [t.name, id ?? 0]);
    if (clash) return { status: "error", message: "Please correct the highlighted fields.", fieldErrors: { name: ["A shift with this name exists."] } };
    let templateId = id;
    if (templateId) {
      await tx.run("UPDATE shift_templates SET name = ?, start_time = ?, duration_minutes = ? WHERE id = ?", [t.name, t.startTime, t.durationMinutes, templateId]);
      await tx.run("DELETE FROM shift_breaks WHERE shift_template_id = ?", [templateId]);
    } else {
      ({ lastID: templateId } = await tx.run("INSERT INTO shift_templates (name, start_time, duration_minutes) VALUES (?, ?, ?)", [t.name, t.startTime, t.durationMinutes]));
    }
    for (const b of breaks.data) {
      await tx.run("INSERT INTO shift_breaks (shift_template_id, name, offset_minutes, duration_minutes) VALUES (?, ?, ?, ?)", [
        templateId,
        b.name,
        b.offsetMinutes,
        b.durationMinutes,
      ]);
    }
    await writeAudit(
      { userId: user.id, action: id ? "shift.template_update" : "shift.template_create", entityType: "shift_template", entityId: templateId!, details: { ...t, breaks: breaks.data.length } },
      tx,
    );
    return { status: "success", message: `Shift "${t.name}" saved.` };
  });
  return done(result);
}

export async function setShiftTemplateActive(templateId: number, active: boolean): Promise<FormState> {
  const user = await requirePermission("shifts.manage");
  const id = idSchema.parse(templateId);
  const result = await transaction(async (tx): Promise<FormState> => {
    const t = await tx.get<{ name: string }>("SELECT name FROM shift_templates WHERE id = ?", [id]);
    if (!t) return formError("Shift not found.");
    await tx.run("UPDATE shift_templates SET is_active = ? WHERE id = ?", [active ? 1 : 0, id]);
    await writeAudit({ userId: user.id, action: active ? "shift.template_activate" : "shift.template_deactivate", entityType: "shift_template", entityId: id }, tx);
    return { status: "success", message: `"${t.name}" ${active ? "reactivated" : "deactivated"}. ${active ? "" : "It no longer counts toward planned time."}`.trim() };
  });
  return done(result);
}

const assignSchema = z.object({
  workstationIds: z.array(idSchema).min(1, "Choose at least one machine."),
  templateId: idSchema,
  days: z.array(z.number().int().min(0).max(6)).min(1, "Choose at least one day."),
  effectiveFrom: dateSchema,
  effectiveTo: dateSchema.nullable(),
});

export async function assignShift(input: z.input<typeof assignSchema>): Promise<FormState> {
  const user = await requirePermission("shifts.manage");
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return formError(parsed.error.issues[0]?.message ?? "Check the assignment.");
  const a = parsed.data;
  if (a.effectiveTo && a.effectiveTo < a.effectiveFrom) return formError("The end date must be on or after the start date.");

  const result = await transaction(async (tx): Promise<FormState> => {
    const t = await tx.get<{ name: string }>("SELECT name FROM shift_templates WHERE id = ? AND is_active = 1", [a.templateId]);
    if (!t) return formError("Choose an active shift.");
    let added = 0;
    let skipped = 0;
    for (const ws of a.workstationIds) {
      for (const day of a.days) {
        // Skip if this shift is already assigned to this machine on this weekday for an overlapping period.
        const dup = await tx.get(
          `SELECT id FROM workstation_schedules
            WHERE workstation_id = ? AND shift_template_id = ? AND day_of_week = ?
              AND effective_from <= COALESCE(?, '9999-12-31') AND COALESCE(effective_to, '9999-12-31') >= ?`,
          [ws, a.templateId, day, a.effectiveTo, a.effectiveFrom],
        );
        if (dup) {
          skipped++;
          continue;
        }
        await tx.run(
          "INSERT INTO workstation_schedules (workstation_id, shift_template_id, day_of_week, effective_from, effective_to) VALUES (?, ?, ?, ?, ?)",
          [ws, a.templateId, day, a.effectiveFrom, a.effectiveTo],
        );
        added++;
      }
    }
    await writeAudit(
      { userId: user.id, action: "shift.assign", entityType: "shift_template", entityId: a.templateId, details: { workstations: a.workstationIds, days: a.days, from: a.effectiveFrom, to: a.effectiveTo, added, skipped } },
      tx,
    );
    if (added === 0) return formError("Those days are already scheduled with this shift.");
    return { status: "success", message: `Scheduled "${t.name}" on ${added} machine-day${added === 1 ? "" : "s"}${skipped ? ` (${skipped} already set)` : ""}.` };
  });
  return done(result);
}

/**
 * Ends an assignment as of yesterday so past planned time (and past OEE) stays exactly as it was.
 * Assignments that haven't started yet are simply removed.
 */
export async function endAssignment(assignmentId: number): Promise<FormState> {
  const user = await requirePermission("shifts.manage");
  const id = idSchema.parse(assignmentId);
  const result = await transaction(async (tx): Promise<FormState> => {
    const a = await tx.get<{ effective_from: string; effective_to: string | null }>("SELECT effective_from, effective_to FROM workstation_schedules WHERE id = ?", [id]);
    if (!a) return formError("Assignment not found.");
    const yesterday = addDays(localDate(Date.now(), await factoryTimeZone(tx)), -1);
    if (a.effective_from > yesterday) {
      await tx.run("DELETE FROM workstation_schedules WHERE id = ?", [id]);
    } else if (!a.effective_to || a.effective_to > yesterday) {
      await tx.run("UPDATE workstation_schedules SET effective_to = ? WHERE id = ?", [yesterday, id]);
    }
    await writeAudit({ userId: user.id, action: "shift.unassign", entityType: "workstation_schedule", entityId: id, details: { endedAfter: yesterday } }, tx);
    return { status: "success", message: "Assignment ended. Earlier days keep their planned time." };
  });
  return done(result);
}

const exceptionSchema = z
  .object({
    date: dateSchema,
    workstationId: z.string().default("").transform((v) => (v && v !== "all" ? Number(v) : null)),
    type: z.enum(["HOLIDAY", "OVERTIME"], "Choose holiday or overtime."),
    templateId: z.string().default("").transform((v) => (v ? Number(v) : null)),
    notes: optionalText(200),
  })
  .refine((e) => e.type === "HOLIDAY" || e.templateId, { message: "Choose the shift worked as overtime.", path: ["templateId"] });

export async function addException(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("shifts.manage");
  const parsed = exceptionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const e = parsed.data;

  const result = await transaction(async (tx): Promise<FormState> => {
    if (e.workstationId && !(await tx.get("SELECT id FROM workstations WHERE id = ?", [e.workstationId]))) return formError("Machine not found.");
    if (e.templateId && !(await tx.get("SELECT id FROM shift_templates WHERE id = ?", [e.templateId]))) return formError("Shift not found.");
    const { lastID } = await tx.run(
      "INSERT INTO schedule_exceptions (workstation_id, exception_date, exception_type, shift_template_id, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)",
      [e.workstationId, e.date, e.type, e.type === "OVERTIME" ? e.templateId : null, e.notes, user.id],
    );
    await writeAudit({ userId: user.id, action: "shift.exception_add", entityType: "schedule_exception", entityId: lastID, details: e }, tx);
    return { status: "success", message: e.type === "HOLIDAY" ? `Holiday added on ${e.date}.` : `Overtime added on ${e.date}.` };
  });
  return done(result);
}

export async function removeException(exceptionId: number): Promise<FormState> {
  const user = await requirePermission("shifts.manage");
  const id = idSchema.parse(exceptionId);
  const result = await transaction(async (tx): Promise<FormState> => {
    const { changes } = await tx.run("DELETE FROM schedule_exceptions WHERE id = ?", [id]);
    if (!changes) return formError("Exception not found.");
    await writeAudit({ userId: user.id, action: "shift.exception_remove", entityType: "schedule_exception", entityId: id }, tx);
    return { status: "success", message: "Exception removed." };
  });
  return done(result);
}
