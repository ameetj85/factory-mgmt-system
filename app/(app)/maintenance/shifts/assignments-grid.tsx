"use client";

import { useTransition } from "react";
import { XIcon } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DAY_SHORT } from "@/lib/maintenance/constants";
import type { WorkstationOption } from "@/lib/production/queries";
import { endAssignment } from "./actions";

export interface AssignmentRow {
  id: number;
  workstationId: number;
  workstationCode: string;
  templateId: number;
  templateName: string;
  dayOfWeek: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}

/** Machine × weekday grid of scheduled shifts. Ended assignments are hidden; history stays in the database. */
export function AssignmentsGrid({
  assignments,
  workstations,
  today,
}: {
  assignments: AssignmentRow[];
  workstations: WorkstationOption[];
  /** Today's date in the factory time zone (YYYY-MM-DD). */
  today: string;
}) {
  const [pending, startTransition] = useTransition();
  const current = assignments.filter((a) => !a.effectiveTo || a.effectiveTo >= today);

  const end = (a: AssignmentRow) =>
    startTransition(async () => {
      const result = await endAssignment(a.id);
      if (result.status === "success") toast.success(result.message);
      else toast.error(result.message);
    });

  if (workstations.length === 0) return <p className="text-muted-foreground text-sm">No machines yet.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            <th className="text-muted-foreground w-28 text-left text-xs font-medium">Machine</th>
            {DAY_SHORT.map((d) => (
              <th key={d} className="text-muted-foreground text-xs font-medium">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {workstations.map((w) => (
            <tr key={w.id}>
              <td className="font-mono text-xs font-medium">{w.code}</td>
              {DAY_SHORT.map((_, day) => {
                const cell = current.filter((a) => a.workstationId === w.id && a.dayOfWeek === day);
                return (
                  <td key={day} className="bg-muted/40 hover:bg-accent/50 h-12 rounded-lg p-1 align-top transition-colors">
                    <div className="flex flex-col gap-1">
                      {cell.map((a) => (
                        <Tooltip key={a.id}>
                          <TooltipTrigger asChild>
                            <span className="bg-primary/15 text-primary group/chip flex items-center justify-between gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium">
                              <span className="truncate">
                                {a.templateName}
                                {a.effectiveFrom > today && <span className="opacity-70"> (from {a.effectiveFrom.slice(5)})</span>}
                              </span>
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => end(a)}
                                className="hover:text-destructive opacity-0 transition-opacity group-hover/chip:opacity-100 focus:opacity-100"
                                aria-label={`End ${a.templateName} on ${DAY_SHORT[day]} for ${w.code}`}
                              >
                                <XIcon className="size-3" />
                              </button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            From {a.effectiveFrom}
                            {a.effectiveTo ? ` until ${a.effectiveTo}` : ", no end date"}
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
