"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryParams } from "@/hooks/use-query-params";
import { cn } from "@/lib/utils";

export function WorkOrderFilters({
  q,
  workstationId,
  workstations,
}: {
  q: string;
  workstationId?: number;
  workstations: { id: number; code: string }[];
}) {
  const { update, pending } = useQueryParams();
  return (
    <div className={cn("flex flex-col gap-3 transition-opacity sm:flex-row sm:items-center", pending && "opacity-60")}>
      <form
        className="relative"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: String(new FormData(e.currentTarget).get("q") ?? "").trim() || undefined });
        }}
      >
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input key={q} name="q" defaultValue={q} placeholder="WO number or SKU… (Enter)" className="h-10 pl-9 sm:w-64" />
      </form>
      <Select value={workstationId ? String(workstationId) : "all"} onValueChange={(v) => update({ ws: v === "all" ? undefined : v })}>
        <SelectTrigger className="h-10 w-full sm:w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All workstations</SelectItem>
          {workstations.map((w) => (
            <SelectItem key={w.id} value={String(w.id)}>
              {w.code}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {(q || workstationId) && (
        <Button variant="ghost" className="h-10" onClick={() => update({ q: undefined, ws: undefined })}>
          <XIcon /> Clear
        </Button>
      )}
    </div>
  );
}
