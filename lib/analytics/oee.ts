import "server-only";
import { db, nowIso } from "@/lib/db/client";
import { loadShiftData } from "@/lib/maintenance/service";
import { expandShifts } from "@/lib/maintenance/shift-math";
import type { WorkstationStatus } from "@/lib/production/constants";

// OEE = Availability × Performance × Quality, per workstation over a window.
//   Planned production time = scheduled shift time (minus breaks) − planned downtime inside shifts
//   Run time               = planned production time − unplanned downtime inside shifts
//   Availability           = run time ÷ planned production time
//   Performance            = Σ(units × that work order's ideal cycle time) ÷ run time   (not clamped; >100% is flagged)
//   Quality                = good ÷ (good + scrap)
// Workstations without a shift calendar are treated as scheduled around the clock, and flagged.

export interface OeeRow {
  workstationId: number;
  code: string;
  name: string;
  status: WorkstationStatus;
  hasCalendar: boolean;
  scheduledSec: number;
  plannedStopSec: number;
  unplannedStopSec: number;
  plannedSec: number;
  runSec: number;
  idealSec: number;
  goodMilli: number;
  scrapMilli: number;
  /** Units produced on work orders that have no ideal cycle time, so Performance can't count them. */
  uncountedMilli: number;
  availability: number | null;
  performance: number | null;
  quality: number | null;
  oee: number | null;
}

export interface OeeTotals {
  plannedSec: number;
  runSec: number;
  idealSec: number;
  goodMilli: number;
  scrapMilli: number;
  availability: number | null;
  performance: number | null;
  quality: number | null;
  oee: number | null;
}

type Interval = [number, number];

function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: Interval[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([...r]);
  }
  return out;
}

function subtract(base: Interval[], cut: Interval[]): Interval[] {
  let result = base;
  for (const [cs, ce] of cut) {
    const next: Interval[] = [];
    for (const [s, e] of result) {
      if (ce <= s || cs >= e) next.push([s, e]);
      else {
        if (cs > s) next.push([s, cs]);
        if (ce < e) next.push([ce, e]);
      }
    }
    result = next;
  }
  return result;
}

function overlapMs(intervals: Interval[], s: number, e: number): number {
  return intervals.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(b, e) - Math.max(a, s)), 0);
}

const ratio = (n: number, d: number) => (d > 0 ? n / d : null);

export function combine(a: number | null, p: number | null, q: number | null): number | null {
  return a === null || p === null || q === null ? null : a * p * q;
}

