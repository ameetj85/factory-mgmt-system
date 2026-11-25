"use client";

import { useActionState, useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialFormState, type FormState } from "@/lib/forms";
import { formatMinutes } from "@/lib/maintenance/constants";
import { saveShiftTemplate } from "./actions";
import type { TemplateRow } from "./templates-list";

interface BreakRow {
  key: number;
  name: string;
  offsetMinutes: string;
  durationMinutes: string;
}

/** "Lunch 10:00–10:30" style clock time for a break, or null while the inputs aren't valid numbers yet. */
function breakClock(startTime: string, b: { name: string; offsetMinutes: string; durationMinutes: string }): string | null {
  const offset = Number(b.offsetMinutes);
  const length = Number(b.durationMinutes);
  if (!/^\d{2}:\d{2}$/.test(startTime) || !Number.isInteger(offset) || !Number.isInteger(length) || length <= 0 || b.offsetMinutes === "") return null;
  const [h, m] = startTime.split(":").map(Number);
  const fmt = (minutes: number) => {
    const t = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
    return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  };
  return `${b.name || "Break"} ${fmt(offset)}–${fmt(offset + length)}`;
}

export function TemplateDialog({ template, onClose }: { template?: TemplateRow; onClose?: () => void }) {
  const editing = Boolean(template);
  const [open, setOpen] = useState(editing);
  const [hours, setHours] = useState(template ? String(template.durationMinutes / 60) : "8");
  const [startTime, setStartTime] = useState(template?.startTime ?? "06:00");
  const [breaks, setBreaks] = useState<BreakRow[]>(() =>
    (template?.breaks ?? [{ name: "Lunch", offsetMinutes: 240, durationMinutes: 30 }]).map((b, key) => ({
      key,
      name: b.name,
      offsetMinutes: String(b.offsetMinutes),
      durationMinutes: String(b.durationMinutes),
    })),
  );
  const close = () => {
    setOpen(false);
    onClose?.();
  };

  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    if (template) formData.set("id", String(template.id));
    formData.set("durationMinutes", String(Math.round(Number(hours) * 60)));
    formData.set("breaks", JSON.stringify(breaks.map(({ name, offsetMinutes, durationMinutes }) => ({ name, offsetMinutes, durationMinutes }))));
    const result = await saveShiftTemplate(prev, formData);
    if (result.status === "success") {
      toast.success(result.message);
      close();
      return initialFormState;
    }
    return result;
  }, initialFormState);
  const errors = state.fieldErrors ?? {};
  const breakMinutes = breaks.reduce((s, b) => s + (Number(b.durationMinutes) || 0), 0);
  const net = Math.max(0, Number(hours) * 60 - breakMinutes);
  const update = (key: number, patch: Partial<BreakRow>) => setBreaks((bs) => bs.map((b) => (b.key === key ? { ...b, ...patch } : b)));

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      {!editing && (
        <DialogTrigger asChild>
          <Button className="shadow-md shadow-primary/25">
            <PlusIcon /> New shift
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${template!.name}` : "New shift"}</DialogTitle>
          <DialogDescription>A start time and length. Night shifts can run past midnight.</DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <FormAlert state={state} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field name="name" label="Name" defaultValue={template?.name} placeholder="Day" required errors={errors.name} />
            <Field
              name="startTime"
              type="time"
              label="Starts"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
              errors={errors.startTime}
            />
            <div className="grid gap-1.5">
              <Label htmlFor="shift-hours">Length (hours)</Label>
              <Input id="shift-hours" value={hours} onChange={(e) => setHours(e.target.value)} inputMode="decimal" className="h-10" />
              <FieldMessage id="shift-hours" errors={errors.durationMinutes} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Breaks</Label>
            {breaks.length > 0 && (
              <div className="text-muted-foreground grid grid-cols-[1.3fr_1fr_1fr_auto] gap-2 text-xs font-medium">
                <span>Name</span>
                <span>Starts after (min)</span>
                <span>Length (min)</span>
                <span className="w-10" />
              </div>
            )}
            {breaks.map((b, i) => (
              <div key={b.key} className="grid grid-cols-[1.3fr_1fr_1fr_auto] items-start gap-x-2 gap-y-1">
                <Input value={b.name} onChange={(e) => update(b.key, { name: e.target.value })} placeholder="Name" aria-label="Break name" className="h-10" />
                <div>
                  <Input
                    value={b.offsetMinutes}
                    onChange={(e) => update(b.key, { offsetMinutes: e.target.value })}
                    inputMode="numeric"
                    aria-label="Starts after (minutes)"
                    placeholder="after min"
                    className="h-10"
                    aria-invalid={errors[`breaks.${i}.offsetMinutes`] ? true : undefined}
                  />
                  <FieldMessage id={`b-${b.key}`} errors={errors[`breaks.${i}.offsetMinutes`]} />
                </div>
                <Input
                  value={b.durationMinutes}
                  onChange={(e) => update(b.key, { durationMinutes: e.target.value })}
                  inputMode="numeric"
                  aria-label="Length (minutes)"
                  placeholder="length"
                  className="h-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="hover:bg-destructive/10 hover:text-destructive size-10"
                  onClick={() => setBreaks((bs) => bs.filter((x) => x.key !== b.key))}
                  aria-label="Remove break"
                >
                  <Trash2Icon />
                </Button>
                {breakClock(startTime, b) && <p className="text-primary col-span-4 -mt-0.5 text-xs">{breakClock(startTime, b)}</p>}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="hover:border-primary/50 hover:text-primary w-full border-dashed"
              onClick={() =>
                setBreaks((bs) => [...bs, { key: bs.length ? Math.max(...bs.map((x) => x.key)) + 1 : 0, name: "Break", offsetMinutes: "120", durationMinutes: "15" }])
              }
            >
              <PlusIcon /> Add break
            </Button>
          </div>

          <p className="bg-primary/5 text-primary rounded-lg px-3 py-2 text-sm">
            Planned production time per shift: <strong>{formatMinutes(net)}</strong>
          </p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <SubmitButton pending={pending} pendingText="Saving…">
              {editing ? "Save changes" : "Create shift"}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
