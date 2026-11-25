"use client";

import { ArchiveIcon, SearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryParams } from "@/hooks/use-query-params";
import { ITEM_TYPE_LABELS, ITEM_TYPES, type ItemType } from "@/lib/inventory/constants";
import { cn } from "@/lib/utils";

export function ItemFilters({ q, type, showArchived }: { q: string; type?: ItemType; showArchived: boolean }) {
  const { update, pending } = useQueryParams();

  return (
    <div className={cn("flex flex-col gap-3 transition-opacity md:flex-row md:items-center", pending && "opacity-60")}>
      <form
        className="relative flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: String(new FormData(e.currentTarget).get("q") ?? "").trim() });
        }}
      >
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input key={q} name="q" defaultValue={q} placeholder="Search SKU, name or description… (press Enter)" className="h-10 pl-9" />
      </form>
      <Select value={type ?? "all"} onValueChange={(v) => update({ type: v === "all" ? undefined : v })}>
        <SelectTrigger className="h-10 w-full md:w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All item types</SelectItem>
          {ITEM_TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {ITEM_TYPE_LABELS[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant={showArchived ? "secondary" : "outline"}
        className="h-10"
        onClick={() => update({ archived: showArchived ? undefined : "1" })}
      >
        <ArchiveIcon /> {showArchived ? "Showing archived" : "Show archived"}
      </Button>
      {(q || type) && (
        <Button variant="ghost" className="h-10" onClick={() => update({ q: undefined, type: undefined })}>
          <XIcon /> Clear
        </Button>
      )}
    </div>
  );
}
