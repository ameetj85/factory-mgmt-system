import "server-only";
import { db, SQL_NOW, type Executor } from "@/lib/db/client";
import type { PmStatus, PmTrigger } from "./constants";
import {
  addDays,
  expandShifts,
  localDate,
  plannedSeconds,
  zonedTimeToUtc,
  type ScheduleAssignment,
  type ScheduleException,
  type ShiftTemplate,
} from "./shift-math";

export async function getSetting(key: string, fallback: string, executor: Executor = db): Promise<string> {
  const row = await executor.get<{ value: string }>("SELECT value FROM app_settings WHERE key = ?", [key]);
  return row?.value ?? fallback;
}

export async function factoryTimeZone(executor: Executor = db): Promise<string> {
  return getSetting("factory_timezone", "UTC", executor);
}

/** Production runtime per workstation in seconds (RUN segments, open ones counted up to now) plus the meter offset. */
export async function runtimeSeconds(executor: Executor = db, workstationId?: number): Promise<Map<number, number>> {
  const rows = await executor.all<{ id: number; seconds: number }>(
    `SELECT w.id,
            w.runtime_offset_seconds + COALESCE((
              SELECT SUM(unixepoch(COALESCE(p.end_time, ${SQL_NOW})) - unixepoch(p.start_time))
                FROM production_logs p WHERE p.workstation_id = w.id AND p.run_type = 'RUN'
            ), 0) AS seconds
       FROM workstations w ${workstationId ? "WHERE w.id = ?" : ""}`,
    workstationId ? [workstationId] : [],
  );
  return new Map(rows.map((r) => [r.id, r.seconds]));
}

export interface PmPlanRow {
  id: number;
  workstation_id: number;
  title: string;
  instructions: string | null;
  trigger_type: PmTrigger;
  interval_days: number | null;
  interval_runtime_hours: number | null;
  baseline_at: string;
  baseline_runtime_seconds: number;
  estimated_minutes: number | null;
  is_active: number;
}

export interface PmDue {
  status: PmStatus;
  /** 0–1+ share of the interval used so far. */
  progress: number;
  dueAt: string | null;
  runtimeRemainingSeconds: number | null;
}

const DUE_SOON_SHARE = 0.85;

/** Where a plan is in its interval. `nowMs` is passed in so render code stays deterministic. */
export function pmDue(plan: PmPlanRow, currentRuntimeSeconds: number, nowMs: number): PmDue {
  if (!plan.is_active) return { status: "inactive", progress: 0, dueAt: null, runtimeRemainingSeconds: null };
  if (plan.trigger_type === "CALENDAR") {
    const start = Date.parse(plan.baseline_at);
    const length = plan.interval_days! * 86_400_000;
    const progress = (nowMs - start) / length;
    return {
      status: progress >= 1 ? "overdue" : progress >= DUE_SOON_SHARE ? "due_soon" : "ok",
      progress,
      dueAt: new Date(start + length).toISOString(),
      runtimeRemainingSeconds: null,
    };
  }
  const intervalSeconds = plan.interval_runtime_hours! * 3600;
  const used = currentRuntimeSeconds - plan.baseline_runtime_seconds;
  const progress = used / intervalSeconds;
  return {
    status: progress >= 1 ? "overdue" : progress >= DUE_SOON_SHARE ? "due_soon" : "ok",
    progress,
    dueAt: null,
    runtimeRemainingSeconds: intervalSeconds - used,
  };
}

