import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AlertTriangleIcon, ArrowLeftIcon, CheckCircle2Icon, PackageIcon, PercentIcon, TimerIcon, TrashIcon } from "lucide-react";
import { LocalTime } from "@/components/local-time";
import { PageSkeleton } from "@/components/page-skeleton";
import { PriorityBadge, WoStatusBadge } from "@/components/production/badges";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { formatCycleTime, RUN_TYPE_LABELS, scrapReasonLabel, type Priority, type RunType, type WoStatus } from "@/lib/production/constants";
import { materialRequirements } from "@/lib/production/queries";
import { formatQty } from "@/lib/quantity";
import { cn } from "@/lib/utils";
import { loadWorkOrderFormOptions } from "../form-options";
import { WorkOrderActions } from "./work-order-actions";

export const metadata: Metadata = { title: "Work order" };

export default function WorkOrderPage(props: PageProps<"/production/work-orders/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <WorkOrderContent {...props} />
    </Suspense>
  );
}

function duration(start: string, end: string | null): string {
  const ms = (end ? Date.parse(end) : Date.parse(start)) - Date.parse(start);
  if (!end) return "running";
  const minutes = Math.round(ms / 60000);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

async function WorkOrderContent({ params }: PageProps<"/production/work-orders/[id]">) {
  const user = await requirePermission("workorders.view");
  const { id: rawId } = await params;
  if (!/^\d+$/.test(rawId)) notFound();
  const id = Number(rawId);

  const wo = await db.get<{
    id: number;
    wo_number: string;
    bom_id: number;
    bom_version: number;
    item_id: number;
    sku: string;
    item_name: string;
    uom: string;
    workstation_id: number;
    ws_code: string;
    ws_name: string;
    qty_target_milli: number;
    qty_completed_milli: number;
    qty_scrap_milli: number;
    status: WoStatus;
    priority: Priority;
    due_date: string | null;
    ideal_cycle_time_ms: number | null;
    material_location_id: number;
    output_location_id: number;
    mat_code: string;
    out_code: string;
    notes: string | null;
    created_at: string;
    created_by: string | null;
    released_at: string | null;
    started_at: string | null;
    completed_at: string | null;
  }>(
    `SELECT o.*, h.version AS bom_version, i.sku, i.name AS item_name, i.uom, w.code AS ws_code, w.name AS ws_name,
            lm.code AS mat_code, lo.code AS out_code, u.full_name AS created_by
       FROM work_orders o
       JOIN bom_headers h ON h.id = o.bom_id
       JOIN items i ON i.id = o.item_id
       JOIN workstations w ON w.id = o.workstation_id
       JOIN locations lm ON lm.id = o.material_location_id
       JOIN locations lo ON lo.id = o.output_location_id
       LEFT JOIN users u ON u.id = o.created_by
      WHERE o.id = ?`,
    [id],
  );
  if (!wo) notFound();

  const canManage = can(user.role, "workorders.manage");
  const [materials, runs, events, options] = await Promise.all([
    materialRequirements(wo),
    db.all<{ id: number; run_type: RunType; start_time: string; end_time: string | null; end_reason: string | null; qty_good_milli: number; qty_scrap_milli: number; operator: string }>(
      `SELECT p.id, p.run_type, p.start_time, p.end_time, p.end_reason, p.qty_good_milli, p.qty_scrap_milli, u.full_name AS operator
         FROM production_logs p JOIN users u ON u.id = p.operator_id
        WHERE p.work_order_id = ? ORDER BY p.id DESC`,
      [id],
    ),
    db.all<{ id: number; qty_good_milli: number; qty_scrap_milli: number; scrap_reason_code: string | null; reported_at: string; reporter: string }>(
      `SELECT e.id, e.qty_good_milli, e.qty_scrap_milli, e.scrap_reason_code, e.reported_at, u.full_name AS reporter
         FROM production_output_events e JOIN users u ON u.id = e.reported_by
        WHERE e.work_order_id = ? ORDER BY e.id DESC LIMIT 25`,
      [id],
    ),
    canManage ? loadWorkOrderFormOptions() : Promise.resolve(null),
  ]);

  const pct = Math.min(100, Math.round((wo.qty_completed_milli / wo.qty_target_milli) * 100));
  const produced = wo.qty_completed_milli + wo.qty_scrap_milli;
  const scrapRate = produced > 0 ? (wo.qty_scrap_milli / produced) * 100 : 0;
  const openRun = runs.find((r) => !r.end_time);
  const shortages = materials.filter((m) => m.requiredMilli - m.consumedMilli > m.availableMilli);
  const remainingTarget = Math.max(0, wo.qty_target_milli - wo.qty_completed_milli);

  return (
    <>
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-primary -ml-2">
          <Link href="/production/work-orders">
            <ArrowLeftIcon /> Work orders
          </Link>
        </Button>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-2xl font-semibold tracking-tight">{wo.wo_number}</h1>
              <WoStatusBadge status={wo.status} />
              <PriorityBadge priority={wo.priority} />
            </div>
            <p className="text-lg">
              <Link href={`/inventory/items/${wo.item_id}`} className="hover:text-primary font-mono transition-colors">
                {wo.sku}
              </Link>{" "}
              · {wo.item_name}
            </p>
            <p className="text-muted-foreground text-sm">
              <Link href={`/production/boms/${wo.bom_id}`} className="hover:text-primary transition-colors">
                BOM v{wo.bom_version}
              </Link>{" "}
              · <span className="font-mono">{wo.ws_code}</span> {wo.ws_name} · materials from {wo.mat_code}, output to {wo.out_code}
              {wo.due_date && <> · due {wo.due_date}</>}
            </p>
            {wo.notes && <p className="text-muted-foreground max-w-2xl text-sm italic">{wo.notes}</p>}
          </div>
          {canManage && options && (
            <WorkOrderActions
              workOrderId={wo.id}
              status={wo.status}
              hasOpenRun={Boolean(openRun)}
              hasRuns={runs.length > 0}
              options={options}
              editable={{
                id: wo.id,
                woNumber: wo.wo_number,
                itemId: wo.item_id,
                sku: wo.sku,
                itemName: wo.item_name,
                uom: wo.uom,
                qtyTargetMilli: wo.qty_target_milli,
                dueDate: wo.due_date,
                priority: wo.priority,
                workstationId: wo.workstation_id,
                materialLocationId: wo.material_location_id,
                outputLocationId: wo.output_location_id,
                notes: wo.notes,
              }}
            />
          )}
        </div>
      </div>

      <Card className="hover-lift">
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium">Good output</p>
            <p className="tabular-nums">
              <span className="text-2xl font-semibold">{formatQty(wo.qty_completed_milli)}</span>
              <span className="text-muted-foreground"> / {formatQty(wo.qty_target_milli, wo.uom)}</span>
              <span className="text-primary ml-2 font-medium">{pct}%</span>
            </p>
          </div>
          <Progress value={pct} className="h-3" />
          {openRun && (
            <p className="text-primary flex items-center gap-2 text-sm">
              <span className="bg-primary size-2 animate-pulse rounded-full" />
              {RUN_TYPE_LABELS[openRun.run_type]} in progress by {openRun.operator} since <LocalTime iso={openRun.start_time} />
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Remaining" value={formatQty(remainingTarget, wo.uom)} icon={PackageIcon} hint="Good units still to make" />
        <StatCard label="Scrap" value={formatQty(wo.qty_scrap_milli, wo.uom)} icon={TrashIcon} hint={`${scrapRate.toFixed(1)}% of units produced`} />
        <StatCard label="Ideal cycle time" value={formatCycleTime(wo.ideal_cycle_time_ms)} icon={TimerIcon} hint={wo.ideal_cycle_time_ms ? `On ${wo.ws_code}` : "Not in the routing"} />
        <StatCard label="Yield" value={produced > 0 ? `${(100 - scrapRate).toFixed(1)}%` : "—"} icon={PercentIcon} hint="Good ÷ (good + scrap)" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Materials
            {shortages.length > 0 && wo.status !== "COMPLETED" && wo.status !== "CANCELLED" && (
              <Badge variant="outline" className="border-warning/50 text-warning">
                <AlertTriangleIcon /> {shortages.length} short at {wo.mat_code}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>For the full target, including scrap allowances. Consumed automatically as output is reported, oldest lots first.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader className="bg-muted/60">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Component</TableHead>
                  <TableHead className="text-right">Required</TableHead>
                  <TableHead className="text-right">Consumed</TableHead>
                  <TableHead className="hidden w-48 md:table-cell">Usage</TableHead>
                  <TableHead className="pr-4 text-right">Available at {wo.mat_code}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materials.map((m) => {
                  const still = Math.max(0, m.requiredMilli - m.consumedMilli);
                  const short = still > m.availableMilli;
                  return (
                    <TableRow key={m.itemId} className="hover:bg-accent/40 transition-colors">
                      <TableCell className="pl-4">
                        <Link href={`/inventory/items/${m.itemId}`} className="hover:text-primary font-mono text-sm font-medium transition-colors">
                          {m.sku}
                        </Link>
                        <p className="text-muted-foreground max-w-56 truncate text-xs">{m.name}</p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatQty(m.requiredMilli, m.uom)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatQty(m.consumedMilli, m.uom)}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Progress value={m.requiredMilli ? Math.min(100, (m.consumedMilli / m.requiredMilli) * 100) : 0} className="h-1.5" />
                      </TableCell>
                      <TableCell className={cn("pr-4 text-right tabular-nums", short && "text-warning font-medium")}>
                        {formatQty(m.availableMilli, m.uom)}
                        {short && <span className="block text-xs">needs {formatQty(still, m.uom)}</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Runs</CardTitle>
            <CardDescription>Setup and production segments logged on the shop floor.</CardDescription>
          </CardHeader>
          <CardContent>
            {runs.length === 0 ? (
              <p className="text-muted-foreground text-sm">No runs yet.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border">
                <Table>
                  <TableHeader className="bg-muted/60">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-4">Started</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="hidden sm:table-cell">Operator</TableHead>
                      <TableHead className="text-right">Good</TableHead>
                      <TableHead className="text-right">Scrap</TableHead>
                      <TableHead className="pr-4 text-right">Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.map((r) => (
                      <TableRow key={r.id} className={cn("hover:bg-accent/40 transition-colors", !r.end_time && "bg-primary/[0.04]")}>
                        <TableCell className="text-muted-foreground pl-4 text-sm whitespace-nowrap">
                          <LocalTime iso={r.start_time} />
                        </TableCell>
                        <TableCell>
                          <Badge variant={r.run_type === "SETUP" ? "outline" : "secondary"}>{RUN_TYPE_LABELS[r.run_type]}</Badge>
                        </TableCell>
                        <TableCell className="hidden text-sm sm:table-cell">{r.operator}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatQty(r.qty_good_milli)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatQty(r.qty_scrap_milli)}</TableCell>
                        <TableCell className="text-muted-foreground pr-4 text-right text-sm">
                          {r.end_time ? duration(r.start_time, r.end_time) : <span className="text-primary font-medium">running</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Output reports</CardTitle>
            <CardDescription>The latest counts reported from the floor.</CardDescription>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing reported yet.</p>
            ) : (
              <ul className="divide-y">
                {events.map((e) => (
                  <li key={e.id} className="hover:bg-accent/50 -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2 text-sm transition-colors">
                    <div>
                      <p className="tabular-nums">
                        {e.qty_good_milli > 0 && (
                          <span className="text-success inline-flex items-center gap-1 font-medium">
                            <CheckCircle2Icon className="size-3.5" /> {formatQty(e.qty_good_milli, wo.uom)}
                          </span>
                        )}
                        {e.qty_scrap_milli > 0 && (
                          <span className="text-destructive ml-2 font-medium">
                            {formatQty(e.qty_scrap_milli, wo.uom)} scrap · {scrapReasonLabel(e.scrap_reason_code)}
                          </span>
                        )}
                      </p>
                      <p className="text-muted-foreground text-xs">{e.reporter}</p>
                    </div>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      <LocalTime iso={e.reported_at} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-muted-foreground text-xs">
        Created <LocalTime iso={wo.created_at} />
        {wo.created_by && <> by {wo.created_by}</>}
        {wo.released_at && (
          <>
            {" "}
            · released <LocalTime iso={wo.released_at} />
          </>
        )}
        {wo.started_at && (
          <>
            {" "}
            · started <LocalTime iso={wo.started_at} />
          </>
        )}
        {wo.completed_at && (
          <>
            {" "}
            · completed <LocalTime iso={wo.completed_at} />
          </>
        )}
      </p>
    </>
  );
}
