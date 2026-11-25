import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeftIcon, CalendarClockIcon, DollarSignIcon, GaugeIcon, TimerOffIcon } from "lucide-react";
import { LocalTime } from "@/components/local-time";
import { PmStatusBadge } from "@/components/maintenance/pm-status-badge";
import { WeekPlan } from "@/components/maintenance/week-plan";
import { PageSkeleton } from "@/components/page-skeleton";
import { WorkstationStatusBadge } from "@/components/production/badges";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/dal";
import { db, SQL_NOW } from "@/lib/db/client";
import { downtimeReasonLabel, formatHours, formatMinutes } from "@/lib/maintenance/constants";
import { pmDue, runtimeSeconds, upcomingPlan, type PmPlanRow } from "@/lib/maintenance/service";
import type { WorkstationStatus } from "@/lib/production/constants";
import { formatCents } from "@/lib/quantity";
import { AssetDialog } from "../asset-dialog";

export const metadata: Metadata = { title: "Machine" };

export default function MachinePage(props: PageProps<"/maintenance/machines/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MachineContent {...props} />
    </Suspense>
  );
}

async function loadMachine(id: number) {
  const machine = await db.get<{
    id: number;
    code: string;
    name: string;
    description: string | null;
    status: WorkstationStatus;
    asset_tag: string | null;
    manufacturer: string | null;
    model: string | null;
    serial_number: string | null;
    install_date: string | null;
    hourly_rate_cents: number | null;
    runtime_offset_seconds: number;
    hourly_capacity: number | null;
  }>("SELECT * FROM workstations WHERE id = ?", [id]);
  if (!machine) return null;

  const [runtime, plans, downtime, stats] = await Promise.all([
    runtimeSeconds(db, id),
    db.all<PmPlanRow>("SELECT * FROM pm_plans WHERE workstation_id = ? ORDER BY is_active DESC, title", [id]),
    db.all<{ id: number; reason_code: string; is_planned: number; started_at: string; ended_at: string | null; seconds: number }>(
      `SELECT id, reason_code, is_planned, started_at, ended_at,
              unixepoch(COALESCE(ended_at, ${SQL_NOW})) - unixepoch(started_at) AS seconds
         FROM downtime_logs WHERE workstation_id = ? ORDER BY started_at DESC LIMIT 12`,
      [id],
    ),
    db.get<{ unplanned: number | null; events: number }>(
      `SELECT SUM(CASE WHEN is_planned = 0 THEN unixepoch(COALESCE(ended_at, ${SQL_NOW})) - unixepoch(started_at) END) AS unplanned,
              COUNT(*) AS events
         FROM downtime_logs WHERE workstation_id = ? AND started_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 days')`,
      [id],
    ),
  ]);
  const now = Date.now();
  const seconds = runtime.get(id) ?? 0;
  const { timeZone, plans: week } = await upcomingPlan([id], 7, now);
  return {
    machine,
    seconds,
    plans: plans.map((p) => ({ ...p, due: pmDue(p, seconds, now) })),
    downtime,
    stats,
    timeZone,
    week: week.get(id) ?? [],
  };
}

async function MachineContent({ params }: PageProps<"/maintenance/machines/[id]">) {
  await requirePermission("maintenance.manage");
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const data = await loadMachine(Number(id));
  if (!data) notFound();
  const { machine: m, seconds, plans, downtime, stats, timeZone, week } = data;
  const weekHours = week.reduce((s, d) => s + d.seconds, 0);

  return (
    <>
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-primary -ml-2">
          <Link href="/maintenance/machines">
            <ArrowLeftIcon /> Machines
          </Link>
        </Button>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-2xl font-semibold tracking-tight">{m.code}</h1>
              <WorkstationStatusBadge status={m.status} />
              {m.asset_tag && <Badge variant="secondary">{m.asset_tag}</Badge>}
            </div>
            <p className="text-lg">{m.name}</p>
            <p className="text-muted-foreground text-sm">
              {[m.manufacturer, m.model].filter(Boolean).join(" ") || "Make and model not set"}
              {m.serial_number && <> · S/N {m.serial_number}</>}
              {m.install_date && <> · installed {m.install_date}</>}
            </p>
          </div>
          <AssetDialog
            machine={{
              id: m.id,
              code: m.code,
              assetTag: m.asset_tag,
              manufacturer: m.manufacturer,
              model: m.model,
              serialNumber: m.serial_number,
              installDate: m.install_date,
              hourlyRateCents: m.hourly_rate_cents,
              runtimeOffsetSeconds: m.runtime_offset_seconds,
            }}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Runtime" value={formatHours(seconds)} icon={GaugeIcon} hint={m.runtime_offset_seconds ? `Includes ${formatHours(m.runtime_offset_seconds)} before tracking` : "Production run time"} />
        <StatCard label="Run rate" value={m.hourly_rate_cents != null ? `${formatCents(m.hourly_rate_cents)}/h` : "—"} icon={DollarSignIcon} hint={m.hourly_capacity ? `${m.hourly_capacity} units/h capacity` : undefined} />
        <StatCard label="Unplanned downtime" value={formatMinutes((stats?.unplanned ?? 0) / 60)} icon={TimerOffIcon} hint={`${stats?.events ?? 0} events in 30 days`} />
        <StatCard label="Planned this week" value={`${(weekHours / 3600).toFixed(1)} h`} icon={CalendarClockIcon} hint="From the shift calendar" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Next 7 days</CardTitle>
            <CardDescription>Planned production time from shifts, breaks and exceptions ({timeZone}).</CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary">
            <Link href="/maintenance/shifts">Shift calendar</Link>
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="min-w-[44rem]">
            <WeekPlan days={week} timeZone={timeZone} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>Preventive maintenance</CardTitle>
              <CardDescription>Plans for this machine.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary">
              <Link href={`/maintenance/pm?ws=${m.id}`}>Manage</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {plans.length === 0 ? (
              <p className="text-muted-foreground text-sm">No maintenance plans yet.</p>
            ) : (
              <ul className="divide-y">
                {plans.map((p) => (
                  <li key={p.id} className="hover:bg-accent/40 -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 transition-colors">
                    <div>
                      <p className="text-sm font-medium">{p.title}</p>
                      <p className="text-muted-foreground text-xs">
                        {p.trigger_type === "CALENDAR" ? `Every ${p.interval_days} days` : `Every ${p.interval_runtime_hours} runtime hours`}
                      </p>
                    </div>
                    <PmStatusBadge due={p.due} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>Recent downtime</CardTitle>
              <CardDescription>The last 12 stoppages.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary">
              <Link href={`/maintenance/downtime?ws=${m.id}`}>All downtime</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {downtime.length === 0 ? (
              <p className="text-muted-foreground text-sm">No downtime recorded.</p>
            ) : (
              <ul className="divide-y">
                {downtime.map((d) => (
                  <li key={d.id} className="hover:bg-accent/40 -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 text-sm transition-colors">
                    <div>
                      <p className="font-medium">
                        {downtimeReasonLabel(d.reason_code)}
                        {d.is_planned ? <span className="text-warning ml-2 text-xs">planned</span> : null}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        <LocalTime iso={d.started_at} />
                      </p>
                    </div>
                    <span className={d.ended_at ? "text-muted-foreground tabular-nums" : "text-destructive font-semibold"}>
                      {d.ended_at ? formatMinutes(d.seconds / 60) : "ongoing"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
