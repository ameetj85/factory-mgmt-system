"use client";

import { useActionState, useRef, useState } from "react";
import { PlusIcon, Trash2Icon, TruckIcon } from "lucide-react";
import { toast } from "sonner";
import { Field, FieldMessage, FormAlert, SubmitButton } from "@/components/forms";
import { ItemPicker, LotPicker, lotKey } from "@/components/inventory/pickers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useIdempotencyKey } from "@/hooks/use-idempotency-key";
import { initialFormState, type FormState } from "@/lib/forms";
import type { ItemOption, StockLot } from "@/lib/inventory/queries";
import { shipStock } from "../actions";

interface Line {
  key: number;
  itemId: string;
  lot: string;
  qty: string;
}

const emptyLine = (key: number): Line => ({ key, itemId: "", lot: "", qty: "" });

export function ShipForm({ items, lots }: { items: ItemOption[]; lots: StockLot[] }) {
  const [lines, setLines] = useState<Line[]>(() => [emptyLine(0)]);
  const formRef = useRef<HTMLFormElement>(null);
  const idempotency = useIdempotencyKey();

  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    formData.set("idempotencyKey", idempotency.current());
    formData.set(
      "lines",
      JSON.stringify(
        lines.map((l) => {
          const [locationId = "", batchNumber = ""] = l.lot.split("|");
          return { itemId: l.itemId, locationId, batchNumber, qty: l.qty };
        }),
      ),
    );
    const result = await shipStock(prev, formData);
    if (result.status === "success") {
      toast.success(result.message);
      idempotency.reset();
      formRef.current?.reset();
      setLines([emptyLine(0)]);
      return initialFormState;
    }
    return result;
  }, initialFormState);

  const errors = state.fieldErrors ?? {};
  const lineError = (i: number, field: string) => errors[`lines.${i}.${field}`];
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <form ref={formRef} action={action} className="space-y-5">
      <FormAlert state={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <Field name="customerName" label="Customer" required errors={errors.customerName} />
        <Field name="orderReference" label="Sales order reference" placeholder="Optional" errors={errors.orderReference} />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Lines</Label>
          <FieldMessage id="lines" errors={errors.lines} />
        </div>
        {lines.map((line, i) => {
          const item = items.find((it) => String(it.id) === line.itemId);
          const itemLots = lots.filter((l) => String(l.itemId) === line.itemId);
          const selectedLot = itemLots.find((l) => lotKey(l) === line.lot);
          const lotErrors = lineError(i, "batchNumber") ?? lineError(i, "locationId");
          return (
            <div
              key={line.key}
              className="hover:border-primary/30 grid gap-3 rounded-xl border p-3 transition-colors md:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_minmax(0,1fr)_auto] md:items-start"
            >
              <div className="grid gap-1.5">
                <ItemPicker
                  items={items}
                  value={line.itemId}
                  onChange={(itemId) => update(line.key, { itemId, lot: "" })}
                  invalid={Boolean(lineError(i, "itemId"))}
                />
                <FieldMessage id={`item-${line.key}`} errors={lineError(i, "itemId") && ["Choose an item."]} />
              </div>
              <div className="grid gap-1.5">
                <LotPicker
                  blockHeld
                  lots={itemLots}
                  uom={item?.uom}
                  value={line.lot}
                  disabled={!line.itemId}
                  onChange={(lot) => update(line.key, { lot })}
                  invalid={Boolean(lotErrors)}
                />
                <FieldMessage id={`lot-${line.key}`} errors={lotErrors && ["Choose a lot."]} />
              </div>
              <div className="grid gap-1.5">
                <div className="relative">
                  <Input
                    value={line.qty}
                    onChange={(e) => update(line.key, { qty: e.target.value })}
                    inputMode="decimal"
                    placeholder="Qty"
                    aria-label="Quantity"
                    className="h-10 pr-10 tabular-nums"
                    aria-invalid={lineError(i, "qty") ? true : undefined}
                  />
                  <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs">
                    {item?.uom}
                  </span>
                </div>
                {selectedLot && !lineError(i, "qty") && (
                  <button
                    type="button"
                    className="text-primary hover:text-primary/80 text-left text-xs underline-offset-2 hover:underline"
                    onClick={() => update(line.key, { qty: String(selectedLot.qtyMilli / 1000) })}
                  >
                    Use all ({selectedLot.qtyMilli / 1000})
                  </button>
                )}
                <FieldMessage id={`qty-${line.key}`} errors={lineError(i, "qty")} />
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
          );
        })}
        <Button
          type="button"
          variant="outline"
          className="hover:border-primary/50 hover:text-primary w-full border-dashed"
          onClick={() => setLines((ls) => [...ls, emptyLine(Math.max(...ls.map((l) => l.key)) + 1)])}
        >
          <PlusIcon /> Add line
        </Button>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={2} placeholder="Optional" />
      </div>

      <div className="flex justify-end">
        <SubmitButton pending={pending} pendingText="Recording…" className="shadow-md shadow-primary/25">
          <TruckIcon /> Record shipment
        </SubmitButton>
      </div>
    </form>
  );
}
