"use client";

import { useState, useTransition } from "react";
import { CheckCheckIcon, Loader2Icon, MoreHorizontalIcon, PauseIcon, PencilIcon, PlayIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useIdempotencyKey } from "@/hooks/use-idempotency-key";
import type { WorkstationOption } from "@/lib/production/queries";
import { completePm, setPmPlanActive } from "./actions";
import { PlanDialog, type EditablePlan } from "./plan-dialog";

export function PlanActions({ plan, workstations }: { plan: EditablePlan; workstations: WorkstationOption[] }) {
  const [editing, setEditing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [notes, setNotes] = useState("");
  const [minutes, setMinutes] = useState(plan.estimatedMinutes ? String(plan.estimatedMinutes) : "0");
  const [pending, startTransition] = useTransition();
  const idempotency = useIdempotencyKey();

  const toggle = () =>
    startTransition(async () => {
      const result = await setPmPlanActive(plan.id, !plan.isActive);
      if (result.status === "success") toast.success(result.message);
      else toast.error(result.message);
    });

  const complete = () =>
    startTransition(async () => {
      const downtimeMinutes = /^\d+$/.test(minutes.trim()) ? Number(minutes.trim()) : -1;
      const result = await completePm({ planId: plan.id, notes, downtimeMinutes, key: idempotency.current() });
      if (result.status === "success") {
        idempotency.reset();
        toast.success(result.message);
        setCompleting(false);
        setNotes("");
      } else {
        toast.error(result.message);
      }
    });

  return (
    <div className="flex shrink-0 items-center gap-2">
      {plan.isActive && (
        <Button size="sm" onClick={() => setCompleting(true)} disabled={pending}>
          <CheckCheckIcon /> Record done
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" disabled={pending} aria-label={`Actions for ${plan.title}`} className="hover:bg-primary/10 hover:text-primary">
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <PencilIcon /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={toggle}>
            {plan.isActive ? <PauseIcon /> : <PlayIcon />} {plan.isActive ? "Pause plan" : "Resume plan"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {editing && <PlanDialog workstations={workstations} plan={plan} onClose={() => setEditing(false)} />}

      <Dialog open={completing} onOpenChange={setCompleting}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record &ldquo;{plan.title}&rdquo; as done</DialogTitle>
            <DialogDescription>
              On <span className="font-mono">{plan.workstationCode}</span>. The next interval starts now.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="pm-minutes">Machine out of service (minutes)</Label>
              <Input id="pm-minutes" value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" className="h-10" />
              <p className="text-muted-foreground text-xs">Logged as planned maintenance downtime ending now. Enter 0 if the machine kept running.</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pm-notes">Notes</Label>
              <Textarea id="pm-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Findings, parts replaced (optional)" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleting(false)}>
              Cancel
            </Button>
            <Button onClick={complete} disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />} Record service
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
