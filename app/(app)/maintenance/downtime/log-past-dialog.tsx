"use client";

import { useActionState, useState } from "react";
import { HistoryIcon } from "lucide-react";
import { toast } from "sonner";
import { Field, FieldMessage, FormAlert, SubmitButton } from "@/components/forms";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { initialFormState, type FormState } from "@/lib/forms";
import { DOWNTIME_REASONS, isPlannedReason } from "@/lib/maintenance/constants";
import type { WorkstationOption } from "@/lib/production/queries";
import { logPastDowntime } from "./actions";

/** datetime-local values are in the browser's zone; convert to UTC ISO before sending. */
function toIso(local: FormDataEntryValue | null): string {
  const value = String(local ?? "");
  const d = new Date(value);
  return value && !Number.isNaN(d.getTime()) ? d.toISOString() : "";
}

export function LogPastDowntimeDialog({ workstations }: { workstations: WorkstationOption[] }) {
  const [open, setOpen] = useState(false);
  const [workstationId, setWorkstationId] = useState("");
  const [reason, setReason] = useState("");
  const [planned, setPlanned] = useState(false);

  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    formData.set("workstationId", workstationId);
    formData.set("reasonCode", reason);
    formData.set("isPlanned", String(planned));
    formData.set("startedAt", toIso(formData.get("startedLocal")));
    formData.set("endedAt", toIso(formData.get("endedLocal")));
    const result = await logPastDowntime(prev, formData);
    if (result.status === "success") {
      toast.success(result.message);
      setOpen(false);
      setWorkstationId("");
      setReason("");
      return initialFormState;
    }
    return result;
  }, initialFormState);
  const errors = state.fieldErrors ?? {};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <HistoryIcon /> Log past downtime
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Log a stop after the fact</DialogTitle>
          <DialogDescription>For stoppages that weren&apos;t reported live. It can&apos;t overlap an existing event on the same machine.</DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <FormAlert state={state} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Machine</Label>
              <Select value={workstationId} onValueChange={setWorkstationId}>
                <SelectTrigger className="h-10 w-full" aria-invalid={errors.workstationId ? true : undefined}>
                  <SelectValue placeholder="Choose a machine" />
                </SelectTrigger>
                <SelectContent>
                  {workstations.map((w) => (
                    <SelectItem key={w.id} value={String(w.id)}>
                      {w.code} · {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldMessage id="workstationId" errors={errors.workstationId && ["Choose a machine."]} />
            </div>
            <div className="grid gap-1.5">
              <Label>Reason</Label>
              <Select
                value={reason}
                onValueChange={(v) => {
                  setReason(v);
                  setPlanned(isPlannedReason(v));
                }}
              >
                <SelectTrigger className="h-10 w-full" aria-invalid={errors.reasonCode ? true : undefined}>
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
              <FieldMessage id="reasonCode" errors={errors.reasonCode} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="startedLocal" type="datetime-local" label="Started" required errors={errors.startedAt} />
            <Field name="endedLocal" type="datetime-local" label="Ended" required errors={errors.endedAt} />
          </div>
          <label className="flex cursor-pointer items-center gap-3 text-sm">
            <Switch checked={planned} onCheckedChange={setPlanned} />
            <span>
              Planned stop
              <span className="text-muted-foreground block text-xs">Planned stops reduce planned time instead of availability.</span>
            </span>
          </label>
          <div className="grid gap-1.5">
            <Label htmlFor="past-notes">Notes</Label>
            <Textarea id="past-notes" name="notes" rows={2} placeholder="Optional" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pending={pending} pendingText="Saving…">
              Record downtime
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
