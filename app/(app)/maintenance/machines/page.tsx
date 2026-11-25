import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CogIcon, GaugeIcon, OctagonAlertIcon, WrenchIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { WorkstationStatusBadge } from "@/components/production/badges";
import { Elapsed } from "@/components/shop-floor/elapsed";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/dal";
import { db } from "@/lib/db/client";
import { downtimeReasonLabel, formatHours } from "@/lib/maintenance/constants";
import { pmDue, runtimeSeconds, type PmPlanRow } from "@/lib/maintenance/service";
import type { WorkstationStatus } from "@/lib/production/constants";
import { formatCents } from "@/lib/quantity";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Machines" };

export default function MachinesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MachinesContent />
    </Suspense>
  );
}

async function loadMachines() {
  const [machines, runtime, plans] = await Promise.all([
    db.all<{
      id: number;
      code: string;
      name: string;
      status: WorkstationStatus;
      asset_tag: string | null;
      manufacturer: string | null;
      model: string | null;
      hourly_rate_cents: number | null;
      down_reason: string | null;
      down_since: string | null;
    }>(
      `SELECT w.id, w.code, w.name, w.status, w.asset_tag, w.manufacturer, w.model, w.hourly_rate_cents,
              d.reason_code AS down_reason, d.started_at AS down_since
         FROM workstations w LEFT JOIN downtime_logs d ON d.workstation_id = w.id AND d.ended_at IS NULL
        WHERE w.is_active = 1 ORDER BY w.code COLLATE NOCASE`,
    ),
    runtimeSeconds(),
    db.all<PmPlanRow>("SELECT * FROM pm_plans WHERE is_active = 1"),
  ]);
  // Passed into pmDue rather than read during render, so this stays a plain data step.
  const now = Date.now();
  return machines.map((m) => {
    const seconds = runtime.get(m.id) ?? 0;
    const statuses = plans.filter((p) => p.workstation_id === m.id).map((p) => pmDue(p, seconds, now).status);
    return {
      ...m,
      runtimeSeconds: seconds,
      pmOverdue: statuses.filter((s) => s === "overdue").length,
      pmDueSoon: statuses.filter((s) => s === "due_soon").length,
      pmTotal: statuses.length,
    };
  });
}

async function MachinesContent() {
  await requirePermission("maintenance.manage");
  const machines = await loadMachines();

  return (
    <>
      <PageHeader title="Machines" description="Asset register for every workstation: status, runtime hours, run rate and maintenance health." />
      {machines.length === 0 ? (
        <EmptyState icon={CogIcon} title="No machines yet" description="Machines are the workstations set up under Production." />
      ) : (
        <Card>
          <CardContent>
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader className="bg-muted/60">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">Machine</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Make / model</TableHead>
                    <TableHead className="text-right">Runtime</TableHead>
                    <TableHead className="hidden text-right lg:table-cell">Run rate</TableHead>
                    <TableHead className="pr-4">Maintenance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {machines.map((m) => (
                    <TableRow key={m.id} className={cn("group hover:bg-accent/40 transition-colors", m.down_reason && "bg-destructive/[0.04]")}>
                      <TableCell className="pl-4">
                        <Link href={`/maintenance/machines/${m.id}`} className="flex items-center gap-3">
                          <div className="bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground flex size-9 items-center justify-center rounded-lg transition-colors">
                            <CogIcon className="size-4" />
                          </div>
                          <div>
                            <p className="group-hover:text-primary font-mono text-sm font-medium transition-colors">{m.code}</p>
                            <p className="text-muted-foreground text-xs">
                              {m.name}
                              {m.asset_tag && <> · {m.asset_tag}</>}
                            </p>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <WorkstationStatusBadge status={m.status} />
                        {m.down_reason && (
                          <p className="text-destructive mt-1 text-xs">
                            {downtimeReasonLabel(m.down_reason)} · <Elapsed since={m.down_since!} />
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden text-sm md:table-cell">
                        {[m.manufacturer, m.model].filter(Boolean).join(" ") || "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <GaugeIcon className="text-muted-foreground size-3.5" /> {formatHours(m.runtimeSeconds)}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden text-right tabular-nums lg:table-cell">
                        {m.hourly_rate_cents != null ? `${formatCents(m.hourly_rate_cents)}/h` : "—"}
                      </TableCell>
                      <TableCell className="pr-4">
                        {m.pmTotal === 0 ? (
                          <span className="text-muted-foreground text-xs">No plans</span>
                        ) : m.pmOverdue > 0 ? (
                          <Badge variant="outline" className="border-destructive/40 text-destructive">
                            <OctagonAlertIcon /> {m.pmOverdue} overdue
                          </Badge>
                        ) : m.pmDueSoon > 0 ? (
                          <Badge variant="outline" className="border-warning/50 text-warning">
                            <WrenchIcon /> {m.pmDueSoon} due soon
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-success/40 text-success">
                            Up to date
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
