"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface BarRow {
  key: string;
  label: string;
  sublabel?: string;
  value: number;
  /** Text shown at the bar tip. */
  display: string;
  /** Extra tooltip lines (label → value). */
  details?: [string, string][];
}

/**
 * Horizontal single-series bars: magnitude by length in one hue, value at the tip, 24px max thickness,
 * 4px rounded data end and square at the baseline, per-bar hover/focus tooltip. An optional reference
 * line marks a target such as world-class OEE.
 */
export function BarList({
  rows,
  max,
  reference,
  color = "var(--viz-1)",
  title,
}: {
  rows: BarRow[];
  max?: number;
  reference?: { value: number; label: string };
  color?: string;
  title: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const top = Math.max(max ?? 0, ...rows.map((r) => r.value), reference?.value ?? 0, 1e-9);

  return (
    <figure aria-label={title} className="space-y-2.5">
      {rows.map((r) => (
        <div
          key={r.key}
          tabIndex={0}
          onPointerEnter={() => setActive(r.key)}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(r.key)}
          onBlur={() => setActive(null)}
          className={cn("relative grid grid-cols-[minmax(6rem,9rem)_1fr] items-center gap-3 rounded-md px-1 py-0.5 outline-none", active === r.key && "bg-primary/5")}
        >
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium">{r.label}</p>
            {r.sublabel && <p className="text-muted-foreground truncate text-xs">{r.sublabel}</p>}
          </div>
          <div className="relative flex h-6 items-center">
            {reference && (
              <div className="bg-viz-axis absolute inset-y-[-4px] w-px" style={{ left: `${(reference.value / top) * 100}%` }} aria-hidden />
            )}
            <div
              className="h-full max-h-6 rounded-r-[4px] transition-opacity"
              style={{ width: `${Math.max(0, (r.value / top) * 100)}%`, minWidth: r.value > 0 ? 2 : 0, background: color, opacity: active && active !== r.key ? 0.55 : 1 }}
            />
            <span className="text-foreground ml-2 shrink-0 text-xs font-semibold tabular-nums">{r.display}</span>
          </div>
          {active === r.key && r.details && (
            <div className="bg-popover text-popover-foreground ring-foreground/10 pointer-events-none absolute top-full left-36 z-10 mt-1 min-w-44 rounded-lg px-3 py-2 text-xs shadow-lg ring-1">
              {r.details.map(([k, v]) => (
                <p key={k} className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-semibold tabular-nums">{v}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      ))}
      {reference && (
        <p className="text-muted-foreground flex items-center gap-1.5 pl-[9.75rem] text-[11px]">
          <span className="bg-viz-axis inline-block h-3 w-px" aria-hidden /> {reference.label}
        </p>
      )}
    </figure>
  );
}
