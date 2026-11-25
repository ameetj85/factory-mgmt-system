"use client";

import { useState, useTransition } from "react";
import { CheckCheckIcon, Loader2Icon, PauseIcon, PencilIcon, PlayIcon, SendIcon, XCircleIcon } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { WoStatus } from "@/lib/production/constants";
import { transitionWorkOrder, type WoTransition } from "../actions";
import type { WorkOrderFormOptions } from "../form-options";
import { WorkOrderDialog, type EditableWorkOrder } from "../work-order-dialog";

const CONFIRM: Partial<Record<WoTransition, { title: string; body: string; action: string; destructive?: boolean }>> = {
  cancel: {
    title: "Cancel this work order?",
    body: "It will be removed from the shop-floor queue. Cancelled work orders can't be reopened.",
    action: "Cancel work order",
    destructive: true,
  },
  complete: {
    title: "Complete this work order?",
    body: "Use this when the remaining quantity won't be made. No more output can be reported against it.",
    action: "Complete work order",
  },
};

export function WorkOrderActions({
  workOrderId,
  status,
  hasOpenRun,
  hasRuns,
  editable,
  options,
}: {
  workOrderId: number;
  status: WoStatus;
  hasOpenRun: boolean;
  hasRuns: boolean;
  editable: EditableWorkOrder;
  options: WorkOrderFormOptions;
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<WoTransition | null>(null);

  const go = (transition: WoTransition) =>
    startTransition(async () => {
      const result = await transitionWorkOrder(workOrderId, transition);
      if (result.status === "success") toast.success(result.message);
      else toast.error(result.message);
      setConfirm(null);
    });

  const canEdit = status === "DRAFT" || status === "RELEASED" || status === "ON_HOLD";
  const confirmCfg = confirm ? CONFIRM[confirm] : undefined;

  return (
    <div className="flex flex-wrap gap-2">
      {canEdit && (
        <Button variant="outline" onClick={() => setEditing(true)} disabled={pending}>
          <PencilIcon /> Edit
        </Button>
      )}
      {(status === "DRAFT" || status === "RELEASED" || status === "ON_HOLD") && !hasRuns && (
        <Button variant="outline" className="hover:border-destructive/40 hover:text-destructive" onClick={() => setConfirm("cancel")} disabled={pending}>
          <XCircleIcon /> Cancel
        </Button>
      )}
      {(status === "RELEASED" || status === "IN_PROGRESS") && (
        <Button variant="outline" className="hover:border-warning/50 hover:text-warning" onClick={() => go("hold")} disabled={pending || hasOpenRun}>
          <PauseIcon /> Put on hold
        </Button>
      )}
      {status === "ON_HOLD" && (
        <Button variant="outline" onClick={() => go("resume")} disabled={pending}>
          <PlayIcon /> Resume
        </Button>
      )}
      {(status === "IN_PROGRESS" || status === "ON_HOLD") && (
        <Button variant="outline" onClick={() => setConfirm("complete")} disabled={pending || hasOpenRun}>
          <CheckCheckIcon /> Complete
        </Button>
      )}
      {status === "DRAFT" && (
        <Button onClick={() => go("release")} disabled={pending} className="shadow-md shadow-primary/25">
          {pending ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Release to floor
        </Button>
      )}

      {editing && <WorkOrderDialog options={options} workOrder={editable} onClose={() => setEditing(false)} />}

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmCfg?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmCfg?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction
              className={confirmCfg?.destructive ? "bg-destructive hover:bg-destructive/90 text-white" : undefined}
              onClick={(e) => {
                e.preventDefault();
                if (confirm) go(confirm);
              }}
            >
              {pending && <Loader2Icon className="animate-spin" />}
              {confirmCfg?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
