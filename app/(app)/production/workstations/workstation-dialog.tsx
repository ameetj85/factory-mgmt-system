"use client";

import { useActionState, useState } from "react";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Field, FormAlert, SubmitButton } from "@/components/forms";
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
import { initialFormState, type FormState } from "@/lib/forms";
import { createWorkstation, updateWorkstation } from "./actions";
import type { WorkstationRow } from "./workstations-table";

export function WorkstationDialog({ workstation, onClose }: { workstation?: WorkstationRow; onClose?: () => void }) {
  const editing = Boolean(workstation);
  const [open, setOpen] = useState(editing);
  const close = () => {
    setOpen(false);
    onClose?.();
  };

  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await (editing ? updateWorkstation : createWorkstation)(prev, formData);
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
            <PlusIcon /> New workstation
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${workstation!.code}` : "New workstation"}</DialogTitle>
          <DialogDescription>For example CNC-01, ASSY-LINE-2 or PACK-1.</DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          {editing && <input type="hidden" name="id" value={workstation!.id} />}
          <FormAlert state={state} />
          <div className="grid gap-4 sm:grid-cols-[1fr_1.6fr]">
            <Field name="code" label="Code" defaultValue={workstation?.code} required className="font-mono uppercase" errors={errors.code} />
            <Field name="name" label="Name" defaultValue={workstation?.name} required errors={errors.name} />
          </div>
          <Field name="description" label="Description" defaultValue={workstation?.description ?? ""} placeholder="Optional" errors={errors.description} />
          <Field
            name="hourlyCapacity"
            label="Standard capacity (units per hour)"
            inputMode="numeric"
            defaultValue={workstation?.hourlyCapacity ?? ""}
            placeholder="Optional"
            errors={errors.hourlyCapacity}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <SubmitButton pending={pending} pendingText="Saving…">
              {editing ? "Save changes" : "Create workstation"}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
