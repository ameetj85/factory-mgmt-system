import "server-only";
import { db, nowIso, SQL_NOW } from "@/lib/db/client";
import { upcomingPlan } from "@/lib/maintenance/service";
import { addDays } from "@/lib/maintenance/shift-math";
import type { Window } from "./window";

export interface Bucket {
  key: string;
  label: string;
  goodMilli: number;
  scrapMilli: number;
}

/** Good and scrap output per local hour (single day) or per local day (longer windows). */
export async function outputSeries(w: Window): Promise<Bucket[]> {
  const events = await db.all<{ reported_at: string; good: number; scrap: number }>(
    "SELECT reported_at, qty_good_milli AS good, qty_scrap_milli AS scrap FROM production_output_events WHERE reported_at >= ? AND reported_at < ?",
    [nowIso(new Date(w.startMs)), nowIso(new Date(w.endMs))],
  );
  const hourFmt = new Intl.DateTimeFormat("en-US", { timeZone: w.timeZone, hour: "2-digit", hourCycle: "h23" });
  const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: w.timeZone, year: "numeric", month: "2-digit", day: "2-digit" });

  const buckets: Bucket[] = [];
  if (w.bucket === "hour") {
    for (let h = 0; h < 24; h++) buckets.push({ key: String(h), label: `${String(h).padStart(2, "0")}:00`, goodMilli: 0, scrapMilli: 0 });
    for (const e of events) {
      const h = Number(hourFmt.format(new Date(e.reported_at))) % 24;
      buckets[h].goodMilli += e.good;
      buckets[h].scrapMilli += e.scrap;
    }
  } else {
    const index = new Map<string, Bucket>();
    for (let d = w.fromDate; d <= w.toDate; d = addDays(d, 1)) {
      const [y, m, day] = d.split("-").map(Number);
      const label = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, day)));
      const b = { key: d, label, goodMilli: 0, scrapMilli: 0 };
      buckets.push(b);
      index.set(d, b);
    }
    for (const e of events) {
      const b = index.get(dayFmt.format(new Date(e.reported_at)));
      if (b) {
        b.goodMilli += e.good;
        b.scrapMilli += e.scrap;
      }
    }
  }
  return buckets;
}

/** Downtime seconds by reason inside the window (open events counted up to the window end). */
export async function downtimeByReason(w: Window) {
  const s = Math.floor(w.startMs / 1000);
  const e = Math.floor(w.endMs / 1000);
  return db.all<{ reason_code: string; is_planned: number; seconds: number; events: number }>(
    `SELECT reason_code, is_planned,
            SUM(MAX(0, MIN(unixepoch(COALESCE(ended_at, ${SQL_NOW})), ?) - MAX(unixepoch(started_at), ?))) AS seconds,
            COUNT(*) AS events
       FROM downtime_logs
      WHERE unixepoch(started_at) < ? AND unixepoch(COALESCE(ended_at, ${SQL_NOW})) > ?
      GROUP BY reason_code, is_planned
      ORDER BY seconds DESC`,
    [e, s, e, s],
  );
}

export async function scrapByReason(w: Window) {
  return db.all<{ reason: string | null; scrap: number }>(
    `SELECT scrap_reason_code AS reason, SUM(qty_scrap_milli) AS scrap FROM production_output_events
      WHERE reported_at >= ? AND reported_at < ? AND qty_scrap_milli > 0
      GROUP BY scrap_reason_code ORDER BY scrap DESC`,
    [nowIso(new Date(w.startMs)), nowIso(new Date(w.endMs))],
  );
}

