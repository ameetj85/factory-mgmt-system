// Pure shift-calendar arithmetic: no database or framework imports, so it can be unit tested directly.
//
// Shifts are stored as a local start time plus a duration (so night shifts that cross midnight need no
// special handling) and are expanded into concrete UTC intervals for a requested window.

export interface ShiftTemplate {
  id: number;
  name: string;
  startTime: string; // "HH:MM" in the factory time zone
  durationMinutes: number;
  breaks: { name: string; offsetMinutes: number; durationMinutes: number }[];
}

export interface ScheduleAssignment {
  workstationId: number;
  templateId: number;
  dayOfWeek: number; // 0 = Sunday
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo: string | null;
}

export interface ScheduleException {
  workstationId: number | null; // null = whole factory
  date: string; // YYYY-MM-DD
  type: "HOLIDAY" | "OVERTIME";
  templateId: number | null;
}

export interface ShiftInstance {
  workstationId: number;
  templateId: number;
  name: string;
  date: string; // local date the shift starts on
  startMs: number;
  endMs: number;
  breaks: { startMs: number; endMs: number }[];
  overtime: boolean;
}

/** Offset in ms between `timeZone` wall-clock time and UTC at instant `ms` (positive east of UTC). */
function zoneOffsetMs(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** UTC instant for a wall-clock date and time in `timeZone`, correct across DST changes. */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): number {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const first = guess - zoneOffsetMs(guess, timeZone);
  // Re-check the offset at the candidate instant in case the guess landed on the other side of a DST change.
  return guess - zoneOffsetMs(first, timeZone);
}

/** Local calendar date (YYYY-MM-DD) of instant `ms` in `timeZone`. */
export function localDate(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function dayOfWeek(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function instance(t: ShiftTemplate, workstationId: number, date: string, timeZone: string, overtime: boolean): ShiftInstance {
  const startMs = zonedTimeToUtc(date, t.startTime, timeZone);
  return {
    workstationId,
    templateId: t.id,
    name: t.name,
    date,
    startMs,
    endMs: startMs + t.durationMinutes * 60_000,
    breaks: t.breaks.map((b) => {
      const s = startMs + b.offsetMinutes * 60_000;
      return { startMs: s, endMs: s + b.durationMinutes * 60_000 };
    }),
    overtime,
  };
}

/**
 * Expands the schedule into concrete shifts for one workstation that overlap [windowStartMs, windowEndMs).
 * Starts a day early so a night shift that began yesterday and runs into the window is included.
 * A HOLIDAY (for this workstation or the whole factory) cancels that date's regular shifts; OVERTIME adds one.
 */
export function expandShifts(
  workstationId: number,
  windowStartMs: number,
  windowEndMs: number,
  timeZone: string,
  data: { templates: ShiftTemplate[]; assignments: ScheduleAssignment[]; exceptions: ScheduleException[] },
): ShiftInstance[] {
  const templates = new Map(data.templates.map((t) => [t.id, t]));
  const assignments = data.assignments.filter((a) => a.workstationId === workstationId);
  const exceptions = data.exceptions.filter((e) => e.workstationId === null || e.workstationId === workstationId);
  const result: ShiftInstance[] = [];

  const lastDate = localDate(windowEndMs, timeZone);
  for (let date = addDays(localDate(windowStartMs, timeZone), -1); date <= lastDate; date = addDays(date, 1)) {
    const todays = exceptions.filter((e) => e.date === date);
    const holiday = todays.some((e) => e.type === "HOLIDAY");

    if (!holiday) {
      const dow = dayOfWeek(date);
      for (const a of assignments) {
        if (a.dayOfWeek !== dow || a.effectiveFrom > date || (a.effectiveTo && a.effectiveTo < date)) continue;
        const t = templates.get(a.templateId);
        if (t) result.push(instance(t, workstationId, date, timeZone, false));
      }
    }
    for (const e of todays) {
      if (e.type !== "OVERTIME" || !e.templateId) continue;
      const t = templates.get(e.templateId);
      if (t) result.push(instance(t, workstationId, date, timeZone, true));
    }
  }

  return result.filter((s) => s.endMs > windowStartMs && s.startMs < windowEndMs).sort((a, b) => a.startMs - b.startMs);
}

function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * Planned production time in seconds within the window: scheduled shift time, clamped to the window,
 * minus breaks that fall inside it. Overlapping shifts are merged so time is never counted twice.
 */
export function plannedSeconds(shifts: ShiftInstance[], windowStartMs: number, windowEndMs: number): number {
  const work: [number, number][] = [];
  const breaks: [number, number][] = [];
  for (const s of shifts) {
    work.push([Math.max(s.startMs, windowStartMs), Math.min(s.endMs, windowEndMs)]);
    for (const b of s.breaks) breaks.push([Math.max(b.startMs, s.startMs, windowStartMs), Math.min(b.endMs, s.endMs, windowEndMs)]);
  }
  const merge = (ranges: [number, number][]) => {
    const sorted = ranges.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
    const out: [number, number][] = [];
    for (const r of sorted) {
      const last = out[out.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else out.push([...r]);
    }
    return out;
  };
  const mergedWork = merge(work);
  const mergedBreaks = merge(breaks);
  let total = mergedWork.reduce((sum, [a, b]) => sum + (b - a), 0);
  for (const [bs, be] of mergedBreaks) {
    for (const [ws, we] of mergedWork) total -= overlap(bs, be, ws, we);
  }
  return Math.max(0, Math.round(total / 1000));
}
