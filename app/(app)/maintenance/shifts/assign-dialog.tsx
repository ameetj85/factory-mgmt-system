"use client";

import { useState, useTransition } from "react";
import { CalendarPlusIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DAY_SHORT } from "@/lib/maintenance/constants";
import type { WorkstationOption } from "@/lib/production/queries";
import { cn } from "@/lib/utils";
import { assignShift } from "./actions";

const WEEKDAYS = [1, 2, 3, 4, 5];

export function AssignDialog({
  workstations,
  templates,
}: {
  workstations: WorkstationOption[];
  templates: { id: number; name: string; startTime: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [machines, setMachines] = useState<number[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [days, setDays] = useState<number[]>(WEEKDAYS);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pending, startTransition] = useTransition();

  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const submit = () =>
    startTransition(async () => {
      const result = await assignShift({
        workstationIds: machines,
        templateId: Number(templateId),
        days,
        effectiveFrom: from,
        effectiveTo: to || null,
      });
      if (result.status === "success") {
        toast.success(result.message);
        setOpen(false);
        setMachines([]);
      } else {
        toast.error(result.message);
      }
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={templates.length === 0 || workstations.length === 0}>
          <CalendarPlusIcon /> Assign shift
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign a shift</DialogTitle>
          <DialogDescription>Schedule a shift on chosen machines and weekdays from a start date.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-1.5">
            <Label>Shift</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger className="h-10 w-full">
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
          </div>
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Machines</Label>
              <button
                type="button"
                className="text-primary text-xs hover:underline"
                onClick={() => setMachines(machines.length === workstations.length ? [] : workstations.map((w) => w.id))}
              >
                {machines.length === workstations.length ? "Clear" : "Select all"}
              </button>
            </div>
            <div className="grid max-h-40 grid-cols-2 gap-2 overflow-y-auto rounded-lg border p-2">
              {workstations.map((w) => (
                <label key={w.id} className="hover:bg-accent/50 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm">
                  <Checkbox checked={machines.includes(w.id)} onCheckedChange={() => setMachines((m) => toggle(m, w.id))} />
                  <span className="font-mono">{w.code}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Days</Label>
            <div className="grid grid-cols-7 gap-1.5">
              {DAY_SHORT.map((label, day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => setDays((d) => toggle(d, day))}
                  className={cn(
                    "h-10 rounded-lg border text-sm font-medium transition-all",
                    days.includes(day) ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/40 text-muted-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="assign-from">From</Label>
              <Input id="assign-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="assign-to">Until (optional)</Label>
              <Input id="assign-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !templateId || !machines.length || !days.length || !from}>
            {pending && <Loader2Icon className="animate-spin" />} Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
