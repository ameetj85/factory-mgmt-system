import Link from "next/link";
import { AlertTriangleIcon, ArrowRightIcon, CheckCircle2Icon, SlidersHorizontalIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { db } from "@/lib/db/client";
import { lowStockItems } from "@/lib/inventory/queries";
import { formatQty } from "@/lib/quantity";

/** Low-stock alerts, plus a pending-approval nudge for users who can approve adjustments. */
export async function LowStockCard({ showApprovals }: { showApprovals: boolean }) {
  const [low, pending] = await Promise.all([
    lowStockItems(8),
    showApprovals ? db.get<{ n: number }>("SELECT COUNT(*) AS n FROM adjustment_requests WHERE status = 'pending'") : undefined,
  ]);
  const pendingCount = pending?.n ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangleIcon className="text-warning size-4" /> Low-stock alerts
          </CardTitle>
          <CardDescription>Items below their reorder point.</CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary">
          <Link href="/inventory?low=1">
            View all <ArrowRightIcon />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {showApprovals && pendingCount > 0 && (
          <Link
            href="/inventory/adjustments"
            className="border-primary/30 bg-primary/5 hover:bg-primary/10 flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-colors"
          >
            <span className="flex items-center gap-2">
              <SlidersHorizontalIcon className="text-primary size-4" />
              {pendingCount} stock adjustment{pendingCount === 1 ? "" : "s"} awaiting your approval
            </span>
            <ArrowRightIcon className="text-primary size-4" />
          </Link>
        )}
        {low.length === 0 ? (
          <p className="text-success flex items-center gap-2 text-sm">
            <CheckCircle2Icon className="size-4" /> Every item is at or above its reorder point.
          </p>
        ) : (
          <ul className="space-y-3">
            {low.map((item) => {
              const pct = Math.min(100, Math.round((item.on_hand_milli / item.reorder_point_milli) * 100));
              return (
                <li key={item.id}>
                  <Link href={`/inventory/items/${item.id}`} className="hover:bg-accent/50 -mx-2 block rounded-md px-2 py-1.5 transition-colors">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">
                        <span className="font-mono font-medium">{item.sku}</span>
                        <span className="text-muted-foreground"> · {item.name}</span>
                      </span>
                      {item.on_hand_milli <= 0 ? (
                        <Badge variant="outline" className="border-destructive/40 text-destructive shrink-0">
                          Out
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                          {formatQty(item.on_hand_milli)} / {formatQty(item.reorder_point_milli, item.uom)}
                        </span>
                      )}
                    </div>
                    <Progress value={pct} className="mt-1.5 h-1.5" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
