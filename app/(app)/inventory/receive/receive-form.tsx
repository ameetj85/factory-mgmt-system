"use client";

import { useActionState, useRef, useState } from "react";
import { PackageCheckIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Field, FieldMessage, FormAlert, SubmitButton } from "@/components/forms";
import { ItemPicker, LocationSelect } from "@/components/inventory/pickers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useIdempotencyKey } from "@/hooks/use-idempotency-key";
import { initialFormState, type FormState } from "@/lib/forms";
import type { ItemOption, LocationOption } from "@/lib/inventory/queries";
import { receiveStock } from "../actions";

interface Line {
  key: number;
  itemId: string;
  locationId: string;
  batchNumber: string;
  qty: string;
  unitCost: string;
}

export function ReceiveForm({ items, locations }: { items: ItemOption[]; locations: LocationOption[] }) {
  const defaultLocation = locations[0] ? String(locations[0].id) : "";
  const newLine = (key: number): Line => ({ key, itemId: "", locationId: defaultLocation, batchNumber: "", qty: "", unitCost: "" });
  const [lines, setLines] = useState<Line[]>(() => [newLine(0)]);
  const addLine = () => setLines((ls) => [...ls, newLine(Math.max(...ls.map((l) => l.key)) + 1)]);
  const formRef = useRef<HTMLFormElement>(null);
  const idempotency = useIdempotencyKey();

  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    formData.set("idempotencyKey", idempotency.current());
    formData.set(
      "lines",
      JSON.stringify(lines.map(({ itemId, locationId, batchNumber, qty, unitCost }) => ({ itemId, locationId, batchNumber, qty, unitCost }))),
    );
    const result = await receiveStock(prev, formData);
    if (result.status === "success") {
      toast.success(result.message);
      idempotency.reset();
      formRef.current?.reset();
      setLines([newLine(0)]);
      return initialFormState;
    }
    return result;
  }, initialFormState);

  const errors = state.fieldErrors ?? {};
  const lineError = (i: number, field: string) => errors[`lines.${i}.${field}`];
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const uomFor = (itemId: string) => items.find((i) => String(i.id) === itemId)?.uom;

  return (
    <form ref={formRef} action={action} className="space-y-5">
      <FormAlert state={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <Field name="supplierName" label="Supplier" required errors={errors.supplierName} />
        <Field name="supplierReference" label="Delivery note / PO reference" placeholder="Optional" errors={errors.supplierReference} />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Lines</Label>
          <FieldMessage id="lines" errors={errors.lines} />
        </div>
        {lines.map((line, i) => (
          <div
            key={line.key}
            className="hover:border-primary/30 grid gap-3 rounded-xl border p-3 transition-colors md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-start"
          >
            <div className="grid gap-1.5">
              <Label htmlFor={`item-${line.key}`} className="text-muted-foreground text-xs md:sr-only">
                Item
              </Label>
              <ItemPicker
                id={`item-${line.key}`}
                items={items}
                value={line.itemId}
                onChange={(itemId) => update(line.key, { itemId })}
                invalid={Boolean(lineError(i, "itemId"))}
              />
              <FieldMessage id={`item-${line.key}`} errors={lineError(i, "itemId") && ["Choose an item."]} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`loc-${line.key}`} className="text-muted-foreground text-xs md:sr-only">
                Location
              </Label>
              <LocationSelect
                id={`loc-${line.key}`}
                locations={locations}
                value={line.locationId}
                onChange={(locationId) => update(line.key, { locationId })}
                invalid={Boolean(lineError(i, "locationId"))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`lot-${line.key}`} className="text-muted-foreground text-xs md:sr-only">
                Lot / batch
              </Label>
              <Input
                id={`lot-${line.key}`}
                value={line.batchNumber}
                onChange={(e) => update(line.key, { batchNumber: e.target.value })}
                placeholder="Lot (auto)"
                className="h-10 font-mono uppercase"
                aria-invalid={lineError(i, "batchNumber") ? true : undefined}
              />
              <FieldMessage id={`lot-${line.key}`} errors={lineError(i, "batchNumber")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`qty-${line.key}`} className="text-muted-foreground text-xs md:sr-only">
                Quantity
              </Label>
              <div className="relative">
                <Input
                  id={`qty-${line.key}`}
                  value={line.qty}
                  onChange={(e) => update(line.key, { qty: e.target.value })}
                  inputMode="decimal"
                  placeholder="Qty"
                  className="h-10 pr-10 tabular-nums"
                  aria-invalid={lineError(i, "qty") ? true : undefined}
                />
                <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs">
                  {uomFor(line.itemId)}
                </span>
              </div>
              <FieldMessage id={`qty-${line.key}`} errors={lineError(i, "qty")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`cost-${line.key}`} className="text-muted-foreground text-xs md:sr-only">
                Unit cost
              </Label>
              <Input
                id={`cost-${line.key}`}
                value={line.unitCost}
                onChange={(e) => update(line.key, { unitCost: e.target.value })}
                inputMode="decimal"
                placeholder="Unit cost"
                className="h-10 tabular-nums"
                aria-invalid={lineError(i, "unitCost") ? true : undefined}
              />
              <FieldMessage id={`cost-${line.key}`} errors={lineError(i, "unitCost")} />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="hover:bg-destructive/10 hover:text-destructive size-10 justify-self-end"
              disabled={lines.length === 1}
              onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}
              aria-label="Remove line"
            >
              <Trash2Icon />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" className="hover:border-primary/50 hover:text-primary w-full border-dashed" onClick={addLine}>
          <PlusIcon /> Add line
        </Button>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={2} placeholder="Optional" />
      </div>

      <div className="flex justify-end">
        <SubmitButton pending={pending} pendingText="Recording…" className="shadow-md shadow-primary/25">
          <PackageCheckIcon /> Record receipt
        </SubmitButton>
      </div>
    </form>
  );
}
