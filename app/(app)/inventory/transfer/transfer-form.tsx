"use client";

import { useActionState, useRef, useState } from "react";
import { ArrowLeftRightIcon } from "lucide-react";
import { toast } from "sonner";
import { Field, FieldMessage, FormAlert, SubmitButton } from "@/components/forms";
import { ItemPicker, LocationSelect, LotPicker, lotKey } from "@/components/inventory/pickers";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useIdempotencyKey } from "@/hooks/use-idempotency-key";
import { initialFormState, type FormState } from "@/lib/forms";
import type { ItemOption, LocationOption, StockLot } from "@/lib/inventory/queries";
import { transferStock } from "../actions";

export function TransferForm({ items, lots, locations }: { items: ItemOption[]; lots: StockLot[]; locations: LocationOption[] }) {
  const [itemId, setItemId] = useState("");
  const [lot, setLot] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const idempotency = useIdempotencyKey();

  const item = items.find((i) => String(i.id) === itemId);
  const itemLots = lots.filter((l) => String(l.itemId) === itemId);
  const selectedLot = itemLots.find((l) => lotKey(l) === lot);
  const [fromLocationId = "", batchNumber = ""] = lot.split("|");

  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    formData.set("idempotencyKey", idempotency.current());
    const result = await transferStock(prev, formData);
    if (result.status === "success") {
      toast.success(result.message);
      idempotency.reset();
      formRef.current?.reset();
      setItemId("");
      setLot("");
      setToLocationId("");
      return initialFormState;
    }
    return result;
  }, initialFormState);
  const errors = state.fieldErrors ?? {};

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="fromLocationId" value={fromLocationId} />
      <input type="hidden" name="batchNumber" value={batchNumber} />
      <input type="hidden" name="toLocationId" value={toLocationId} />
      <FormAlert state={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="transfer-item">Item</Label>
          <ItemPicker
            id="transfer-item"
            items={items}
            value={itemId}
            onChange={(v) => {
              setItemId(v);
              setLot("");
            }}
            invalid={Boolean(errors.itemId)}
          />
          <FieldMessage id="transfer-item" errors={errors.itemId && ["Choose an item."]} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="transfer-lot">Lot and current location</Label>
          <LotPicker id="transfer-lot" lots={itemLots} uom={item?.uom} value={lot} disabled={!itemId} onChange={setLot} invalid={Boolean(errors.batchNumber)} />
          <FieldMessage id="transfer-lot" errors={errors.batchNumber && ["Choose a lot."]} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="transfer-to">Destination</Label>
          <LocationSelect
            id="transfer-to"
            locations={locations}
            value={toLocationId}
            onChange={setToLocationId}
            exclude={fromLocationId}
            placeholder="Move to…"
            invalid={Boolean(errors.toLocationId)}
          />
          <FieldMessage id="transfer-to" errors={errors.toLocationId && [errors.toLocationId[0].includes("different") ? errors.toLocationId[0] : "Choose a destination."]} />
        </div>
        <Field
          name="qty"
          label={`Quantity${item ? ` (${item.uom})` : ""}`}
          inputMode="decimal"
          errors={errors.qty}
          hint={selectedLot ? `${selectedLot.qtyMilli / 1000} available in this lot` : undefined}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="transfer-notes">Notes</Label>
        <Textarea id="transfer-notes" name="notes" rows={2} placeholder="Optional" />
      </div>
      <div className="flex justify-end">
        <SubmitButton pending={pending} pendingText="Moving…" className="shadow-md shadow-primary/25">
          <ArrowLeftRightIcon /> Transfer stock
        </SubmitButton>
      </div>
    </form>
  );
}
