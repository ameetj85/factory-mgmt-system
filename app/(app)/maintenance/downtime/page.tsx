import type { Metadata } from "next";
import { Suspense } from "react";
import { ClockIcon, OctagonAlertIcon, TimerOffIcon, WrenchIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { db, SQL_NOW, type SqlValue } from "@/lib/db/client";
import { downtimeReasonLabel, formatMinutes } from "@/lib/maintenance/constants";
import { activeWorkstationOptions } from "@/lib/production/queries";
import { DowntimeFilters } from "./downtime-filters";
import { DowntimeTable, type DowntimeRow } from "./downtime-table";
import { LogPastDowntimeDialog } from "./log-past-dialog";
import { ReportStopDialog } from "./report-stop-dialog";

export const metadata: Metadata = { title: "Downtime" };

export default function DowntimePage(props: PageProps<"/maintenance/downtime">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DowntimeContent {...props} />
    </Suspense>
  );
}

const DURATION = `(unixepoch(COALESCE(d.ended_at, ${SQL_NOW})) - unixepoch(d.started_at))`;

async function DowntimeContent({ searchParams }: PageProps<"/maintenance/downtime">) {
  const user = await requirePermission("downtime.report");
  const params = await searchParams;
  const workstationId = typeof params.ws === "string" && /^\d+$/.test(params.ws) ? Number(params.ws) : undefined;
  const openOnly = params.open === "1";
  const canManage = can(user.role, "maintenance.manage");

  const where: string[] = [];
  const args: SqlValue[] = [];
  if (workstationId) {
    where.push("d.workstation_id = ?");
    args.push(workstationId);
  }
  if (openOnly) where.push("d.ended_at IS NULL");

  const since = "strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')";
  const [rows, summary, byReason, workstations] = await Promise.all([
    db.all<DowntimeRow>(
      `SELECT d.id, w.code AS workstationCode, d.reason_code AS reasonCode, d.is_planned = 1 AS isPlanned, d.started_at AS startedAt,
              d.ended_at AS endedAt, ${DURATION} AS seconds, d.notes, d.resolution_notes AS resolutionNotes, d.is_retroactive = 1 AS isRetroactive,
              ru.full_name AS reportedBy, vu.full_name AS resolvedBy,
              (o.status IN ('RELEASED', 'IN_PROGRESS')) AS canResume, o.wo_number AS pausedWo
         FROM downtime_logs d
         JOIN workstations w ON w.id = d.workstation_id
         JOIN users ru ON ru.id = d.reported_by
         LEFT JOIN users vu ON vu.id = d.resolved_by
         LEFT JOIN production_logs p ON p.id = d.paused_run_id
         LEFT JOIN work_orders o ON o.id = p.work_order_id
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY d.ended_at IS NOT NULL, d.started_at DESC
        LIMIT 200`,
      args,
    ),
    db.get<{ unplanned: number | null; planned: number | null; open_count: number; events: number }>(
      `SELECT SUM(CASE WHEN d.is_planned = 0 THEN ${DURATION} END) AS unplanned,
              SUM(CASE WHEN d.is_planned = 1 THEN ${DURATION} END) AS planned,
              (SELECT COUNT(*) FROM downtime_logs WHERE ended_at IS NULL) AS open_count,
              COUNT(*) AS events
         FROM downtime_logs d WHERE d.started_at > ${since}`,
    ),
    db.all<{ reason_code: string; seconds: number; n: number }>(
      `SELECT d.reason_code, SUM(${DURATION}) AS seconds, COUNT(*) AS n
         FROM downtime_logs d WHERE d.started_at > ${since}
        GROUP BY d.reason_code ORDER BY seconds DESC LIMIT 6`,
    ),
    activeWorkstationOptions(),
  ]);
  const maxReason = Math.max(1, ...byReason.map((r) => r.seconds));

  return (
    <>
      <PageHeader title="Downtime" description="Stoppages by machine and reason. Unplanned stops reduce availability in OEE.">
        {canManage && <LogPastDowntimeDialog workstations={workstations} />}
        <ReportStopDialog workstations={workstations} />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Stopped now"
          value={summary?.open_count ?? 0}
          icon={OctagonAlertIcon}
          hint="Open downtime events"
          className={summary?.open_count ? "ring-destructive/30 ring-1" : undefined}
        />
        <StatCard label="Unplanned (7 days)" value={formatMinutes((summary?.unplanned ?? 0) / 60)} icon={TimerOffIcon} hint="Counts against availability" />
        <StatCard label="Planned (7 days)" value={formatMinutes((summary?.planned ?? 0) / 60)} icon={WrenchIcon} hint="Planned maintenance" />
        <StatCard label="Events (7 days)" value={summary?.events ?? 0} icon={ClockIcon} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
        <Card>
          <CardContent className="space-y-4">
            <DowntimeFilters workstations={workstations} workstationId={workstationId} openOnly={openOnly} />
            {rows.length === 0 ? (
              <EmptyState icon={OctagonAlertIcon} title={openOnly ? "No machines are stopped" : "No downtime recorded"} />
            ) : (
              <DowntimeTable rows={rows.map((r) => ({ ...r, isPlanned: Boolean(r.isPlanned), isRetroactive: Boolean(r.isRetroactive), canResume: Boolean(r.canResume) }))} />
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Top reasons</CardTitle>
            <CardDescription>Time lost in the last 7 days.</CardDescription>
          </CardHeader>
          <CardContent>
            {byReason.length === 0 ? (
              <p className="text-muted-foreground text-sm">No stoppages this week.</p>
            ) : (
              <ul className="space-y-3">
                {byReason.map((r) => (
                  <li key={r.reason_code} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{downtimeReasonLabel(r.reason_code)}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {formatMinutes(r.seconds / 60)} · {r.n}×
                      </span>
                    </div>
                    <div className="bg-muted h-2 overflow-hidden rounded-full">
                      <div className="bg-primary h-full rounded-full" style={{ width: `${(r.seconds / maxReason) * 100}%` }} />
                    </div>
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
