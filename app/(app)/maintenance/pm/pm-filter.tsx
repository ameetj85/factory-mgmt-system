"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryParams } from "@/hooks/use-query-params";
import type { WorkstationOption } from "@/lib/production/queries";
import { cn } from "@/lib/utils";

export function PmFilter({ workstations, workstationId }: { workstations: WorkstationOption[]; workstationId?: number }) {
  const { update, pending } = useQueryParams();
  return (
    <div className={cn("transition-opacity", pending && "opacity-60")}>
      <Select value={workstationId ? String(workstationId) : "all"} onValueChange={(v) => update({ ws: v === "all" ? undefined : v })}>
        <SelectTrigger className="h-10 w-full sm:w-64">
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
    </div>
  );
}
