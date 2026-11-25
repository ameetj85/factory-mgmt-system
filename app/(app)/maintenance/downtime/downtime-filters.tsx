"use client";

import { OctagonAlertIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryParams } from "@/hooks/use-query-params";
import type { WorkstationOption } from "@/lib/production/queries";
import { cn } from "@/lib/utils";

export function DowntimeFilters({
  workstations,
  workstationId,
  openOnly,
}: {
  workstations: WorkstationOption[];
  workstationId?: number;
  openOnly: boolean;
}) {
  const { update, pending } = useQueryParams();
  return (
    <div className={cn("flex flex-col gap-3 transition-opacity sm:flex-row sm:items-center", pending && "opacity-60")}>
      <Select value={workstationId ? String(workstationId) : "all"} onValueChange={(v) => update({ ws: v === "all" ? undefined : v })}>
        <SelectTrigger className="h-10 w-full sm:w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All machines</SelectItem>
          {workstations.map((w) => (
            <SelectItem key={w.id} value={String(w.id)}>
              {w.code} · {w.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant={openOnly ? "default" : "outline"}
        className={cn("h-10", !openOnly && "hover:border-destructive/40 hover:text-destructive")}
        onClick={() => update({ open: openOnly ? undefined : "1" })}
      >
        <OctagonAlertIcon /> Stopped now
      </Button>
      {(workstationId || openOnly) && (
        <Button variant="ghost" className="h-10" onClick={() => update({ ws: undefined, open: undefined })}>
          <XIcon /> Clear
        </Button>
      )}
    </div>
  );
}
