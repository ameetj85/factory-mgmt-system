"use client";

import { useState } from "react";
import { BarChart3Icon, TableIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { niceTicks, tickFormatter } from "./nice-ticks";

export interface ColumnSeries {
  name: string;
  /** CSS color for the marks, e.g. "var(--viz-1)". Text never uses it. */
  color: string;
}

export interface ColumnDatum {
  label: string;
  values: number[];
}

const PLOT_HEIGHT = 200;

/**
 * Stacked column chart: columns ≤ 24px, 4px rounded tops, 2px surface gap between stacked segments,
 * hairline grid, legend for multiple series, per-column hover/focus tooltip and a table view.
 */
export function ColumnChart({
  data,
  series,
  fractionDigits = 0,
  unit,
  title,
}: {
  data: ColumnDatum[];
  series: ColumnSeries[];
  /** Maximum decimals in values (plain data, so the chart can be rendered from a Server Component). */
  fractionDigits?: number;
  unit?: string;
  title: string;
}) {
  const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: fractionDigits });
  const format = (v: number) => numberFormat.format(v);
  const [view, setView] = useState<"chart" | "table">("chart");
  const [active, setActive] = useState<number | null>(null);
  const totals = data.map((d) => d.values.reduce((s, v) => s + v, 0));
  const ticks = niceTicks(Math.max(...totals, 0));
  const top = ticks[ticks.length - 1];
  const tick = tickFormatter(top);
  const labelEvery = data.length > 16 ? Math.ceil(data.length / 12) : 1;

  return (
    <figure className="space-y-3" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {series.length > 1 ? (
          <ul className="flex flex-wrap gap-4 text-sm" aria-label="Legend">
            {series.map((s) => (
              <li key={s.name} className="text-muted-foreground flex items-center gap-2">
                <span className="size-3 rounded-[3px]" style={{ background: s.color }} aria-hidden />
                {s.name}
              </li>
            ))}
          </ul>
        ) : (
          <span />
        )}
        <Button variant="ghost" size="sm" className="hover:text-primary" onClick={() => setView(view === "chart" ? "table" : "chart")}>
          {view === "chart" ? <TableIcon /> : <BarChart3Icon />} {view === "chart" ? "Table" : "Chart"}
        </Button>
      </div>

      {view === "table" ? (
        <div className="max-h-80 overflow-auto rounded-xl border">
          <Table>
            <TableHeader className="bg-muted/60 sticky top-0">
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Period</TableHead>
                {series.map((s) => (
                  <TableHead key={s.name} className="text-right">
                    {s.name}
                  </TableHead>
                ))}
                <TableHead className="pr-4 text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((d, i) => (
                <TableRow key={d.label} className="hover:bg-accent/40">
                  <TableCell className="pl-4">{d.label}</TableCell>
                  {d.values.map((v, j) => (
                    <TableCell key={j} className="text-right tabular-nums">
                      {format(v)}
                    </TableCell>
                  ))}
                  <TableCell className="pr-4 text-right font-medium tabular-nums">{format(totals[i])}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex gap-2">
          {/* Y axis */}
          <div className="text-muted-foreground relative w-10 shrink-0 text-right text-[11px] tabular-nums" style={{ height: PLOT_HEIGHT }}>
            {ticks.map((t) => (
              <span key={t} className="absolute right-0 -translate-y-1/2" style={{ bottom: `${(t / top) * 100}%` }}>
                {tick(t)}
              </span>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="relative" style={{ height: PLOT_HEIGHT }}>
              {ticks.map((t) => (
                <div
                  key={t}
                  className={cn("absolute inset-x-0 h-px", t === 0 ? "bg-viz-axis" : "bg-viz-grid")}
                  style={{ bottom: `${(t / top) * 100}%` }}
                  aria-hidden
                />
              ))}
              <div className="absolute inset-0 flex items-end">
                {data.map((d, i) => (
                  <div
                    key={d.label}
                    role="img"
                    tabIndex={0}
                    aria-label={`${d.label}: ${series.map((s, j) => `${s.name} ${format(d.values[j])}`).join(", ")}`}
                    onPointerEnter={() => setActive(i)}
                    onPointerLeave={() => setActive(null)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    className={cn("relative flex h-full flex-1 cursor-default items-end justify-center rounded-md outline-none", active === i && "bg-primary/5")}
                  >
                    <div className="flex w-full max-w-6 flex-col-reverse gap-[2px] px-[1px]" style={{ height: `${(totals[i] / top) * 100}%` }}>
                      {d.values.map((v, j) =>
                        v > 0 ? (
                          <div
                            key={j}
                            className={cn("w-full transition-opacity", j === d.values.findLastIndex((x) => x > 0) && "rounded-t-[4px]", active === i && "opacity-90")}
                            style={{ height: `${(v / totals[i]) * 100}%`, minHeight: 2, background: series[j].color }}
                          />
                        ) : null,
                      )}
                    </div>
                    {active === i && (
                      <div className="bg-popover text-popover-foreground ring-foreground/10 pointer-events-none absolute bottom-full z-10 mb-2 min-w-36 rounded-lg px-3 py-2 text-xs shadow-lg ring-1">
                        <p className="text-muted-foreground mb-1">{d.label}</p>
                        {series.map((s, j) => (
                          <p key={s.name} className="flex items-center justify-between gap-4">
                            <span className="text-muted-foreground flex items-center gap-1.5">
                              <span className="h-0.5 w-3 rounded" style={{ background: s.color }} aria-hidden />
                              {s.name}
                            </span>
                            <span className="text-foreground font-semibold tabular-nums">{format(d.values[j])}</span>
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="text-muted-foreground mt-1.5 flex text-[11px]">
              {data.map((d, i) => (
                <span key={d.label} className="flex-1 truncate text-center">
                  {i % labelEvery === 0 ? d.label : ""}
                </span>
              ))}
            </div>
            {unit && <p className="text-muted-foreground mt-1 text-right text-[11px]">{unit}</p>}
          </div>
        </div>
      )}
    </figure>
  );
}
