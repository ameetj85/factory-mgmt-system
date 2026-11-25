"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { Combobox } from "@/components/combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryParams } from "@/hooks/use-query-params";
import { TXN_TYPE_LABELS, TXN_TYPES, type TxnType } from "@/lib/inventory/constants";
import type { ItemOption, LocationOption } from "@/lib/inventory/queries";
import { cn } from "@/lib/utils";

const ALL = "all";

export function LedgerFilterBar({
  items,
  locations,
  itemId,
  locationId,
  txnType,
  batch,
}: {
  items: ItemOption[];
  locations: LocationOption[];
  itemId?: number;
  locationId?: number;
  txnType?: TxnType;
  batch?: string;
}) {
  const { update, pending } = useQueryParams();
  const hasFilters = Boolean(itemId || locationId || txnType || batch);

  return (
    <div className={cn("grid gap-3 transition-opacity md:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1.3fr_auto]", pending && "opacity-60")}>
      <Combobox
        value={itemId ? String(itemId) : ALL}
        onChange={(v) => update({ item: v === ALL ? undefined : v })}
        placeholder="All items"
        searchPlaceholder="Search SKU or name…"
        options={[
          { value: ALL, label: "All items" },
          ...items.map((i) => ({ value: String(i.id), label: `${i.sku} — ${i.name}`, keywords: [i.sku, i.name] })),
        ]}
      />
      <Select value={txnType ?? ALL} onValueChange={(v) => update({ type: v === ALL ? undefined : v })}>
        <SelectTrigger className="h-10 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All movement types</SelectItem>
          {TXN_TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {TXN_TYPE_LABELS[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={locationId ? String(locationId) : ALL} onValueChange={(v) => update({ location: v === ALL ? undefined : v })}>
        <SelectTrigger className="h-10 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All locations</SelectItem>
          {locations.map((l) => (
            <SelectItem key={l.id} value={String(l.id)}>
              {l.code} · {l.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <form
        className="relative"
        onSubmit={(e) => {
          e.preventDefault();
          update({ batch: String(new FormData(e.currentTarget).get("batch") ?? "").trim() || undefined });
        }}
      >
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input key={batch} name="batch" defaultValue={batch} placeholder="Lot number… (Enter)" className="h-10 pl-9 font-mono" />
      </form>
      {hasFilters ? (
        <Button variant="ghost" className="h-10" onClick={() => update({ item: undefined, type: undefined, location: undefined, batch: undefined })}>
          <XIcon /> Clear
        </Button>
      ) : (
        <span className="hidden xl:block" />
      )}
    </div>
  );
}
