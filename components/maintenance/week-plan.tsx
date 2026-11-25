import type { DayPlan } from "@/lib/maintenance/service";
import { cn } from "@/lib/utils";

function hm(ms: number, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));
}

function dayLabel(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Seven-day strip of planned production time from the shift calendar. Times shown in the factory zone. */
export function WeekPlan({ days, timeZone }: { days: DayPlan[]; timeZone: string }) {
  const max = Math.max(1, ...days.map((d) => d.seconds));
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((d) => (
        <div
          key={d.date}
          className={cn(
            "hover:border-primary/40 flex min-h-36 flex-col justify-between rounded-xl border p-2 transition-colors",
            d.holiday && "border-dashed bg-muted/40",
          )}
        >
          <div>
            <p className="text-xs font-medium">{dayLabel(d.date)}</p>
            {d.holiday && <p className="text-warning text-[11px] font-medium">Holiday</p>}
            <ul className="mt-1 space-y-0.5">
              {d.shifts.map((s, i) => (
                <li key={i} className={cn("text-muted-foreground text-[11px] leading-tight", s.overtime && "text-primary font-medium")}>
                  {s.name} {hm(s.startMs, timeZone)}–{hm(s.endMs, timeZone)}
                  {s.overtime && " (OT)"}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-1">
            <div className="bg-muted h-1.5 overflow-hidden rounded-full">
              <div className="bg-primary h-full rounded-full" style={{ width: `${(d.seconds / max) * 100}%` }} />
            </div>
            <p className="text-xs font-semibold tabular-nums">{d.seconds ? `${(d.seconds / 3600).toFixed(1)} h` : "—"}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
