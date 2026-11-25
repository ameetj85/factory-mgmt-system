"use client";

import { useActionState, useState } from "react";
import { MapPinPlusIcon } from "lucide-react";
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
import { createLocation, updateLocation } from "./actions";
import type { LocationRow } from "./locations-table";

export function LocationDialog({ location, onClose }: { location?: LocationRow; onClose?: () => void }) {
  const editing = Boolean(location);
  const [open, setOpen] = useState(editing);
  const close = () => {
    setOpen(false);
    onClose?.();
  };

  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await (editing ? updateLocation : createLocation)(prev, formData);
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
            <MapPinPlusIcon /> New location
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${location!.code}` : "New location"}</DialogTitle>
          <DialogDescription>Use short codes such as WH1, RACK-A3 or QUARANTINE.</DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          {editing && <input type="hidden" name="id" value={location!.id} />}
          <FormAlert state={state} />
          <div className="grid gap-4 sm:grid-cols-[1fr_1.6fr]">
            <Field name="code" label="Code" defaultValue={location?.code} required className="font-mono uppercase" errors={errors.code} />
            <Field name="name" label="Name" defaultValue={location?.name} required errors={errors.name} />
          </div>
          <Field name="description" label="Description" defaultValue={location?.description ?? ""} placeholder="Optional" errors={errors.description} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <SubmitButton pending={pending} pendingText="Saving…">
              {editing ? "Save changes" : "Create location"}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
