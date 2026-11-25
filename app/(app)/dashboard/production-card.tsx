import Link from "next/link";
import { ArrowRightIcon, FactoryIcon } from "lucide-react";
import { WORKSTATION_STATUS_DOT } from "@/components/production/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db, SQL_NOW } from "@/lib/db/client";
import { WORKSTATION_STATUS_LABELS, type WorkstationStatus } from "@/lib/production/constants";
import { cn } from "@/lib/utils";

export async function ProductionCard({ shopFloorLink }: { shopFloorLink: boolean }) {
  const [counts, stations] = await Promise.all([
    db.get<{ released: number; in_progress: number; on_hold: number; overdue: number; completed_7d: number }>(
      `SELECT
         SUM(status = 'RELEASED') AS released,
         SUM(status = 'IN_PROGRESS') AS in_progress,
         SUM(status = 'ON_HOLD') AS on_hold,
         SUM(status IN ('RELEASED', 'IN_PROGRESS', 'ON_HOLD') AND due_date IS NOT NULL AND due_date < substr(${SQL_NOW}, 1, 10)) AS overdue,
         SUM(status = 'COMPLETED' AND completed_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')) AS completed_7d
       FROM work_orders`,
    ),
    db.all<{ status: WorkstationStatus; n: number }>("SELECT status, COUNT(*) AS n FROM workstations WHERE is_active = 1 GROUP BY status"),
  ]);

  const tiles = [
    { label: "Released", value: counts?.released ?? 0 },
    { label: "In progress", value: counts?.in_progress ?? 0 },
    { label: "On hold", value: counts?.on_hold ?? 0, warn: (counts?.on_hold ?? 0) > 0 },
    { label: "Overdue", value: counts?.overdue ?? 0, danger: (counts?.overdue ?? 0) > 0 },
    { label: "Done (7 days)", value: counts?.completed_7d ?? 0 },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <FactoryIcon className="text-primary size-4" /> Production
          </CardTitle>
          <CardDescription>Work orders and workstation status right now.</CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary">
          <Link href={shopFloorLink ? "/shop-floor" : "/production/work-orders"}>
            {shopFloorLink ? "Shop floor" : "Work orders"} <ArrowRightIcon />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {tiles.map((t) => (
            <Link
              key={t.label}
              href="/production/work-orders"
              className={cn(
                "hover:border-primary/40 hover:bg-accent/40 rounded-xl border p-3 transition-colors",
                t.warn && "border-warning/40",
                t.danger && "border-destructive/40",
              )}
            >
              <p className="text-muted-foreground text-xs">{t.label}</p>
              <p className={cn("text-2xl font-semibold tabular-nums", t.warn && "text-warning", t.danger && "text-destructive")}>{t.value}</p>
            </Link>
          ))}
        </div>
        {stations.length > 0 && (
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {(["RUNNING", "IDLE", "MAINTENANCE", "DOWN"] as const).map((status) => {
              const n = stations.find((s) => s.status === status)?.n ?? 0;
              return (
                <span key={status} className="text-muted-foreground flex items-center gap-2">
                  <span className={cn("size-2 rounded-full", WORKSTATION_STATUS_DOT[status], status === "RUNNING" && n > 0 && "animate-pulse")} />
                  <span className="text-foreground font-medium tabular-nums">{n}</span> {WORKSTATION_STATUS_LABELS[status].toLowerCase()}
                </span>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
