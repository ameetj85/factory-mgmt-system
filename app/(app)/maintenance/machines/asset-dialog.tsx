"use client";

import { useActionState, useState } from "react";
import { PencilIcon } from "lucide-react";
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
import { updateMachineAsset } from "./actions";

export interface MachineAsset {
  id: number;
  code: string;
  assetTag: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  installDate: string | null;
  hourlyRateCents: number | null;
  runtimeOffsetSeconds: number;
}

export function AssetDialog({ machine }: { machine: MachineAsset }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await updateMachineAsset(prev, formData);
    if (result.status === "success") {
      toast.success(result.message);
      setOpen(false);
      return initialFormState;
    }
    return result;
  }, initialFormState);
  const errors = state.fieldErrors ?? {};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <PencilIcon /> Edit asset details
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{machine.code} asset details</DialogTitle>
          <DialogDescription>Identification, standard run rate and the runtime hours the machine had before tracking started.</DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={machine.id} />
          <FormAlert state={state} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="assetTag" label="Asset tag" defaultValue={machine.assetTag ?? ""} errors={errors.assetTag} />
            <Field name="serialNumber" label="Serial number" defaultValue={machine.serialNumber ?? ""} errors={errors.serialNumber} />
            <Field name="manufacturer" label="Manufacturer" defaultValue={machine.manufacturer ?? ""} errors={errors.manufacturer} />
            <Field name="model" label="Model" defaultValue={machine.model ?? ""} errors={errors.model} />
            <Field name="installDate" type="date" label="Installed" defaultValue={machine.installDate ?? ""} errors={errors.installDate} />
            <Field
              name="hourlyRate"
              label="Hourly run rate (USD)"
              inputMode="decimal"
              defaultValue={machine.hourlyRateCents != null ? (machine.hourlyRateCents / 100).toFixed(2) : ""}
              placeholder="0.00"
              errors={errors.hourlyRate}
            />
          </div>
          <Field
            name="runtimeOffsetHours"
            label="Runtime hours before tracking"
            inputMode="decimal"
            defaultValue={String(Math.round(machine.runtimeOffsetSeconds / 360) / 10)}
            hint="Added to hours logged here, so runtime-based maintenance uses the machine's real hour meter."
            errors={errors.runtimeOffsetHours}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pending={pending} pendingText="Saving…">
              Save
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
