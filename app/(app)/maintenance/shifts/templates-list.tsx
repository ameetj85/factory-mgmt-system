"use client";

import { useState, useTransition } from "react";
import { ClockIcon, CoffeeIcon, PencilIcon, PowerIcon, PowerOffIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMinutes } from "@/lib/maintenance/constants";
import { cn } from "@/lib/utils";
import { setShiftTemplateActive } from "./actions";
import { TemplateDialog } from "./template-dialog";

export interface TemplateRow {
  id: number;
  name: string;
  startTime: string;
  durationMinutes: number;
  isActive: boolean;
  breaks: { name: string; offsetMinutes: number; durationMinutes: number }[];
}

function addMinutes(time: string, minutes: number) {
  const [h, m] = time.split(":").map(Number);
  const total = (h * 60 + m + minutes) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function TemplatesList({ templates }: { templates: TemplateRow[] }) {
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (t: TemplateRow) =>
    startTransition(async () => {
      const result = await setShiftTemplateActive(t.id, !t.isActive);
      if (result.status === "success") toast.success(result.message);
      else toast.error(result.message);
    });

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {templates.map((t) => {
          const net = t.durationMinutes - t.breaks.reduce((s, b) => s + b.durationMinutes, 0);
          const overnight = Number(t.startTime.slice(0, 2)) * 60 + Number(t.startTime.slice(3)) + t.durationMinutes > 1440;
          return (
            <div key={t.id} className={cn("hover-lift group rounded-xl border p-4", !t.isActive && "opacity-60")}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {t.name}
                    {!t.isActive && (
                      <Badge variant="outline" className="text-muted-foreground ml-2 h-5">
                        Inactive
                      </Badge>
                    )}
                  </p>
                  <p className="text-muted-foreground flex items-center gap-1.5 text-sm tabular-nums">
                    <ClockIcon className="size-3.5" /> {t.startTime}–{addMinutes(t.startTime, t.durationMinutes)}
                    {overnight && <span className="text-primary text-xs">(next day)</span>}
                  </p>
                </div>
                <div className="flex opacity-70 transition-opacity group-hover:opacity-100">
                  <Button variant="ghost" size="icon-sm" className="hover:text-primary" onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`} disabled={pending}>
                    <PencilIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className={t.isActive ? "hover:text-destructive" : "hover:text-primary"}
                    onClick={() => toggle(t)}
                    aria-label={t.isActive ? `Deactivate ${t.name}` : `Reactivate ${t.name}`}
                    disabled={pending}
                  >
                    {t.isActive ? <PowerOffIcon /> : <PowerIcon />}
                  </Button>
                </div>
              </div>
              <ul className="mt-3 space-y-1">
                {t.breaks.map((b, i) => (
                  <li key={i} className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    <CoffeeIcon className="size-3" /> {b.name} {addMinutes(t.startTime, b.offsetMinutes)} · {b.durationMinutes} min
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm">
                <span className="text-primary font-semibold">{formatMinutes(net)}</span> <span className="text-muted-foreground">planned per shift</span>
              </p>
            </div>
          );
        })}
      </div>
      {editing && <TemplateDialog key={editing.id} template={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
