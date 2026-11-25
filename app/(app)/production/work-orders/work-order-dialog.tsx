"use client";

import { useActionState, useState } from "react";
import { ClipboardPlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Combobox } from "@/components/combobox";
import { Field, FieldMessage, FormAlert, SubmitButton } from "@/components/forms";
import { LocationSelect } from "@/components/inventory/pickers";
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
import { PRIORITIES, PRIORITY_LABELS, type Priority } from "@/lib/production/constants";
import { qtyInputValue } from "@/lib/quantity";
import { createWorkOrder, updateWorkOrder } from "./actions";
import type { WorkOrderFormOptions } from "./form-options";

export interface EditableWorkOrder {
  id: number;
  woNumber: string;
  itemId: number;
  sku: string;
  itemName: string;
  uom: string;
  qtyTargetMilli: number;
  dueDate: string | null;
  priority: Priority;
  workstationId: number;
  materialLocationId: number;
  outputLocationId: number;
  notes: string | null;
}

export function WorkOrderDialog({
  options,
  workOrder,
  onClose,
}: {
  options: WorkOrderFormOptions;
  workOrder?: EditableWorkOrder;
  onClose?: () => void;
}) {
  const editing = Boolean(workOrder);
  const [open, setOpen] = useState(editing);
  const defaultLocation = options.locations[0] ? String(options.locations[0].id) : "";
  const [itemId, setItemId] = useState(workOrder ? String(workOrder.itemId) : "");
  const [workstationId, setWorkstationId] = useState(workOrder ? String(workOrder.workstationId) : "");
  const [priority, setPriority] = useState<Priority>(workOrder?.priority ?? "normal");
  const [materialLocationId, setMaterialLocationId] = useState(workOrder ? String(workOrder.materialLocationId) : defaultLocation);
  const [outputLocationId, setOutputLocationId] = useState(workOrder ? String(workOrder.outputLocationId) : defaultLocation);
  const [releaseNow, setReleaseNow] = useState(true);

  const item = options.items.find((i) => String(i.id) === itemId);
  const close = () => {
    setOpen(false);
    onClose?.();
  };

  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    formData.set("itemId", itemId);
    formData.set("workstationId", workstationId);
    formData.set("priority", priority);
    formData.set("materialLocationId", materialLocationId);
    formData.set("outputLocationId", outputLocationId);
    formData.set("releaseNow", String(releaseNow));
    if (workOrder) formData.set("id", String(workOrder.id));
    const result = await (editing ? updateWorkOrder : createWorkOrder)(prev, formData);
    if (result.status === "success") {
      toast.success(result.message);
      close();
      return initialFormState;
    }
    return result;
  }, initialFormState);
  const errors = state.fieldErrors ?? {};

  const routingIds = item?.routingWorkstationIds ?? [];
  const workstationOptions = [...options.workstations].sort(
    (a, b) => Number(!routingIds.includes(a.id)) - Number(!routingIds.includes(b.id)),
  );

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      {!editing && (
        <DialogTrigger asChild>
          <Button className="shadow-md shadow-primary/25">
            <ClipboardPlusIcon /> New work order
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${workOrder!.woNumber}` : "New work order"}</DialogTitle>
          <DialogDescription>
            {editing ? "Changes apply to work not yet done." : "Uses the item's active bill of materials. Materials are consumed as output is reported."}
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <FormAlert state={state} />
          <div className="grid gap-1.5">
            <Label htmlFor="wo-item">Item to make</Label>
            {editing ? (
              <div className="bg-muted/50 flex h-10 items-center rounded-lg border px-3 text-sm">
                <span className="font-mono font-medium">{workOrder!.sku}</span>
                <span className="text-muted-foreground ml-2 truncate">{workOrder!.itemName}</span>
              </div>
            ) : (
              <Combobox
                id="wo-item"
                value={itemId}
                onChange={(v) => {
                  setItemId(v);
                  const next = options.items.find((i) => String(i.id) === v);
                  if (next?.routingWorkstationIds[0]) setWorkstationId(String(next.routingWorkstationIds[0]));
                }}
                invalid={Boolean(errors.itemId)}
                placeholder={options.items.length ? "Choose an item" : "No items have an active BOM"}
                searchPlaceholder="Search SKU or name…"
                options={options.items.map((i) => ({
                  value: String(i.id),
                  label: `${i.sku} — ${i.name}`,
                  description: `BOM v${i.bomVersion} · ${i.uom}`,
                  keywords: [i.sku, i.name],
                }))}
              />
            )}
            <FieldMessage id="wo-item" errors={errors.itemId && [errors.itemId[0].includes("bill") ? errors.itemId[0] : "Choose an item."]} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              name="qty"
              label={`Quantity${item || workOrder ? ` (${item?.uom ?? workOrder!.uom})` : ""}`}
              inputMode="decimal"
              defaultValue={workOrder ? qtyInputValue(workOrder.qtyTargetMilli) : ""}
              required
              errors={errors.qty}
            />
            <Field name="dueDate" type="date" label="Due date" defaultValue={workOrder?.dueDate ?? ""} errors={errors.dueDate} />
            <div className="grid gap-1.5">
              <Label htmlFor="wo-priority">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger id="wo-priority" className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="wo-ws">Workstation</Label>
            <Select value={workstationId} onValueChange={setWorkstationId}>
              <SelectTrigger id="wo-ws" className="h-10 w-full" aria-invalid={errors.workstationId ? true : undefined}>
                <SelectValue placeholder="Where will it run?" />
              </SelectTrigger>
              <SelectContent>
                {workstationOptions.map((w) => (
                  <SelectItem key={w.id} value={String(w.id)}>
                    <span className="font-mono">{w.code}</span>
                    <span className="text-muted-foreground">{w.name}</span>
                    {routingIds.includes(w.id) && <span className="text-primary text-xs">in routing</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldMessage
              id="wo-ws"
              errors={errors.workstationId}
              hint={item && routingIds.length === 0 ? "This recipe has no routing, so OEE performance won't be tracked for it." : undefined}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="wo-mat">Take materials from</Label>
              <LocationSelect id="wo-mat" locations={options.locations} value={materialLocationId} onChange={setMaterialLocationId} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="wo-out">Put finished output in</Label>
              <LocationSelect id="wo-out" locations={options.locations} value={outputLocationId} onChange={setOutputLocationId} />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="wo-notes">Notes</Label>
            <Textarea id="wo-notes" name="notes" rows={2} defaultValue={workOrder?.notes ?? ""} placeholder="Instructions for the floor (optional)" />
          </div>

          {!editing && (
            <label className="flex cursor-pointer items-center gap-3 text-sm">
              <Switch checked={releaseNow} onCheckedChange={setReleaseNow} />
              <span>
                Release to the shop floor now
                <span className="text-muted-foreground block text-xs">Otherwise it&apos;s saved as a draft.</span>
              </span>
            </label>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <SubmitButton pending={pending} pendingText="Saving…">
              {editing ? "Save changes" : "Create work order"}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
