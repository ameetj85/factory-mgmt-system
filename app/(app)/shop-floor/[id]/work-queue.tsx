"use client";

import { useTransition } from "react";
import { InboxIcon, Loader2Icon, PlayIcon, WrenchIcon } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { PriorityBadge, WoStatusBadge } from "@/components/production/badges";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useIdempotencyKey } from "@/hooks/use-idempotency-key";
import type { Priority, RunType, WoStatus } from "@/lib/production/constants";
import { formatQty } from "@/lib/quantity";
import { cn } from "@/lib/utils";
import { startRun } from "../actions";

export interface QueuedOrder {
  id: number;
  woNumber: string;
  sku: string;
  itemName: string;
  uom: string;
  qtyTargetMilli: number;
  qtyCompletedMilli: number;
  status: WoStatus;
  priority: Priority;
  dueDate: string | null;
  notes: string | null;
  overdue: boolean;
}

export function WorkQueue({
  workstationId,
  orders,
  blocked,
  downtimeButton,
}: {
  workstationId: number;
  orders: QueuedOrder[];
  blocked: "DOWN" | "MAINTENANCE" | null;
  downtimeButton?: React.ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const idempotency = useIdempotencyKey();

  const start = (order: QueuedOrder, runType: RunType) =>
    startTransition(async () => {
      const result = await startRun({ workOrderId: order.id, workstationId, runType, key: idempotency.current() });
      if (result.status === "success") {
        idempotency.reset();
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    });

  return (
    <div className="space-y-4">
      {blocked && (
        <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-2xl border-2 p-5 text-lg font-medium">
          This workstation is {blocked === "DOWN" ? "down" : "in maintenance"}. Production can&apos;t start until it&apos;s back up.
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Ready to run</h2>
        {!blocked && <div className="w-full sm:w-72">{downtimeButton}</div>}
      </div>
      {orders.length === 0 ? (
        <EmptyState icon={InboxIcon} title="No work scheduled here" description="Released work orders for this workstation will appear here." />
      ) : (
        <ul className="space-y-3">
          {orders.map((o, index) => {
            const pct = Math.min(100, Math.round((o.qtyCompletedMilli / o.qtyTargetMilli) * 100));
            const runnable = o.status !== "ON_HOLD" && !blocked;
            return (
              <li
                key={o.id}
                className={cn(
                  "bg-card rounded-2xl border-2 p-5 transition-all",
                  index === 0 && runnable ? "border-primary/50 shadow-primary/10 shadow-lg" : "hover:border-primary/30",
                  !runnable && "opacity-60",
                )}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xl font-bold">{o.woNumber}</span>
                      <WoStatusBadge status={o.status} />
                      <PriorityBadge priority={o.priority} />
                      {o.dueDate && (
                        <span className={cn("text-sm", o.overdue ? "text-destructive font-semibold" : "text-muted-foreground")}>
                          {o.overdue ? "Overdue · " : "Due "}
                          {o.dueDate}
                        </span>
                      )}
                    </div>
                    <p className="text-lg">
                      <span className="font-mono font-medium">{o.sku}</span> · {o.itemName}
                    </p>
                    <div className="flex items-center gap-3">
                      <Progress value={pct} className="h-2 max-w-sm" />
                      <span className="text-muted-foreground text-sm tabular-nums">
                        {formatQty(o.qtyCompletedMilli)} / {formatQty(o.qtyTargetMilli, o.uom)}
                      </span>
                    </div>
                    {o.notes && <p className="text-muted-foreground text-sm italic">{o.notes}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-3 lg:w-96">
                    <Button
                      variant="outline"
                      disabled={!runnable || pending}
                      onClick={() => start(o, "SETUP")}
                      className="hover:border-primary/60 hover:text-primary h-16 text-base"
                    >
                      <WrenchIcon className="size-5" /> Start setup
                    </Button>
                    <Button disabled={!runnable || pending} onClick={() => start(o, "RUN")} className="h-16 text-base shadow-md shadow-primary/25">
                      {pending ? <Loader2Icon className="size-5 animate-spin" /> : <PlayIcon className="size-5" />} Start production
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
