import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FactoryIcon, UserIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { WorkstationStatusBadge } from "@/components/production/badges";
import { AutoRefresh } from "@/components/shop-floor/auto-refresh";
import { Elapsed } from "@/components/shop-floor/elapsed";
import { Progress } from "@/components/ui/progress";
import { requirePermission } from "@/lib/auth/dal";
import { db } from "@/lib/db/client";
import { RUN_TYPE_LABELS, type RunType, type WorkstationStatus } from "@/lib/production/constants";
import { formatQty } from "@/lib/quantity";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Shop floor" };

export default function ShopFloorPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ShopFloorContent />
    </Suspense>
  );
}

const TILE_ACCENT: Record<WorkstationStatus, string> = {
  RUNNING: "border-success/60 bg-success/[0.06]",
  IDLE: "",
  MAINTENANCE: "border-warning/60 bg-warning/[0.06]",
  DOWN: "border-destructive/60 bg-destructive/[0.06]",
};

async function ShopFloorContent() {
  await requirePermission("shopfloor.operate");
  const stations = await db.all<{
    id: number;
    code: string;
    name: string;
    status: WorkstationStatus;
    queued: number;
    run_type: RunType | null;
    start_time: string | null;
    operator: string | null;
    wo_number: string | null;
    sku: string | null;
    uom: string | null;
    qty_target_milli: number | null;
    qty_completed_milli: number | null;
  }>(
    `SELECT w.id, w.code, w.name, w.status,
            (SELECT COUNT(*) FROM work_orders q WHERE q.workstation_id = w.id AND q.status IN ('RELEASED', 'IN_PROGRESS')) AS queued,
            p.run_type, p.start_time, u.full_name AS operator, o.wo_number, i.sku, i.uom, o.qty_target_milli, o.qty_completed_milli
       FROM workstations w
       LEFT JOIN production_logs p ON p.workstation_id = w.id AND p.end_time IS NULL
       LEFT JOIN users u ON u.id = p.operator_id
       LEFT JOIN work_orders o ON o.id = p.work_order_id
       LEFT JOIN items i ON i.id = o.item_id
      WHERE w.is_active = 1
      ORDER BY w.code COLLATE NOCASE`,
  );

  return (
    <>
      <AutoRefresh />
      <PageHeader title="Shop floor" description="Choose your workstation to start, report and finish work." />
      {stations.length === 0 ? (
        <EmptyState icon={FactoryIcon} title="No workstations" description="A production manager needs to set up workstations first." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {stations.map((s) => {
            const pct = s.qty_target_milli ? Math.min(100, Math.round(((s.qty_completed_milli ?? 0) / s.qty_target_milli) * 100)) : 0;
            return (
              <Link
                key={s.id}
                href={`/shop-floor/${s.id}`}
                className={cn(
                  "bg-card hover:border-primary/60 hover:shadow-primary/15 group flex min-h-44 flex-col justify-between rounded-2xl border-2 p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl active:scale-[0.99]",
                  TILE_ACCENT[s.status],
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="group-hover:text-primary font-mono text-2xl font-bold tracking-tight transition-colors">{s.code}</p>
                    <p className="text-muted-foreground">{s.name}</p>
                  </div>
                  <WorkstationStatusBadge status={s.status} />
                </div>
                {s.wo_number ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-mono font-semibold">{s.wo_number}</span>
                      <span className="text-muted-foreground">
                        {RUN_TYPE_LABELS[s.run_type!]} · <Elapsed since={s.start_time!} className="tabular-nums" />
                      </span>
                    </div>
                    <Progress value={pct} className="h-2" />
                    <div className="text-muted-foreground flex items-center justify-between text-xs">
                      <span>
                        {s.sku} · {formatQty(s.qty_completed_milli ?? 0)} / {formatQty(s.qty_target_milli ?? 0, s.uom ?? undefined)}
                      </span>
                      <span className="flex items-center gap-1">
                        <UserIcon className="size-3" /> {s.operator}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    {s.queued > 0 ? (
                      <span className="text-primary font-medium">
                        {s.queued} work order{s.queued === 1 ? "" : "s"} ready
                      </span>
                    ) : (
                      "Nothing scheduled"
                    )}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
