"use client";

import { useActionState, useState } from "react";
import { CalendarOffIcon } from "lucide-react";
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
import { initialFormState, type FormState } from "@/lib/forms";
import type { WorkstationOption } from "@/lib/production/queries";
import { cn } from "@/lib/utils";
import { addException } from "./actions";

export function ExceptionDialog({
  workstations,
  templates,
}: {
  workstations: WorkstationOption[];
  templates: { id: number; name: string; startTime: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"HOLIDAY" | "OVERTIME">("HOLIDAY");
  const [workstationId, setWorkstationId] = useState("all");
  const [templateId, setTemplateId] = useState("");

  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    formData.set("type", type);
    formData.set("workstationId", workstationId);
    formData.set("templateId", type === "OVERTIME" ? templateId : "");
    const result = await addException(prev, formData);
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
          <CalendarOffIcon /> Add holiday or overtime
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change a single day</DialogTitle>
          <DialogDescription>A holiday cancels that day&apos;s shifts. Overtime adds an extra shift.</DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <FormAlert state={state} />
          <div className="grid grid-cols-2 gap-2">
            {(["HOLIDAY", "OVERTIME"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  "h-11 rounded-lg border text-sm font-medium transition-all",
                  type === t ? "border-primary bg-primary/10 text-primary ring-primary/30 ring-2" : "text-muted-foreground hover:border-primary/40",
                )}
              >
                {t === "HOLIDAY" ? "Holiday / shutdown" : "Overtime"}
              </button>
            ))}
          </div>
          <Field name="date" type="date" label="Date" required errors={errors.date} />
          <div className="grid gap-1.5">
            <Label>Applies to</Label>
            <Select value={workstationId} onValueChange={setWorkstationId}>
              <SelectTrigger className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Whole factory</SelectItem>
                {workstations.map((w) => (
                  <SelectItem key={w.id} value={String(w.id)}>
                    {w.code} · {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {type === "OVERTIME" && (
            <div className="grid gap-1.5">
              <Label>Extra shift</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger className="h-10 w-full" aria-invalid={errors.templateId ? true : undefined}>
                  <SelectValue placeholder="Choose a shift" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name} <span className="text-muted-foreground">{t.startTime}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldMessage id="templateId" errors={errors.templateId} />
            </div>
          )}
          <Field name="notes" label="Notes" placeholder="e.g. Thanksgiving" errors={errors.notes} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pending={pending} pendingText="Saving…">
              Add
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
