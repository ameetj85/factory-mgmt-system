"use client";

import { Combobox } from "@/components/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ITEM_TYPE_LABELS } from "@/lib/inventory/constants";
import type { ItemOption, LocationOption, StockLot } from "@/lib/inventory/queries";
import { formatQty } from "@/lib/quantity";

export function ItemPicker({
  items,
  value,
  onChange,
  id,
  invalid,
}: {
  items: ItemOption[];
  value: string;
  onChange: (value: string) => void;
  id?: string;
  invalid?: boolean;
}) {
  return (
    <Combobox
      id={id}
      value={value}
      onChange={onChange}
      invalid={invalid}
      placeholder="Choose an item"
      searchPlaceholder="Search SKU or name…"
      options={items.map((i) => ({
        value: String(i.id),
        label: `${i.sku} — ${i.name}`,
        description: `${ITEM_TYPE_LABELS[i.type]} · ${i.uom}`,
        keywords: [i.sku, i.name],
      }))}
    />
  );
}

export function LocationSelect({
  locations,
  value,
  onChange,
  id,
  invalid,
  exclude,
  placeholder = "Choose a location",
}: {
  locations: LocationOption[];
  value: string;
  onChange: (value: string) => void;
  id?: string;
  invalid?: boolean;
  exclude?: string;
  placeholder?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="h-10 w-full" aria-invalid={invalid || undefined}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {locations
          .filter((l) => String(l.id) !== exclude)
          .map((l) => (
            <SelectItem key={l.id} value={String(l.id)}>
              <span className="font-medium">{l.code}</span>
              <span className="text-muted-foreground">{l.name}</span>
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}

/** Lot key used by lot pickers: "<locationId>|<batchNumber>". */
export function lotKey(lot: Pick<StockLot, "locationId" | "batchNumber">) {
  return `${lot.locationId}|${lot.batchNumber}`;
}

export function LotPicker({
  lots,
  uom,
  value,
  onChange,
  id,
  invalid,
  disabled,
}: {
  lots: StockLot[];
  uom?: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  return (
    <Combobox
      id={id}
      value={value}
      onChange={onChange}
      invalid={invalid}
      disabled={disabled || lots.length === 0}
      placeholder={disabled ? "Choose an item first" : lots.length === 0 ? "No stock on hand" : "Choose a lot"}
      searchPlaceholder="Search lot or location…"
      emptyText="No lots found."
      options={lots.map((l) => ({
        value: lotKey(l),
        label: `${l.batchNumber} @ ${l.locationCode}`,
        description: `${formatQty(l.qtyMilli, uom)} available`,
        keywords: [l.batchNumber, l.locationCode],
      }))}
    />
  );
}
