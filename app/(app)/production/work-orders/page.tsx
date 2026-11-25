import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ClipboardCheckIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { PriorityBadge, WoStatusBadge } from "@/components/production/badges";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { db, SQL_NOW, type SqlValue } from "@/lib/db/client";
import type { Priority, WoStatus } from "@/lib/production/constants";
import { formatQty } from "@/lib/quantity";
import { cn } from "@/lib/utils";
import { loadWorkOrderFormOptions } from "./form-options";
import { WorkOrderDialog } from "./work-order-dialog";
import { WorkOrderFilters } from "./work-order-filters";

export const metadata: Metadata = { title: "Work orders" };

const VIEWS = {
  open: { label: "Open", statuses: ["DRAFT", "RELEASED", "IN_PROGRESS", "ON_HOLD"] },
  completed: { label: "Completed", statuses: ["COMPLETED"] },
  cancelled: { label: "Cancelled", statuses: ["CANCELLED"] },
} as const;
type View = keyof typeof VIEWS;

export default function WorkOrdersPage(props: PageProps<"/production/work-orders">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <WorkOrdersContent {...props} />
    </Suspense>
  );
}

async function WorkOrdersContent({ searchParams }: PageProps<"/production/work-orders">) {
  const user = await requirePermission("workorders.view");
  const params = await searchParams;
  const view: View = params.view === "completed" || params.view === "cancelled" ? params.view : "open";
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const workstationId = typeof params.ws === "string" && /^\d+$/.test(params.ws) ? Number(params.ws) : undefined;
  const canManage = can(user.role, "workorders.manage");

  const statuses = VIEWS[view].statuses;
  const where = [`o.status IN (${statuses.map(() => "?").join(", ")})`];
  const args: SqlValue[] = [...statuses];
  if (q) {
    where.push("(o.wo_number LIKE ? OR i.sku LIKE ? OR i.name LIKE ?)");
    args.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (workstationId) {
    where.push("o.workstation_id = ?");
    args.push(workstationId);
  }

  const [rows, counts, options] = await Promise.all([
    db.all<{
      id: number;
      wo_number: string;
      sku: string;
      item_name: string;
      uom: string;
      qty_target_milli: number;
      qty_completed_milli: number;
      status: WoStatus;
      priority: Priority;
      due_date: string | null;
      ws_code: string;
      overdue: number;
    }>(
      `SELECT o.id, o.wo_number, i.sku, i.name AS item_name, i.uom, o.qty_target_milli, o.qty_completed_milli, o.status, o.priority,
              o.due_date, w.code AS ws_code,
              (o.due_date IS NOT NULL AND o.due_date < substr(${SQL_NOW}, 1, 10) AND o.status NOT IN ('COMPLETED', 'CANCELLED')) AS overdue
         FROM work_orders o JOIN items i ON i.id = o.item_id JOIN workstations w ON w.id = o.workstation_id
        WHERE ${where.join(" AND ")}
        ORDER BY ${view === "open" ? "CASE o.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, o.due_date IS NULL, o.due_date, o.id" : "o.id DESC"}
        LIMIT 300`,
      args,
    ),
    db.all<{ status: WoStatus; n: number }>("SELECT status, COUNT(*) AS n FROM work_orders GROUP BY status"),
    canManage ? loadWorkOrderFormOptions() : Promise.resolve(null),
  ]);
  const countFor = (v: View) => counts.filter((c) => (VIEWS[v].statuses as readonly string[]).includes(c.status)).reduce((s, c) => s + c.n, 0);
  const workstations = await db.all<{ id: number; code: string }>("SELECT id, code FROM workstations ORDER BY code COLLATE NOCASE");

  return (
    <>
      <PageHeader title="Work orders" description="Production runs scheduled against a recipe, quantity and due date.">
        {options && <WorkOrderDialog options={options} />}
      </PageHeader>

      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <nav className="bg-muted inline-flex w-fit rounded-lg p-1" aria-label="Filter by status">
              {(Object.keys(VIEWS) as View[]).map((v) => (
                <Link
                  key={v}
                  href={v === "open" ? "/production/work-orders" : `/production/work-orders?view=${v}`}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                    view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-primary",
                  )}
                >
                  {VIEWS[v].label}
                  <span className="bg-muted-foreground/15 rounded-full px-1.5 text-xs tabular-nums">{countFor(v)}</span>
                </Link>
              ))}
            </nav>
            <WorkOrderFilters q={q} workstationId={workstationId} workstations={workstations} />
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={ClipboardCheckIcon}
              title={q || workstationId ? "No work orders match these filters" : `No ${VIEWS[view].label.toLowerCase()} work orders`}
              description={view === "open" && canManage ? "Create a work order from an item with an active bill of materials." : undefined}
            />
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader className="bg-muted/60">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">Work order</TableHead>
                    <TableHead className="w-56">Progress</TableHead>
                    <TableHead className="hidden md:table-cell">Workstation</TableHead>
                    <TableHead className="hidden lg:table-cell">Due</TableHead>
                    <TableHead className="hidden sm:table-cell">Priority</TableHead>
                    <TableHead className="pr-4">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const pct = Math.min(100, Math.round((r.qty_completed_milli / r.qty_target_milli) * 100));
                    return (
                      <TableRow key={r.id} className="group hover:bg-accent/40 transition-colors">
                        <TableCell className="pl-4">
                          <Link href={`/production/work-orders/${r.id}`} className="block">
                            <span className="group-hover:text-primary font-mono text-sm font-medium transition-colors">{r.wo_number}</span>
                            <span className="text-muted-foreground block max-w-xs truncate text-xs">
                              {r.sku} · {r.item_name}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <Progress value={pct} className="h-1.5" />
                            <p className="text-muted-foreground text-xs tabular-nums">
                              {formatQty(r.qty_completed_milli)} / {formatQty(r.qty_target_milli, r.uom)} · {pct}%
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="hidden font-mono text-sm md:table-cell">{r.ws_code}</TableCell>
                        <TableCell className={cn("hidden text-sm tabular-nums lg:table-cell", r.overdue ? "text-destructive font-medium" : "text-muted-foreground")}>
                          {r.due_date ?? "—"}
                          {r.overdue ? <span className="block text-xs">Overdue</span> : null}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <PriorityBadge priority={r.priority} />
                        </TableCell>
                        <TableCell className="pr-4">
                          <WoStatusBadge status={r.status} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
