import Link from "next/link";
import { ArrowRightIcon, CheckCircle2Icon, OctagonAlertIcon, WrenchIcon } from "lucide-react";
import { Elapsed } from "@/components/shop-floor/elapsed";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db/client";
import { downtimeReasonLabel } from "@/lib/maintenance/constants";
import { pmDue, runtimeSeconds, type PmPlanRow } from "@/lib/maintenance/service";

async function loadMaintenance() {
  const [down, plans, runtime] = await Promise.all([
    db.all<{ id: number; code: string; reason_code: string; started_at: string; is_planned: number }>(
      `SELECT d.id, w.code, d.reason_code, d.started_at, d.is_planned
         FROM downtime_logs d JOIN workstations w ON w.id = d.workstation_id
        WHERE d.ended_at IS NULL ORDER BY d.started_at`,
    ),
    db.all<PmPlanRow>("SELECT * FROM pm_plans WHERE is_active = 1"),
    runtimeSeconds(),
  ]);
  const now = Date.now();
  const statuses = plans.map((p) => pmDue(p, runtime.get(p.workstation_id) ?? 0, now).status);
  return { down, overdue: statuses.filter((s) => s === "overdue").length, dueSoon: statuses.filter((s) => s === "due_soon").length };
}

/** Stopped machines and maintenance that is due, for maintenance managers. */
export async function MaintenanceCard() {
  const { down, overdue, dueSoon } = await loadMaintenance();
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <WrenchIcon className="text-primary size-4" /> Maintenance
          </CardTitle>
          <CardDescription>Stopped machines and services that are due.</CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary">
          <Link href="/maintenance/downtime">
            Downtime <ArrowRightIcon />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {down.length === 0 ? (
          <p className="text-success flex items-center gap-2 text-sm">
            <CheckCircle2Icon className="size-4" /> All machines are up.
          </p>
        ) : (
          <ul className="space-y-2">
            {down.map((d) => (
              <li key={d.id}>
                <Link
                  href="/maintenance/downtime?open=1"
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
                    d.is_planned ? "border-warning/40 hover:bg-warning/10" : "border-destructive/40 hover:bg-destructive/10"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <OctagonAlertIcon className={d.is_planned ? "text-warning size-4" : "text-destructive size-4"} />
                    <span className="font-mono font-medium">{d.code}</span>
                    <span className="text-muted-foreground">{downtimeReasonLabel(d.reason_code)}</span>
                  </span>
                  <Elapsed since={d.started_at} className="font-mono text-xs tabular-nums" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/maintenance/pm"
          className="hover:border-primary/40 hover:bg-accent/40 flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors"
        >
          <span>Preventive maintenance</span>
          <span className="flex gap-3 text-xs">
            <span className={overdue ? "text-destructive font-semibold" : "text-muted-foreground"}>{overdue} overdue</span>
            <span className={dueSoon ? "text-warning font-semibold" : "text-muted-foreground"}>{dueSoon} due soon</span>
          </span>
        </Link>
      </CardContent>
    </Card>
  );
}
