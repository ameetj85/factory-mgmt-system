import type { Metadata } from "next";
import { Suspense } from "react";
import { computeOee } from "@/lib/analytics/oee";
import { hours, pct } from "@/lib/analytics/format";
import { requirePermission } from "@/lib/auth/dal";
import { db, nowIso } from "@/lib/db/client";
import { downtimeReasonLabel } from "@/lib/maintenance/constants";
import { factoryTimeZone } from "@/lib/maintenance/service";
import { addDays, localDate, zonedTimeToUtc } from "@/lib/maintenance/shift-math";
import { scrapReasonLabel } from "@/lib/production/constants";
import { formatQty } from "@/lib/quantity";
import { SummaryPicker } from "./summary-picker";

export const metadata: Metadata = { title: "Shift production summary" };

async function loadSummary(params: Record<string, string | string[] | undefined>) {
  const timeZone = await factoryTimeZone();
  const now = Date.now();
  const date = typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : localDate(now, timeZone);
  const shifts = await db.all<{ id: number; name: string; start_time: string; duration_minutes: number }>(
    "SELECT id, name, start_time, duration_minutes FROM shift_templates WHERE is_active = 1 ORDER BY start_time",
  );
  const shift = shifts.find((s) => String(s.id) === params.shift);
  const startMs = shift ? zonedTimeToUtc(date, shift.start_time, timeZone) : zonedTimeToUtc(date, "00:00", timeZone);
  const endMs = Math.min(now, shift ? startMs + shift.duration_minutes * 60_000 : zonedTimeToUtc(addDays(date, 1), "00:00", timeZone));
  const s = nowIso(new Date(startMs));
  const e = nowIso(new Date(Math.max(startMs, endMs)));

  const [oee, byOrder, scrap, downtime, inspections] = await Promise.all([
    computeOee(startMs, Math.max(startMs, endMs), timeZone),
    db.all<{ wo_number: string; sku: string; uom: string; ws_code: string; good: number; scrap: number; target: number; completed: number }>(
      `SELECT o.wo_number, i.sku, i.uom, w.code AS ws_code, SUM(ev.qty_good_milli) AS good, SUM(ev.qty_scrap_milli) AS scrap,
              o.qty_target_milli AS target, o.qty_completed_milli AS completed
         FROM production_output_events ev JOIN work_orders o ON o.id = ev.work_order_id
         JOIN items i ON i.id = o.item_id JOIN workstations w ON w.id = o.workstation_id
        WHERE ev.reported_at >= ? AND ev.reported_at < ?
        GROUP BY o.id ORDER BY w.code, o.wo_number`,
      [s, e],
    ),
    db.all<{ reason: string | null; qty: number }>(
      `SELECT scrap_reason_code AS reason, SUM(qty_scrap_milli) AS qty FROM production_output_events
        WHERE reported_at >= ? AND reported_at < ? AND qty_scrap_milli > 0 GROUP BY scrap_reason_code ORDER BY qty DESC`,
      [s, e],
    ),
    db.all<{ code: string; reason_code: string; is_planned: number; started_at: string; ended_at: string | null; notes: string | null }>(
      `SELECT w.code, d.reason_code, d.is_planned, d.started_at, d.ended_at, d.notes
         FROM downtime_logs d JOIN workstations w ON w.id = d.workstation_id
        WHERE d.started_at < ? AND COALESCE(d.ended_at, ?) > ? ORDER BY d.started_at`,
      [e, e, s],
    ),
    db.get<{ total: number; failed: number | null }>("SELECT COUNT(*) AS total, SUM(result = 'FAIL') AS failed FROM inspections WHERE created_at >= ? AND created_at < ?", [s, e]),
  ]);
  return { timeZone, date, shifts, shift, startMs, endMs, oee, byOrder, scrap, downtime, inspections };
}

/** End-of-shift (or whole-day) production summary for handover and sign-off. */
export default function ShiftSummaryPage(props: PageProps<"/print/shift-summary">) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Preparing document…</p>}>
      <ShiftSummaryPageContent {...props} />
    </Suspense>
  );
}

