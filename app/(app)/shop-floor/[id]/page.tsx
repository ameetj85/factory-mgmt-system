import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { PageSkeleton } from "@/components/page-skeleton";
import { WorkstationStatusBadge } from "@/components/production/badges";
import { AutoRefresh } from "@/components/shop-floor/auto-refresh";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/dal";
import { db, SQL_NOW } from "@/lib/db/client";
import type { RunType, WorkstationStatus } from "@/lib/production/constants";
import { RunConsole, type ActiveRun } from "./run-console";
import { WorkQueue, type QueuedOrder } from "./work-queue";

export const metadata: Metadata = { title: "Workstation" };

export default function WorkstationConsolePage(props: PageProps<"/shop-floor/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ConsoleContent {...props} />
    </Suspense>
  );
}

async function ConsoleContent({ params }: PageProps<"/shop-floor/[id]">) {
  const user = await requirePermission("shopfloor.operate");
  const { id: rawId } = await params;
  if (!/^\d+$/.test(rawId)) notFound();
  const id = Number(rawId);

  const ws = await db.get<{ id: number; code: string; name: string; status: WorkstationStatus; is_active: number }>(
    "SELECT id, code, name, status, is_active FROM workstations WHERE id = ?",
    [id],
  );
  if (!ws || !ws.is_active) notFound();

  const [run, queue] = await Promise.all([
    db.get<{
      id: number;
      run_type: RunType;
      start_time: string;
      qty_good_milli: number;
      qty_scrap_milli: number;
      operator_id: number;
      operator: string;
      wo_id: number;
      wo_number: string;
      sku: string;
      item_name: string;
      uom: string;
      qty_target_milli: number;
      qty_completed_milli: number;
      qty_scrap_total_milli: number;
      notes: string | null;
    }>(
      `SELECT p.id, p.run_type, p.start_time, p.qty_good_milli, p.qty_scrap_milli, p.operator_id, u.full_name AS operator,
              o.id AS wo_id, o.wo_number, i.sku, i.name AS item_name, i.uom, o.qty_target_milli, o.qty_completed_milli,
              o.qty_scrap_milli AS qty_scrap_total_milli, o.notes
         FROM production_logs p
         JOIN users u ON u.id = p.operator_id
         JOIN work_orders o ON o.id = p.work_order_id
         JOIN items i ON i.id = o.item_id
        WHERE p.workstation_id = ? AND p.end_time IS NULL`,
      [id],
    ),
    db.all<QueuedOrder>(
      `SELECT o.id, o.wo_number AS woNumber, i.sku, i.name AS itemName, i.uom, o.qty_target_milli AS qtyTargetMilli,
              o.qty_completed_milli AS qtyCompletedMilli, o.status, o.priority, o.due_date AS dueDate, o.notes,
              (o.due_date IS NOT NULL AND o.due_date < substr(${SQL_NOW}, 1, 10)) AS overdue
         FROM work_orders o JOIN items i ON i.id = o.item_id
        WHERE o.workstation_id = ? AND o.status IN ('RELEASED', 'IN_PROGRESS', 'ON_HOLD')
        ORDER BY o.status = 'ON_HOLD', CASE o.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
                 o.due_date IS NULL, o.due_date, o.id`,
      [id],
    ),
  ]);

  const activeRun: ActiveRun | null = run
    ? {
        id: run.id,
        runType: run.run_type,
        startTime: run.start_time,
        runGoodMilli: run.qty_good_milli,
        runScrapMilli: run.qty_scrap_milli,
        operator: run.operator,
        isMine: run.operator_id === user.id,
        workOrderId: run.wo_id,
        woNumber: run.wo_number,
        sku: run.sku,
        itemName: run.item_name,
        uom: run.uom,
        targetMilli: run.qty_target_milli,
        completedMilli: run.qty_completed_milli,
        scrapTotalMilli: run.qty_scrap_total_milli,
        notes: run.notes,
      }
    : null;

  return (
    <>
      <AutoRefresh seconds={20} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="icon-lg" className="hover:text-primary size-12" aria-label="All workstations">
            <Link href="/shop-floor">
              <ArrowLeftIcon className="size-5" />
            </Link>
          </Button>
          <div>
            <h1 className="font-mono text-3xl font-bold tracking-tight">{ws.code}</h1>
            <p className="text-muted-foreground">{ws.name}</p>
          </div>
        </div>
        <WorkstationStatusBadge status={ws.status} />
      </div>

      {activeRun ? (
        <RunConsole run={activeRun} />
      ) : (
        <WorkQueue
          workstationId={ws.id}
          blocked={ws.status === "DOWN" || ws.status === "MAINTENANCE" ? ws.status : null}
          orders={queue.map((q) => ({ ...q, overdue: Boolean(q.overdue) }))}
        />
      )}
    </>
  );
}
