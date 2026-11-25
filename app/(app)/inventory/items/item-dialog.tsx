"use client";

import { useActionState, useState } from "react";
import { PackagePlusIcon } from "lucide-react";
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
import { ITEM_TYPE_LABELS, ITEM_TYPES, UNITS_OF_MEASURE } from "@/lib/inventory/constants";
import { qtyInputValue } from "@/lib/quantity";
import { createItem, updateItem } from "./actions";
import type { ItemRow } from "./items-table";

/** Create dialog (with trigger button) when `item` is omitted; edit dialog for `item` otherwise. */
export function ItemDialog({ item, onClose }: { item?: ItemRow; onClose?: () => void }) {
  const editing = Boolean(item);
  const [open, setOpen] = useState(editing);

  const close = () => {
    setOpen(false);
    onClose?.();
  };

  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await (editing ? updateItem : createItem)(prev, formData);
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
            <PackagePlusIcon /> New item
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${item!.sku}` : "New item"}</DialogTitle>
          <DialogDescription>
            {editing ? "Changes apply to future transactions; history is kept in the audit log." : "Add a material, sub-assembly or finished good."}
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          {editing && <input type="hidden" name="id" value={item!.id} />}
          <FormAlert state={state} />
          <div className="grid gap-4 sm:grid-cols-[1fr_1.6fr]">
            <Field name="sku" label="SKU" defaultValue={item?.sku} autoCapitalize="characters" required errors={errors.sku} className="font-mono uppercase" />
            <Field name="name" label="Name" defaultValue={item?.name} required errors={errors.name} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" defaultValue={item?.description ?? ""} rows={2} placeholder="Optional" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="type">Item type</Label>
              <Select name="type" defaultValue={item?.type}>
                <SelectTrigger id="type" className="h-10 w-full" aria-invalid={errors.type ? true : undefined}>
                  <SelectValue placeholder="Choose a type" />
                </SelectTrigger>
                <SelectContent>
                  {ITEM_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ITEM_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldMessage id="type" errors={errors.type} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="uom">Unit of measure</Label>
              <Select name="uom" defaultValue={item?.uom} disabled={item?.hasTransactions}>
                <SelectTrigger id="uom" className="h-10 w-full" aria-invalid={errors.uom ? true : undefined}>
                  <SelectValue placeholder="Choose a unit" />
                </SelectTrigger>
                <SelectContent>
                  {UNITS_OF_MEASURE.map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* A disabled select isn't submitted, so send the locked value explicitly. */}
              {item?.hasTransactions && <input type="hidden" name="uom" value={item.uom} />}
              <FieldMessage
                id="uom"
                errors={errors.uom}
                hint={item?.hasTransactions ? "Locked: stock has already been recorded in this unit." : undefined}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              name="reorderPoint"
              label="Reorder point"
              inputMode="decimal"
              defaultValue={item ? qtyInputValue(item.reorderPointMilli) : "0"}
              hint="Alert when total stock falls below this."
              errors={errors.reorderPoint}
            />
            <Field
              name="standardCost"
              label="Standard cost (USD, optional)"
              inputMode="decimal"
              defaultValue={item?.standardCostCents != null ? (item.standardCostCents / 100).toFixed(2) : ""}
              placeholder="0.00"
              errors={errors.standardCost}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <SubmitButton pending={pending} pendingText="Saving…">
              {editing ? "Save changes" : "Create item"}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