async function ShiftSummaryPageContent({ searchParams }: PageProps<"/print/shift-summary">) {
  await requirePermission("analytics.view");
  const params = await searchParams;
  const d = await loadSummary(params);
  const fmtTime = (ms: number) => new Intl.DateTimeFormat("en-US", { timeZone: d.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));
  const t = d.oee.totals;
  const produced = t.goodMilli + t.scrapMilli;

  return (
    <article className="space-y-6 text-sm">
      <SummaryPicker date={d.date} shiftId={d.shift ? String(d.shift.id) : ""} shifts={d.shifts.map((s) => ({ id: String(s.id), name: `${s.name} (${s.start_time})` }))} />

      <header className="border-b-2 border-zinc-900 pb-4">
        <p className="text-xs font-semibold tracking-widest text-zinc-500 uppercase">Production summary</p>
        <h1 className="text-2xl font-bold">
          {d.date} · {d.shift ? d.shift.name : "Full day"}
        </h1>
        <p className="text-zinc-600">
          {fmtTime(d.startMs)}–{fmtTime(d.endMs)} ({d.timeZone})
        </p>
      </header>

      <section className="grid grid-cols-5 gap-3">
        {[
          ["Plant OEE", pct(t.oee)],
          ["Availability", pct(t.availability)],
          ["Performance", pct(t.performance)],
          ["Good units", formatQty(t.goodMilli)],
          ["Scrap rate", produced ? pct(t.scrapMilli / produced) : "—"],
        ].map(([k, v]) => (
          <div key={k} className="rounded border border-zinc-300 p-3">
            <p className="text-xs text-zinc-500">{k}</p>
            <p className="text-xl font-bold tabular-nums">{v}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">Workstations</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-zinc-400 text-left text-xs text-zinc-500">
              <th className="py-1.5">Station</th>
              <th className="py-1.5 text-right">Planned</th>
              <th className="py-1.5 text-right">Stops</th>
              <th className="py-1.5 text-right">Good</th>
              <th className="py-1.5 text-right">Scrap</th>
              <th className="py-1.5 text-right">A</th>
              <th className="py-1.5 text-right">P</th>
              <th className="py-1.5 text-right">Q</th>
              <th className="py-1.5 text-right">OEE</th>
            </tr>
          </thead>
          <tbody>
            {d.oee.rows.map((r) => (
              <tr key={r.workstationId} className="border-b border-zinc-200">
                <td className="py-1.5 font-mono font-semibold">{r.code}</td>
                <td className="py-1.5 text-right tabular-nums">{hours(r.plannedSec)}</td>
                <td className="py-1.5 text-right tabular-nums">{hours(r.unplannedStopSec)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatQty(r.goodMilli)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatQty(r.scrapMilli)}</td>
                <td className="py-1.5 text-right tabular-nums">{pct(r.availability, 0)}</td>
                <td className="py-1.5 text-right tabular-nums">{pct(r.performance, 0)}</td>
                <td className="py-1.5 text-right tabular-nums">{pct(r.quality, 0)}</td>
                <td className="py-1.5 text-right font-semibold tabular-nums">{pct(r.oee, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">Output by work order</h2>
        {d.byOrder.length === 0 ? (
          <p className="text-zinc-500">No output reported.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-zinc-400 text-left text-xs text-zinc-500">
                <th className="py-1.5">Work order</th>
                <th className="py-1.5">Item</th>
                <th className="py-1.5">Station</th>
                <th className="py-1.5 text-right">Good</th>
                <th className="py-1.5 text-right">Scrap</th>
                <th className="py-1.5 text-right">Progress</th>
              </tr>
            </thead>
            <tbody>
              {d.byOrder.map((o) => (
                <tr key={o.wo_number} className="border-b border-zinc-200">
                  <td className="py-1.5 font-mono">{o.wo_number}</td>
                  <td className="py-1.5 font-mono">{o.sku}</td>
                  <td className="py-1.5 font-mono">{o.ws_code}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatQty(o.good, o.uom)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatQty(o.scrap, o.uom)}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {formatQty(o.completed)} / {formatQty(o.target)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="grid grid-cols-2 gap-6">
        <section>
          <h2 className="mb-2 text-base font-semibold">Scrap by reason</h2>
          {d.scrap.length === 0 ? (
            <p className="text-zinc-500">No scrap.</p>
          ) : (
            <ul className="space-y-1">
              {d.scrap.map((r) => (
                <li key={r.reason ?? "none"} className="flex justify-between border-b border-zinc-200 py-1">
                  <span>{scrapReasonLabel(r.reason)}</span>
                  <span className="tabular-nums">{formatQty(r.qty)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h2 className="mb-2 text-base font-semibold">Quality</h2>
          <p>
            {d.inspections?.total ?? 0} inspection{d.inspections?.total === 1 ? "" : "s"}, {d.inspections?.failed ?? 0} failed.
          </p>
        </section>
      </div>

      <section>
        <h2 className="mb-2 text-base font-semibold">Downtime events</h2>
        {d.downtime.length === 0 ? (
          <p className="text-zinc-500">No downtime.</p>
        ) : (
          <table className="w-full border-collapse">
            <tbody>
              {d.downtime.map((x, i) => (
                <tr key={i} className="border-b border-zinc-200">
                  <td className="py-1.5 font-mono">{x.code}</td>
                  <td className="py-1.5">
                    {downtimeReasonLabel(x.reason_code)}
                    {x.is_planned ? " (planned)" : ""}
                  </td>
                  <td className="py-1.5 tabular-nums">
                    {fmtTime(Date.parse(x.started_at))}–{x.ended_at ? fmtTime(Date.parse(x.ended_at)) : "ongoing"}
                  </td>
                  <td className="py-1.5 text-zinc-600">{x.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="grid grid-cols-2 gap-6 pt-6">
        {["Shift supervisor", "Incoming supervisor"].map((k) => (
          <div key={k}>
            <p className="text-xs text-zinc-500">{k}</p>
            <div className="mt-6 border-b border-zinc-500" />
            <p className="mt-1 text-xs text-zinc-500">Name · signature</p>
          </div>
        ))}
      </section>
    </article>
  );
}
