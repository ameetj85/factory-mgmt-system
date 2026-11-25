"use client";

import { useState } from "react";
import { CalendarRangeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQueryParams } from "@/hooks/use-query-params";
import { cn } from "@/lib/utils";

const PRESETS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
] as const;

export function RangeFilter({ current, from, to }: { current: string; from: string; to: string }) {
  const { update, pending } = useQueryParams();
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  return (
    <div className={cn("flex flex-wrap items-center gap-2 transition-opacity", pending && "opacity-60")}>
      <div className="bg-muted inline-flex rounded-lg p-1">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => update({ range: p.value === "today" ? undefined : p.value, from: undefined, to: undefined })}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-all",
              current === p.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-primary",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant={current === "custom" ? "default" : "outline"} size="sm" className="h-9">
            <CalendarRangeIcon /> {current === "custom" ? (from === to ? from : `${from} – ${to}`) : "Custom"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs">
              From
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9" />
            </label>
            <label className="grid gap-1 text-xs">
              To
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9" />
            </label>
          </div>
          <Button
            className="w-full"
            size="sm"
            disabled={!customFrom || !customTo || customFrom > customTo}
            onClick={() => {
              update({ range: undefined, from: customFrom, to: customTo });
              setOpen(false);
            }}
          >
            Apply
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
