import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  AlertTriangleIcon,
  CalendarClockIcon,
  ClipboardCheckIcon,
  FileTextIcon,
  GaugeIcon,
  InfoIcon,
  OctagonAlertIcon,
  PackageCheckIcon,
  TimerOffIcon,
  TrashIcon,
} from "lucide-react";
import { BarList } from "@/components/charts/bar-list";
import { ColumnChart } from "@/components/charts/column-chart";
import { LiveRefresh } from "@/components/live-refresh";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { WorkstationStatusBadge } from "@/components/production/badges";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hours, OEE_LOW, OEE_WORLD_CLASS, pct } from "@/lib/analytics/format";
import { bottlenecks, downtimeByReason, longStops, outputSeries, scrapByReason, workOrderStats } from "@/lib/analytics/kpis";
import { computeOee, type OeeRow } from "@/lib/analytics/oee";
import { resolveWindow } from "@/lib/analytics/window";
import { requirePermission } from "@/lib/auth/dal";
import { downtimeReasonLabel } from "@/lib/maintenance/constants";
import { scrapReasonLabel } from "@/lib/production/constants";
import { formatQty } from "@/lib/quantity";
import { cn } from "@/lib/utils";
import { RangeFilter } from "./range-filter";

export const metadata: Metadata = { title: "OEE & KPIs" };

export default function AnalyticsPage(props: PageProps<"/analytics">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AnalyticsContent {...props} />
    </Suspense>
  );
}

async function loadAnalytics(params: Record<string, string | string[] | undefined>) {
  const now = Date.now();
  const w = await resolveWindow(params, now);
  const [oee, series, downtime, scrap, wo, loads, stops] = await Promise.all([
    computeOee(w.startMs, w.endMs, w.timeZone),
    outputSeries(w),
    downtimeByReason(w),
    scrapByReason(w),
    workOrderStats(w),
    bottlenecks(now),
    longStops(15),
  ]);
  return { w, oee, series, downtime, scrap, wo, loads, stops };
}

