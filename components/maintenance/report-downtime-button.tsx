"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, OctagonAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useIdempotencyKey } from "@/hooks/use-idempotency-key";
import { DOWNTIME_REASONS, type DowntimeReason } from "@/lib/maintenance/constants";
import { cn } from "@/lib/utils";
import { startDowntime } from "@/app/(app)/maintenance/downtime/actions";

/** Large shop-floor button that stops the machine with a reason, pausing any active run. */
export function ReportDowntimeButton({
  workstationId,
  workstationCode,
  hasActiveRun,
  className,
}: {
  workstationId: number;
  workstationCode: string;
  hasActiveRun: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<DowntimeReason | null>(null);
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const idempotency = useIdempotencyKey();

  const submit = () => {
    if (!reason) return;
    startTransition(async () => {
      const result = await startDowntime({ workstationId, reasonCode: reason, notes, key: idempotency.current() });
      if (result.status === "success") {
        idempotency.reset();
        toast.success(result.message);
        setOpen(false);
        setReason(null);
        setNotes("");
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className={cn("border-destructive/50 text-destructive hover:bg-destructive hover:text-white h-20 w-full text-lg", className)}
      >
        <OctagonAlertIcon className="size-6" /> Report downtime
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl">Why has {workstationCode} stopped?</DialogTitle>
            <DialogDescription>
              {hasActiveRun ? "The active run will be paused until the machine is back up." : "The machine will be marked as stopped."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {DOWNTIME_REASONS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setReason(r.value)}
                className={cn(
                  "min-h-14 rounded-xl border-2 px-3 py-2 text-left font-medium transition-all",
                  reason === r.value
                    ? "border-destructive bg-destructive/10 text-destructive"
                    : "hover:border-destructive/40 hover:bg-destructive/5",
                )}
              >
                {r.label}
                {r.planned && <span className="text-muted-foreground block text-xs font-normal">planned</span>}
              </button>
            ))}
          </div>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="What happened? (optional)" />
          <Button disabled={!reason || pending} onClick={submit} className="bg-destructive hover:bg-destructive/90 h-16 text-xl text-white">
            {pending && <Loader2Icon className="size-6 animate-spin" />}
            {reason ? "Stop the machine" : "Choose a reason"}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
