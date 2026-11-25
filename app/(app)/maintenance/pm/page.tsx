import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AlarmClockIcon, CheckCircle2Icon, OctagonAlertIcon, WrenchIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LocalTime } from "@/components/local-time";
import { PmStatusBadge } from "@/components/maintenance/pm-status-badge";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { requirePermission } from "@/lib/auth/dal";
import { db } from "@/lib/db/client";
import { formatHours } from "@/lib/maintenance/constants";
import { pmDue, runtimeSeconds, type PmPlanRow } from "@/lib/maintenance/service";
import { activeWorkstationOptions } from "@/lib/production/queries";
import { cn } from "@/lib/utils";
import { PlanDialog } from "./plan-dialog";
import { PlanActions } from "./plan-actions";
import { PmFilter } from "./pm-filter";

export const metadata: Metadata = { title: "Preventive maintenance" };

export default function PmPage(props: PageProps<"/maintenance/pm">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PmContent {...props} />
    </Suspense>
  );
}

const ORDER = { overdue: 0, due_soon: 1, ok: 2, inactive: 3 } as const;

async function loadPlans(workstationId?: number) {
  const [plans, runtime, workstations, completions] = await Promise.all([
    db.all<PmPlanRow & { ws_code: string; last_done: string | null; last_by: string | null }>(
      `SELECT p.*, w.code AS ws_code,
              (SELECT MAX(completed_at) FROM pm_completions c WHERE c.plan_id = p.id) AS last_done,
              (SELECT u.full_name FROM pm_completions c JOIN users u ON u.id = c.completed_by WHERE c.plan_id = p.id ORDER BY c.id DESC LIMIT 1) AS last_by
         FROM pm_plans p JOIN workstations w ON w.id = p.workstation_id
        ${workstationId ? "WHERE p.workstation_id = ?" : ""}`,
      workstationId ? [workstationId] : [],
    ),
    runtimeSeconds(),
    activeWorkstationOptions(),
    db.all<{ id: number; title: string; ws_code: string; completed_at: string; by_name: string; notes: string | null }>(
      `SELECT c.id, p.title, w.code AS ws_code, c.completed_at, u.full_name AS by_name, c.notes
         FROM pm_completions c JOIN pm_plans p ON p.id = c.plan_id JOIN workstations w ON w.id = p.workstation_id JOIN users u ON u.id = c.completed_by
        ${workstationId ? "WHERE p.workstation_id = ?" : ""}
        ORDER BY c.id DESC LIMIT 10`,
      workstationId ? [workstationId] : [],
    ),
  ]);
  const now = Date.now();
  const rows = plans
    .map((p) => ({ ...p, due: pmDue(p, runtime.get(p.workstation_id) ?? 0, now) }))
    .sort((a, b) => ORDER[a.due.status] - ORDER[b.due.status] || b.due.progress - a.due.progress);
  return { rows, workstations, completions };
}

async function PmContent({ searchParams }: PageProps<"/maintenance/pm">) {
  await requirePermission("maintenance.manage");
  const params = await searchParams;
  const workstationId = typeof params.ws === "string" && /^\d+$/.test(params.ws) ? Number(params.ws) : undefined;
  const { rows, workstations, completions } = await loadPlans(workstationId);
  const count = (s: string) => rows.filter((r) => r.due.status === s).length;

  return (
    <>
      <PageHeader title="Preventive maintenance" description="Recurring services by calendar interval or machine runtime hours.">
        <PlanDialog workstations={workstations} defaultWorkstationId={workstationId} />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Overdue" value={count("overdue")} icon={OctagonAlertIcon} className={count("overdue") ? "ring-destructive/30 ring-1" : undefined} />
        <StatCard label="Due soon" value={count("due_soon")} icon={AlarmClockIcon} hint="85% or more of the interval used" />
        <StatCard label="Up to date" value={count("ok")} icon={CheckCircle2Icon} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Card>
          <CardContent className="space-y-4">
            <PmFilter workstations={workstations} workstationId={workstationId} />
            {rows.length === 0 ? (
              <EmptyState icon={WrenchIcon} title="No maintenance plans" description="Add a plan such as a monthly lubrication or a 500-hour spindle service." />
            ) : (
              <ul className="space-y-3">
                {rows.map((p) => (
                  <li
                    key={p.id}
                    className={cn(
                      "hover:border-primary/30 rounded-xl border p-4 transition-colors",
                      p.due.status === "overdue" && "border-destructive/40 bg-destructive/[0.03]",
                      p.due.status === "inactive" && "opacity-60",
                    )}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{p.title}</span>
                          <PmStatusBadge due={p.due} />
                        </div>
                        <p className="text-muted-foreground text-sm">
                          <Link href={`/maintenance/machines/${p.workstation_id}`} className="hover:text-primary font-mono transition-colors">
                            {p.ws_code}
                          </Link>{" "}
                          · {p.trigger_type === "CALENDAR" ? `every ${p.interval_days} days` : `every ${p.interval_runtime_hours} runtime hours`}
                          {p.estimated_minutes && <> · about {p.estimated_minutes} min</>}
                        </p>
                        <div className="flex items-center gap-3 pt-1">
                          <Progress value={Math.min(100, p.due.progress * 100)} className="h-1.5 max-w-xs" />
                          <span className={cn("text-xs tabular-nums", p.due.status === "overdue" ? "text-destructive font-medium" : "text-muted-foreground")}>
                            {p.trigger_type === "CALENDAR" ? (
                              <>
                                due <LocalTime iso={p.due.dueAt} />
                              </>
                            ) : p.due.runtimeRemainingSeconds! >= 0 ? (
                              `${formatHours(p.due.runtimeRemainingSeconds!)} to go`
                            ) : (
                              `${formatHours(-p.due.runtimeRemainingSeconds!)} over`
                            )}
                          </span>
                        </div>
                        <p className="text-muted-foreground text-xs">
                          {p.last_done ? (
                            <>
                              Last done <LocalTime iso={p.last_done} /> by {p.last_by}
                            </>
                          ) : (
                            "Not done yet in this system"
                          )}
                        </p>
                        {p.instructions && <p className="text-muted-foreground line-clamp-2 pt-1 text-sm whitespace-pre-line">{p.instructions}</p>}
                      </div>
                      <PlanActions
                        plan={{
                          id: p.id,
                          title: p.title,
                          workstationId: p.workstation_id,
                          workstationCode: p.ws_code,
                          instructions: p.instructions,
                          triggerType: p.trigger_type,
                          intervalDays: p.interval_days,
                          intervalHours: p.interval_runtime_hours,
                          estimatedMinutes: p.estimated_minutes,
                          isActive: p.is_active === 1,
                        }}
                        workstations={workstations}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Recently completed</CardTitle>
            <CardDescription>The latest services recorded.</CardDescription>
          </CardHeader>
          <CardContent>
            {completions.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing recorded yet.</p>
            ) : (
              <ul className="divide-y">
                {completions.map((c) => (
                  <li key={c.id} className="hover:bg-accent/40 -mx-2 rounded-md px-2 py-2.5 text-sm transition-colors">
                    <p className="font-medium">{c.title}</p>
                    <p className="text-muted-foreground text-xs">
                      <span className="font-mono">{c.ws_code}</span> · <LocalTime iso={c.completed_at} /> · {c.by_name}
                    </p>
                    {c.notes && <p className="text-muted-foreground line-clamp-2 text-xs italic">{c.notes}</p>}
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
