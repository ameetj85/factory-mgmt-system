"use client";

import { useActionState, useState } from "react";
import { MinusIcon, PlusIcon, SlidersHorizontalIcon } from "lucide-react";
import { toast } from "sonner";
import { Field, FieldMessage, FormAlert, SubmitButton } from "@/components/forms";
import { ItemPicker, LocationSelect, LotPicker, lotKey } from "@/components/inventory/pickers";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useIdempotencyKey } from "@/hooks/use-idempotency-key";
import { initialFormState, type FormState } from "@/lib/forms";
import { ADJUSTMENT_REASONS } from "@/lib/inventory/constants";
import type { ItemOption, LocationOption, StockLot } from "@/lib/inventory/queries";
import { cn } from "@/lib/utils";
import { requestAdjustment } from "../actions";

type Direction = "increase" | "decrease";

export function AdjustmentDialog({
  items,
  locations,
  lots,
  autoApprove,
}: {
  items: ItemOption[];
  locations: LocationOption[];
  lots: StockLot[];
  autoApprove: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<Direction>("decrease");
  const [itemId, setItemId] = useState("");
  const [lot, setLot] = useState("");
  const [locationId, setLocationId] = useState(locations[0] ? String(locations[0].id) : "");
  const idempotency = useIdempotencyKey();

  const item = items.find((i) => String(i.id) === itemId);
  const itemLots = lots.filter((l) => String(l.itemId) === itemId);
  const selectedLot = itemLots.find((l) => lotKey(l) === lot);

  const reset = () => {
    setItemId("");
    setLot("");
    setDirection("decrease");
  };

  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    formData.set("idempotencyKey", idempotency.current());
    formData.set("direction", direction);
    formData.set("itemId", itemId);
    if (direction === "decrease") {
      const [lotLocation = "", lotBatch = ""] = lot.split("|");
      formData.set("locationId", lotLocation);
      formData.set("batchNumber", lotBatch);
    } else {
      formData.set("locationId", locationId);
    }
    const result = await requestAdjustment(prev, formData);
    if (result.status === "success") {
      toast.success(result.message);
      idempotency.reset();
      reset();
      setOpen(false);
      return initialFormState;
    }
    return result;
  }, initialFormState);
  const errors = state.fieldErrors ?? {};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="shadow-md shadow-primary/25">
          <SlidersHorizontalIcon /> {autoApprove ? "New adjustment" : "Request adjustment"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{autoApprove ? "Adjust stock" : "Request a stock adjustment"}</DialogTitle>
          <DialogDescription>
            {autoApprove ? "Posts to the stock ledger immediately." : "A production manager or admin will review it before stock changes."}
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <FormAlert state={state} />

          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Direction">
            {(
              [
                { value: "decrease", label: "Remove stock", icon: MinusIcon },
                { value: "increase", label: "Add stock", icon: PlusIcon },
              ] as const
            ).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={direction === value}
                onClick={() => {
                  setDirection(value);
                  setLot("");
                }}
                className={cn(
                  "flex h-11 items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-all",
                  direction === value
                    ? "border-primary bg-primary/10 text-primary ring-primary/30 ring-2"
                    : "text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="adj-item">Item</Label>
            <ItemPicker
              id="adj-item"
              items={items}
              value={itemId}
              onChange={(v) => {
                setItemId(v);
                setLot("");
              }}
              invalid={Boolean(errors.itemId)}
            />
            <FieldMessage id="adj-item" errors={errors.itemId && ["Choose an item."]} />
          </div>

          {direction === "decrease" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="adj-lot">Lot to reduce</Label>
              <LotPicker id="adj-lot" lots={itemLots} uom={item?.uom} value={lot} onChange={setLot} disabled={!itemId} invalid={Boolean(errors.batchNumber)} />
              <FieldMessage id="adj-lot" errors={errors.batchNumber ?? errors.locationId} />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="adj-location">Location</Label>
                <LocationSelect id="adj-location" locations={locations} value={locationId} onChange={setLocationId} invalid={Boolean(errors.locationId)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="adj-batch">Lot</Label>
                <Input id="adj-batch" name="batchNumber" placeholder="Existing lot, or blank for new" className="h-10 font-mono uppercase" />
                <FieldMessage id="adj-batch" errors={errors.batchNumber} />
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              name="qty"
              label={`Quantity${item ? ` (${item.uom})` : ""}`}
              inputMode="decimal"
              required
              errors={errors.qty}
              hint={direction === "decrease" && selectedLot ? `${selectedLot.qtyMilli / 1000} in this lot` : undefined}
            />
            <div className="grid gap-1.5">
              <Label htmlFor="adj-reason">Reason</Label>
              <Select name="reasonCode">
                <SelectTrigger id="adj-reason" className="h-10 w-full" aria-invalid={errors.reasonCode ? true : undefined}>
                  <SelectValue placeholder="Choose a reason" />
                </SelectTrigger>
                <SelectContent>
                  {ADJUSTMENT_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldMessage id="adj-reason" errors={errors.reasonCode} />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="adj-notes">Notes</Label>
            <Textarea id="adj-notes" name="notes" rows={2} placeholder="What happened? Helps the reviewer." />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pending={pending} pendingText="Submitting…">
              {autoApprove ? "Post adjustment" : "Submit for approval"}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