export async function loadShiftData(executor: Executor = db) {
  const [templates, breaks, assignments, exceptions] = await Promise.all([
    executor.all<{ id: number; name: string; start_time: string; duration_minutes: number }>(
      "SELECT id, name, start_time, duration_minutes FROM shift_templates WHERE is_active = 1",
    ),
    executor.all<{ shift_template_id: number; name: string; offset_minutes: number; duration_minutes: number }>(
      "SELECT shift_template_id, name, offset_minutes, duration_minutes FROM shift_breaks ORDER BY offset_minutes",
    ),
    executor.all<{ workstation_id: number; shift_template_id: number; day_of_week: number; effective_from: string; effective_to: string | null }>(
      "SELECT workstation_id, shift_template_id, day_of_week, effective_from, effective_to FROM workstation_schedules",
    ),
    executor.all<{ workstation_id: number | null; exception_date: string; exception_type: "HOLIDAY" | "OVERTIME"; shift_template_id: number | null }>(
      "SELECT workstation_id, exception_date, exception_type, shift_template_id FROM schedule_exceptions",
    ),
  ]);
  return {
    templates: templates.map<ShiftTemplate>((t) => ({
      id: t.id,
      name: t.name,
      startTime: t.start_time,
      durationMinutes: t.duration_minutes,
      breaks: breaks
        .filter((b) => b.shift_template_id === t.id)
        .map((b) => ({ name: b.name, offsetMinutes: b.offset_minutes, durationMinutes: b.duration_minutes })),
    })),
    assignments: assignments.map<ScheduleAssignment>((a) => ({
      workstationId: a.workstation_id,
      templateId: a.shift_template_id,
      dayOfWeek: a.day_of_week,
      effectiveFrom: a.effective_from,
      effectiveTo: a.effective_to,
    })),
    exceptions: exceptions.map<ScheduleException>((e) => ({
      workstationId: e.workstation_id,
      date: e.exception_date,
      type: e.exception_type,
      templateId: e.shift_template_id,
    })),
  };
}

/**
 * Planned production seconds for a workstation in a window, from its shift calendar. Planned downtime
 * events are subtracted separately by OEE calculations.
 */
export async function plannedProductionSeconds(workstationId: number, windowStartMs: number, windowEndMs: number): Promise<number> {
  const [data, timeZone] = await Promise.all([loadShiftData(), factoryTimeZone()]);
  return plannedSeconds(expandShifts(workstationId, windowStartMs, windowEndMs, timeZone, data), windowStartMs, windowEndMs);
}

export interface DayPlan {
  date: string;
  seconds: number;
  shifts: { name: string; startMs: number; endMs: number; overtime: boolean }[];
  holiday: boolean;
}

/** Planned production per local day for the next `days` days, starting today in the factory time zone. */
export async function upcomingPlan(workstationIds: number[], days: number, nowMs: number): Promise<{ timeZone: string; plans: Map<number, DayPlan[]> }> {
  const [data, timeZone] = await Promise.all([loadShiftData(), factoryTimeZone()]);
  const today = localDate(nowMs, timeZone);
  const plans = new Map<number, DayPlan[]>();
  for (const wsId of workstationIds) {
    const list: DayPlan[] = [];
    for (let i = 0; i < days; i++) {
      const date = addDays(today, i);
      const start = zonedTimeToUtc(date, "00:00", timeZone);
      const end = zonedTimeToUtc(addDays(date, 1), "00:00", timeZone);
      const shifts = expandShifts(wsId, start, end, timeZone, data).filter((s) => s.date === date);
      list.push({
        date,
        seconds: plannedSeconds(shifts, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
        shifts: shifts.map((s) => ({ name: s.name, startMs: s.startMs, endMs: s.endMs, overtime: s.overtime })),
        holiday: data.exceptions.some((e) => e.type === "HOLIDAY" && e.date === date && (e.workstationId === null || e.workstationId === wsId)),
      });
    }
    plans.set(wsId, list);
  }
  return { timeZone, plans };
}

/** Returns the id of a downtime event on the workstation that overlaps [start, end), if any. */
export async function overlappingDowntime(tx: Executor, workstationId: number, startedAt: string, endedAt: string): Promise<number | null> {
  const row = await tx.get<{ id: number }>(
    `SELECT id FROM downtime_logs
      WHERE workstation_id = ? AND started_at < ? AND COALESCE(ended_at, '9999-12-31T23:59:59Z') > ?
      LIMIT 1`,
    [workstationId, endedAt, startedAt],
  );
  return row?.id ?? null;
}