export async function computeOee(startMs: number, endMs: number, timeZone: string): Promise<{ rows: OeeRow[]; totals: OeeTotals }> {
  const startIso = nowIso(new Date(startMs));
  const endIso = nowIso(new Date(endMs));
  const [stations, shiftData, downtime, output] = await Promise.all([
    db.all<{ id: number; code: string; name: string; status: WorkstationStatus }>(
      "SELECT id, code, name, status FROM workstations WHERE is_active = 1 ORDER BY code COLLATE NOCASE",
    ),
    loadShiftData(),
    db.all<{ workstation_id: number; is_planned: number; started_at: string; ended_at: string | null }>(
      "SELECT workstation_id, is_planned, started_at, ended_at FROM downtime_logs WHERE started_at < ? AND COALESCE(ended_at, ?) > ?",
      [endIso, endIso, startIso],
    ),
    db.all<{ workstation_id: number; good: number; scrap: number; ideal_unit_ms: number; uncounted: number }>(
      `SELECT o.workstation_id,
              SUM(e.qty_good_milli) AS good,
              SUM(e.qty_scrap_milli) AS scrap,
              SUM(CASE WHEN o.ideal_cycle_time_ms IS NOT NULL THEN (e.qty_good_milli + e.qty_scrap_milli) * o.ideal_cycle_time_ms ELSE 0 END) AS ideal_unit_ms,
              SUM(CASE WHEN o.ideal_cycle_time_ms IS NULL THEN e.qty_good_milli + e.qty_scrap_milli ELSE 0 END) AS uncounted
         FROM production_output_events e JOIN work_orders o ON o.id = e.work_order_id
        WHERE e.reported_at >= ? AND e.reported_at < ?
        GROUP BY o.workstation_id`,
      [startIso, endIso],
    ),
  ]);

  const rows: OeeRow[] = stations.map((ws) => {
    const hasCalendar =
      shiftData.assignments.some((a) => a.workstationId === ws.id) ||
      shiftData.exceptions.some((e) => e.type === "OVERTIME" && (e.workstationId === ws.id || e.workstationId === null));

    // Working intervals: shifts minus breaks, clamped to the window (or the whole window without a calendar).
    let working: Interval[];
    if (hasCalendar) {
      const shifts = expandShifts(ws.id, startMs, endMs, timeZone, shiftData);
      const work = mergeIntervals(shifts.map((s) => [Math.max(s.startMs, startMs), Math.min(s.endMs, endMs)]));
      const breaks = mergeIntervals(shifts.flatMap((s) => s.breaks.map((b): Interval => [b.startMs, b.endMs])));
      working = subtract(work, breaks);
    } else {
      working = [[startMs, endMs]];
    }
    const scheduledMs = working.reduce((sum, [a, b]) => sum + (b - a), 0);

    let plannedStopMs = 0;
    let unplannedStopMs = 0;
    const events = downtime.filter((d) => d.workstation_id === ws.id);
    // Merge each kind so overlapping records (shouldn't exist, but be safe) never double-count.
    for (const planned of [1, 0]) {
      const merged = mergeIntervals(
        events.filter((d) => d.is_planned === planned).map((d) => [Date.parse(d.started_at), d.ended_at ? Date.parse(d.ended_at) : endMs]),
      );
      const ms = merged.reduce((sum, [s, e]) => sum + overlapMs(working, s, e), 0);
      if (planned) plannedStopMs = ms;
      else unplannedStopMs = ms;
    }

    const out = output.find((o) => o.workstation_id === ws.id);
    const good = out?.good ?? 0;
    const scrap = out?.scrap ?? 0;
    const plannedSec = Math.max(0, (scheduledMs - plannedStopMs) / 1000);
    const runSec = Math.max(0, plannedSec - unplannedStopMs / 1000);
    // ideal_unit_ms is (qty in thousandths) × ms per unit, so ÷ 1000 for units and ÷ 1000 for seconds.
    const idealSec = (out?.ideal_unit_ms ?? 0) / 1_000_000;
    const availability = ratio(runSec, plannedSec);
    const performance = runSec > 0 ? idealSec / runSec : null;
    const quality = ratio(good, good + scrap);

    return {
      workstationId: ws.id,
      code: ws.code,
      name: ws.name,
      status: ws.status,
      hasCalendar,
      scheduledSec: scheduledMs / 1000,
      plannedStopSec: plannedStopMs / 1000,
      unplannedStopSec: unplannedStopMs / 1000,
      plannedSec,
      runSec,
      idealSec,
      goodMilli: good,
      scrapMilli: scrap,
      uncountedMilli: out?.uncounted ?? 0,
      availability,
      performance,
      quality,
      oee: combine(availability, performance, quality),
    };
  });

  const sum = (f: (r: OeeRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  // Plant figures weight each machine by its planned time, the standard way to aggregate OEE.
  const active = rows.filter((r) => r.plannedSec > 0 && r.goodMilli + r.scrapMilli > 0);
  const plannedSec = sum((r) => (active.includes(r) ? r.plannedSec : 0));
  const runSec = sum((r) => (active.includes(r) ? r.runSec : 0));
  const idealSec = sum((r) => (active.includes(r) ? r.idealSec : 0));
  const goodMilli = sum((r) => r.goodMilli);
  const scrapMilli = sum((r) => r.scrapMilli);
  const availability = ratio(runSec, plannedSec);
  const performance = runSec > 0 ? idealSec / runSec : null;
  const quality = ratio(goodMilli, goodMilli + scrapMilli);

  return {
    rows,
    totals: { plannedSec, runSec, idealSec, goodMilli, scrapMilli, availability, performance, quality, oee: combine(availability, performance, quality) },
  };
}