export async function workOrderStats(w: Window) {
  return db.get<{ completed: number; on_time: number; with_due: number; open: number; overdue: number; target: number | null; made: number | null }>(
    `SELECT
       (SELECT COUNT(*) FROM work_orders WHERE status = 'COMPLETED' AND completed_at >= ? AND completed_at < ?) AS completed,
       (SELECT COUNT(*) FROM work_orders WHERE status = 'COMPLETED' AND completed_at >= ? AND completed_at < ? AND due_date IS NOT NULL
                                           AND substr(completed_at, 1, 10) <= due_date) AS on_time,
       (SELECT COUNT(*) FROM work_orders WHERE status = 'COMPLETED' AND completed_at >= ? AND completed_at < ? AND due_date IS NOT NULL) AS with_due,
       (SELECT COUNT(*) FROM work_orders WHERE status IN ('RELEASED', 'IN_PROGRESS', 'ON_HOLD')) AS open,
       (SELECT COUNT(*) FROM work_orders WHERE status IN ('RELEASED', 'IN_PROGRESS', 'ON_HOLD') AND due_date < substr(${SQL_NOW}, 1, 10)) AS overdue,
       (SELECT SUM(qty_target_milli) FROM work_orders WHERE status = 'COMPLETED' AND completed_at >= ? AND completed_at < ?) AS target,
       (SELECT SUM(qty_completed_milli) FROM work_orders WHERE status = 'COMPLETED' AND completed_at >= ? AND completed_at < ?) AS made`,
    Array.from({ length: 5 }, () => [nowIso(new Date(w.startMs)), nowIso(new Date(w.endMs))]).flat(),
  );
}

export interface Bottleneck {
  workstationId: number;
  code: string;
  loadHours: number;
  capacityHours: number | null;
  loadPct: number | null;
  openOrders: number;
  missingCycleTimes: number;
}

/** Remaining work on open orders vs scheduled hours over the next 7 days, per workstation. */
export async function bottlenecks(nowMs: number): Promise<Bottleneck[]> {
  const load = await db.all<{ id: number; code: string; load_ms: number; open_orders: number; missing: number; has_calendar: number }>(
    `SELECT w.id, w.code,
            COALESCE(SUM(CASE WHEN o.ideal_cycle_time_ms IS NOT NULL
                              THEN MAX(0, o.qty_target_milli - o.qty_completed_milli) * o.ideal_cycle_time_ms / 1000.0 END), 0) AS load_ms,
            COUNT(o.id) AS open_orders,
            SUM(CASE WHEN o.id IS NOT NULL AND o.ideal_cycle_time_ms IS NULL THEN 1 ELSE 0 END) AS missing,
            EXISTS (SELECT 1 FROM workstation_schedules s WHERE s.workstation_id = w.id) AS has_calendar
       FROM workstations w
       LEFT JOIN work_orders o ON o.workstation_id = w.id AND o.status IN ('RELEASED', 'IN_PROGRESS', 'ON_HOLD')
      WHERE w.is_active = 1
      GROUP BY w.id
      ORDER BY w.code COLLATE NOCASE`,
  );
  const { plans } = await upcomingPlan(load.map((l) => l.id), 7, nowMs);
  return load.map((l) => {
    const capacityHours = l.has_calendar ? (plans.get(l.id) ?? []).reduce((s, d) => s + d.seconds, 0) / 3600 : null;
    const loadHours = l.load_ms / 3_600_000;
    return {
      workstationId: l.id,
      code: l.code,
      loadHours,
      capacityHours,
      loadPct: capacityHours && capacityHours > 0 ? loadHours / capacityHours : null,
      openOrders: l.open_orders,
      missingCycleTimes: l.missing,
    };
  });
}

/** Machines stopped longer than `minutes`, for alerts. */
export async function longStops(minutes: number) {
  return db.all<{ code: string; reason_code: string; started_at: string; is_planned: number }>(
    `SELECT w.code, d.reason_code, d.started_at, d.is_planned
       FROM downtime_logs d JOIN workstations w ON w.id = d.workstation_id
      WHERE d.ended_at IS NULL AND unixepoch(${SQL_NOW}) - unixepoch(d.started_at) > ?
      ORDER BY d.started_at`,
    [minutes * 60],
  );
}
