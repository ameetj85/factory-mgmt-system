"use client";

import { useActionState, useState } from "react";
import { CalendarDaysIcon, GaugeIcon, PlusIcon } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { initialFormState, type FormState } from "@/lib/forms";
import type { PmTrigger } from "@/lib/maintenance/constants";
import type { WorkstationOption } from "@/lib/production/queries";
import { cn } from "@/lib/utils";
import { savePmPlan } from "./actions";

export interface EditablePlan {
  id: number;
  title: string;
  workstationId: number;
  workstationCode: string;
  instructions: string | null;
  triggerType: PmTrigger;
  intervalDays: number | null;
  intervalHours: number | null;
  estimatedMinutes: number | null;
  isActive: boolean;
}

export function PlanDialog({
  workstations,
  plan,
  defaultWorkstationId,
  onClose,
}: {
  workstations: WorkstationOption[];
  plan?: EditablePlan;
  defaultWorkstationId?: number;
  onClose?: () => void;
}) {
  const editing = Boolean(plan);
  const [open, setOpen] = useState(editing);
  const [workstationId, setWorkstationId] = useState(plan ? String(plan.workstationId) : defaultWorkstationId ? String(defaultWorkstationId) : "");
  const [trigger, setTrigger] = useState<PmTrigger>(plan?.triggerType ?? "CALENDAR");
  const close = () => {
    setOpen(false);
    onClose?.();
  };

  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    formData.set("workstationId", workstationId);
    formData.set("triggerType", trigger);
    if (plan) formData.set("id", String(plan.id));
    const result = await savePmPlan(prev, formData);
    if (result.status === "success") {
      toast.success(result.message);
      close();
      return initialFormState;
    }
    return result;
  }, initialFormState);
  const errors = state.fieldErrors ?? {};

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      {!editing && (
        <DialogTrigger asChild>
          <Button className="shadow-md shadow-primary/25">
            <PlusIcon /> New plan
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit maintenance plan" : "New maintenance plan"}</DialogTitle>
          <DialogDescription>The interval starts counting from now and restarts each time the service is recorded.</DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <FormAlert state={state} />
          <div className="grid gap-1.5">
            <Label>Machine</Label>
            {editing ? (
              <div className="bg-muted/50 flex h-10 items-center rounded-lg border px-3 font-mono text-sm">{plan!.workstationCode}</div>
            ) : (
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
            )}
            <FieldMessage id="workstationId" errors={errors.workstationId && ["Choose a machine."]} />
          </div>
          <Field name="title" label="Task" defaultValue={plan?.title} placeholder="e.g. Lubricate spindle bearings" required errors={errors.title} />

          <div className="grid gap-1.5">
            <Label>Schedule by</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: "CALENDAR", label: "Calendar days", icon: CalendarDaysIcon },
                  { value: "RUNTIME", label: "Runtime hours", icon: GaugeIcon },
                ] as const
              ).map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  disabled={editing}
                  onClick={() => setTrigger(value)}
                  className={cn(
                    "flex h-11 items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-all disabled:cursor-not-allowed",
                    trigger === value ? "border-primary bg-primary/10 text-primary ring-primary/30 ring-2" : "text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" /> {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {trigger === "CALENDAR" ? (
              <Field name="intervalDays" label="Every (days)" inputMode="numeric" defaultValue={plan?.intervalDays ?? ""} required errors={errors.intervalDays} />
            ) : (
              <Field name="intervalHours" label="Every (runtime hours)" inputMode="numeric" defaultValue={plan?.intervalHours ?? ""} required errors={errors.intervalHours} />
            )}
            <Field name="estimatedMinutes" label="Takes about (minutes)" inputMode="numeric" defaultValue={plan?.estimatedMinutes ?? ""} placeholder="Optional" errors={errors.estimatedMinutes} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pm-instructions">Instructions</Label>
            <Textarea id="pm-instructions" name="instructions" rows={4} defaultValue={plan?.instructions ?? ""} placeholder="Steps, parts and safety notes (optional)" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <SubmitButton pending={pending} pendingText="Saving…">
              {editing ? "Save changes" : "Create plan"}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
