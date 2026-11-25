"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, OctagonAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useIdempotencyKey } from "@/hooks/use-idempotency-key";
import { DOWNTIME_REASONS, type DowntimeReason } from "@/lib/maintenance/constants";
import type { WorkstationOption } from "@/lib/production/queries";
import { startDowntime } from "./actions";

/** Desk version of the shop-floor "Report downtime" button: pick the machine and a reason. */
export function ReportStopDialog({ workstations }: { workstations: WorkstationOption[] }) {
  const [open, setOpen] = useState(false);
  const [workstationId, setWorkstationId] = useState("");
  const [reason, setReason] = useState<DowntimeReason | "">("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const idempotency = useIdempotencyKey();

  const submit = () =>
    startTransition(async () => {
      if (!workstationId || !reason) return;
      const result = await startDowntime({ workstationId: Number(workstationId), reasonCode: reason, notes, key: idempotency.current() });
      if (result.status === "success") {
        idempotency.reset();
        toast.success(result.message);
        setOpen(false);
        setWorkstationId("");
        setReason("");
        setNotes("");
      } else {
        toast.error(result.message);
      }
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-destructive hover:bg-destructive/90 text-white shadow-md">
          <OctagonAlertIcon /> Report a stop
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report a stopped machine</DialogTitle>
          <DialogDescription>Starts a downtime event now and pauses any active run on that machine.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Machine</Label>
            <Select value={workstationId} onValueChange={setWorkstationId}>
              <SelectTrigger className="h-10 w-full">
                <SelectValue placeholder="Choose a machine" />
              </SelectTrigger>
              <SelectContent>
                {workstations.map((w) => (
                  <SelectItem key={w.id} value={String(w.id)}>
                    <span className="font-mono">{w.code}</span>
                    <span className="text-muted-foreground">{w.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as DowntimeReason)}>
              <SelectTrigger className="h-10 w-full">
                <SelectValue placeholder="Choose a reason" />
              </SelectTrigger>
              <SelectContent>
                {DOWNTIME_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes (optional)" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!workstationId || !reason || pending} onClick={submit} className="bg-destructive hover:bg-destructive/90 text-white">
            {pending && <Loader2Icon className="animate-spin" />} Stop machine
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
