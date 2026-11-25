"use client";

import { useTransition } from "react";
import { CalendarOffIcon, CalendarPlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { removeException } from "./actions";

export interface ExceptionRow {
  id: number;
  date: string;
  type: "HOLIDAY" | "OVERTIME";
  notes: string | null;
  workstationCode: string | null;
  templateName: string | null;
}

export function ExceptionsList({ exceptions }: { exceptions: ExceptionRow[] }) {
  const [pending, startTransition] = useTransition();
  if (exceptions.length === 0) return <p className="text-muted-foreground text-sm">No holidays or overtime in the last 30 days or upcoming.</p>;

  const remove = (id: number) =>
    startTransition(async () => {
      const result = await removeException(id);
      if (result.status === "success") toast.success(result.message);
      else toast.error(result.message);
    });

  return (
    <ul className="divide-y">
      {exceptions.map((e) => (
        <li key={e.id} className="group hover:bg-accent/40 -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 transition-colors">
          <div className="flex items-center gap-3">
            <div
              className={`flex size-9 items-center justify-center rounded-lg ${e.type === "HOLIDAY" ? "bg-warning/15 text-warning" : "bg-primary/10 text-primary"}`}
            >
              {e.type === "HOLIDAY" ? <CalendarOffIcon className="size-4" /> : <CalendarPlusIcon className="size-4" />}
            </div>
            <div>
              <p className="text-sm font-medium tabular-nums">
                {e.date}{" "}
                <Badge variant="outline" className="ml-1 h-5">
                  {e.type === "HOLIDAY" ? "Holiday" : `Overtime · ${e.templateName}`}
                </Badge>
              </p>
              <p className="text-muted-foreground text-xs">
                {e.workstationCode ? <span className="font-mono">{e.workstationCode}</span> : "Whole factory"}
                {e.notes && <> · {e.notes}</>}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={pending}
            onClick={() => remove(e.id)}
            className="hover:bg-destructive/10 hover:text-destructive opacity-60 group-hover:opacity-100"
            aria-label="Remove"
          >
            <Trash2Icon />
          </Button>
        </li>
      ))}
    </ul>
  );
}