function OeeStatus({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground text-xs">No data</span>;
  if (value >= OEE_WORLD_CLASS) return <Badge variant="outline" className="border-success/40 text-success">World class</Badge>;
  if (value < OEE_LOW) return (
    <Badge variant="outline" className="border-destructive/40 text-destructive">
      <AlertTriangleIcon /> Low
    </Badge>
  );
  return <Badge variant="outline">Typical</Badge>;
}

async function AnalyticsContent({ searchParams }: PageProps<"/analytics">) {
  await requirePermission("analytics.view");
  const params = await searchParams;
  const { w, oee, series, downtime, scrap, wo, loads, stops } = await loadAnalytics(params);
  const t = oee.totals;
  const produced = t.goodMilli + t.scrapMilli;
  const unplannedSec = downtime.filter((d) => !d.is_planned).reduce((s, d) => s + d.seconds, 0);

  // Alerts: long stops, low OEE, performance over 100% (cycle time out of date), overloaded machines.
  const alerts: { tone: "critical" | "warning" | "info"; text: string; href?: string }[] = [];
  for (const s of stops) alerts.push({ tone: s.is_planned ? "warning" : "critical", text: `${s.code} has been stopped (${downtimeReasonLabel(s.reason_code)}) for over 15 minutes.`, href: "/maintenance/downtime?open=1" });
  for (const r of oee.rows) {
    if (r.performance !== null && r.performance > 1.05) {
      alerts.push({ tone: "info", text: `${r.code} ran at ${pct(r.performance)} performance. Its ideal cycle time looks outdated and should be recalibrated.`, href: "/production/boms" });
    }
    if (r.oee !== null && r.oee < OEE_LOW && r.plannedSec >= 3600) alerts.push({ tone: "warning", text: `${r.code} OEE is ${pct(r.oee)}, below ${pct(OEE_LOW, 0)}.` });
  }
  for (const b of loads) {
    if (b.loadPct !== null && b.loadPct > 1) {
      alerts.push({ tone: "warning", text: `Bottleneck: ${b.code} has ${b.loadHours.toFixed(1)} h of open work but only ${b.capacityHours!.toFixed(1)} h scheduled in the next 7 days.`, href: "/production/work-orders" });
    }
  }
  if ((wo?.overdue ?? 0) > 0) alerts.push({ tone: "warning", text: `${wo!.overdue} open work order${wo!.overdue === 1 ? " is" : "s are"} past due.`, href: "/production/work-orders" });

  const oeeRows = oee.rows.filter((r) => r.plannedSec > 0 || r.goodMilli + r.scrapMilli > 0);
  const downtimeRows = downtime.slice(0, 8).map((d) => ({
    key: `${d.reason_code}-${d.is_planned}`,
    label: downtimeReasonLabel(d.reason_code),
    sublabel: d.is_planned ? "Planned" : "Unplanned",
    value: d.seconds,
    display: hours(d.seconds),
    details: [["Events", String(d.events)], ["Lost time", hours(d.seconds)]] as [string, string][],
  }));
  const scrapRows = scrap.slice(0, 8).map((s) => ({
    key: s.reason ?? "none",
    label: scrapReasonLabel(s.reason),
    value: s.scrap,
    display: formatQty(s.scrap),
  }));

  return (
    <>
      <PageHeader title="OEE & KPIs" description={`Plant performance for ${w.label.toLowerCase()} (${w.timeZone}). Updates live as the shop floor reports.`}>
        <LiveRefresh />
        <Button asChild variant="outline">
          <Link href={`/print/shift-summary?date=${w.toDate}`} target="_blank">
            <FileTextIcon /> Shift summary
          </Link>
        </Button>
      </PageHeader>
      <RangeFilter current={w.key} from={w.fromDate} to={w.toDate} />

      {alerts.length > 0 && (
        <Card className="border-warning/40">
          <CardContent className="space-y-2">
            {alerts.map((a, i) => {
              const Icon = a.tone === "critical" ? OctagonAlertIcon : a.tone === "warning" ? AlertTriangleIcon : InfoIcon;
              const body = (
                <span className="flex items-start gap-2 text-sm">
                  <Icon className={cn("mt-0.5 size-4 shrink-0", a.tone === "critical" ? "text-destructive" : a.tone === "warning" ? "text-warning" : "text-primary")} />
                  <span>
                    <span className="font-medium">{a.tone === "critical" ? "Critical" : a.tone === "warning" ? "Warning" : "Notice"}:</span> {a.text}
                  </span>
                </span>
              );
              return a.href ? (
                <Link key={i} href={a.href} className="hover:bg-accent/50 -mx-2 block rounded-md px-2 py-1 transition-colors">
                  {body}
                </Link>
              ) : (
                <div key={i} className="px-0 py-1">
                  {body}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Plant OEE"
          value={pct(t.oee)}
          icon={GaugeIcon}
          hint={t.oee === null ? "No production in this period" : `A ${pct(t.availability, 0)} · P ${pct(t.performance, 0)} · Q ${pct(t.quality, 0)}`}
          className="xl:col-span-1"
        />
        <StatCard label="Good output" value={formatQty(t.goodMilli)} icon={PackageCheckIcon} hint={`${formatQty(produced)} units produced`} />
        <StatCard label="Scrap rate" value={produced ? pct(t.scrapMilli / produced) : "—"} icon={TrashIcon} hint={`${formatQty(t.scrapMilli)} units scrapped`} />
        <StatCard label="Unplanned downtime" value={hours(unplannedSec)} icon={TimerOffIcon} hint="Across all machines" />
        <StatCard
          label="Orders completed"
          value={wo?.completed ?? 0}
          icon={ClipboardCheckIcon}
          hint={wo?.with_due ? `${pct((wo.on_time ?? 0) / wo.with_due, 0)} on time · ${wo.open} open` : `${wo?.open ?? 0} open`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>OEE by workstation</CardTitle>
            <CardDescription>Availability × performance × quality. The line marks {pct(OEE_WORLD_CLASS, 0)}, world class.</CardDescription>
          </CardHeader>
          <CardContent>
            {oeeRows.length === 0 ? (
              <p className="text-muted-foreground text-sm">No scheduled time or production in this period.</p>
            ) : (
              <BarList
                title="OEE by workstation"
                max={1}
                reference={{ value: OEE_WORLD_CLASS, label: `World class ${pct(OEE_WORLD_CLASS, 0)}` }}
                rows={oeeRows.map((r) => ({
                  key: String(r.workstationId),
                  label: r.code,
                  sublabel: r.name,
                  value: Math.min(r.oee ?? 0, 1.2),
                  display: pct(r.oee),
                  details: [
                    ["Availability", pct(r.availability)],
                    ["Performance", pct(r.performance)],
                    ["Quality", pct(r.quality)],
                    ["Planned time", hours(r.plannedSec)],
                  ],
                }))}
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Output {w.bucket === "hour" ? "by hour" : "by day"}</CardTitle>
            <CardDescription>Good and scrap units reported from the floor.</CardDescription>
          </CardHeader>
          <CardContent>
            <ColumnChart
              title="Output over time"
              data={series.map((b) => ({ label: b.label, values: [b.goodMilli / 1000, b.scrapMilli / 1000] }))}
              series={[
                { name: "Good", color: "var(--viz-1)" },
                { name: "Scrap", color: "var(--viz-2)" },
              ]}
              fractionDigits={3}
              unit="units"
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Workstation detail</CardTitle>
          <CardDescription>How each OEE factor was calculated for {w.label.toLowerCase()}.</CardDescription>
        </CardHeader>
        <CardContent>
          <OeeTable rows={oee.rows} />
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Downtime by reason</CardTitle>
            <CardDescription>Lost time inside this period.</CardDescription>
          </CardHeader>
          <CardContent>
            {downtimeRows.length === 0 ? <p className="text-muted-foreground text-sm">No downtime in this period.</p> : <BarList title="Downtime by reason" rows={downtimeRows} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Scrap by reason</CardTitle>
            <CardDescription>Units scrapped, by the reason operators chose.</CardDescription>
          </CardHeader>
          <CardContent>
            {scrapRows.length === 0 ? <p className="text-muted-foreground text-sm">No scrap in this period.</p> : <BarList title="Scrap by reason" rows={scrapRows} />}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClockIcon className="text-primary size-4" /> Capacity &amp; bottlenecks
          </CardTitle>
          <CardDescription>Remaining work on open orders (at ideal cycle time) against scheduled hours over the next 7 days.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader className="bg-muted/60">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Workstation</TableHead>
                  <TableHead className="text-right">Open orders</TableHead>
                  <TableHead className="text-right">Load</TableHead>
                  <TableHead className="text-right">Scheduled</TableHead>
                  <TableHead className="w-64 pr-4">Utilisation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loads.map((b) => {
                  const p = b.loadPct;
                  return (
                    <TableRow key={b.workstationId} className="hover:bg-accent/40 transition-colors">
                      <TableCell className="pl-4 font-mono text-sm font-medium">{b.code}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.openOrders}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {b.loadHours.toFixed(1)} h
                        {b.missingCycleTimes > 0 && <span className="text-muted-foreground block text-xs">+{b.missingCycleTimes} without cycle time</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{b.capacityHours === null ? <span className="text-muted-foreground text-xs">No calendar</span> : `${b.capacityHours.toFixed(1)} h`}</TableCell>
                      <TableCell className="pr-4">
                        {p === null ? (
                          <span className="text-muted-foreground text-xs">—</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            {/* Meter: track is a light step of the fill's own hue; the fill carries severity. */}
                            <div className={cn("h-2 flex-1 overflow-hidden rounded-full", p > 1 ? "bg-destructive/15" : p > 0.85 ? "bg-warning/20" : "bg-primary/15")}>
                              <div className={cn("h-full rounded-full", p > 1 ? "bg-destructive" : p > 0.85 ? "bg-warning" : "bg-primary")} style={{ width: `${Math.min(100, p * 100)}%` }} />
                            </div>
                            <span className={cn("w-24 text-right text-xs tabular-nums", p > 1 && "text-destructive font-semibold")}>
                              {p > 1 && <AlertTriangleIcon className="mr-1 inline size-3" />}
                              {pct(p, 0)}
                              {p > 1 ? " over" : ""}
                            </span>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function OeeTable({ rows }: { rows: OeeRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader className="bg-muted/60">
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">Workstation</TableHead>
            <TableHead className="text-right">Planned</TableHead>
            <TableHead className="text-right">Stops</TableHead>
            <TableHead className="text-right">Availability</TableHead>
            <TableHead className="text-right">Performance</TableHead>
            <TableHead className="text-right">Quality</TableHead>
            <TableHead className="text-right">OEE</TableHead>
            <TableHead className="pr-4">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.workstationId} className="hover:bg-accent/40 align-top transition-colors">
              <TableCell className="pl-4">
                <p className="font-mono text-sm font-medium">{r.code}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <WorkstationStatusBadge status={r.status} />
                  {!r.hasCalendar && (
                    <Badge variant="outline" className="text-muted-foreground h-5" title="No shift calendar: planned time assumes 24/7">
                      24/7 assumed
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums">{hours(r.plannedSec)}</TableCell>
              <TableCell className="text-muted-foreground text-right text-sm tabular-nums">{hours(r.unplannedStopSec)}</TableCell>
              <TableCell className="text-right tabular-nums">{pct(r.availability)}</TableCell>
              <TableCell className={cn("text-right tabular-nums", r.performance !== null && r.performance > 1.05 && "text-primary font-semibold")}>
                {pct(r.performance)}
                {r.performance !== null && r.performance > 1.05 && <span className="block text-[11px] font-normal">recalibrate cycle time</span>}
                {r.uncountedMilli > 0 && <span className="text-muted-foreground block text-[11px]">{formatQty(r.uncountedMilli)} units without cycle time</span>}
              </TableCell>
              <TableCell className="text-right tabular-nums">{pct(r.quality)}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{pct(r.oee)}</TableCell>
              <TableCell className="pr-4">
                <OeeStatus value={r.oee} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
