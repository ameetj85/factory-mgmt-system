import Link from "next/link";
import { ArrowRightIcon, GaugeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OEE_WORLD_CLASS, pct } from "@/lib/analytics/format";
import { computeOee } from "@/lib/analytics/oee";
import { resolveWindow } from "@/lib/analytics/window";

async function loadToday() {
  const w = await resolveWindow({}, Date.now());
  return computeOee(w.startMs, w.endMs, w.timeZone);
}

/** Today's plant OEE and its three factors, each as a labelled meter. */
export async function OeeCard() {
  const { totals: t } = await loadToday();
  const factors = [
    { label: "Availability", value: t.availability },
    { label: "Performance", value: t.performance },
    { label: "Quality", value: t.quality },
  ];
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <GaugeIcon className="text-primary size-4" /> OEE today
          </CardTitle>
          <CardDescription>Plant-wide, so far today.</CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary">
          <Link href="/analytics">
            Details <ArrowRightIcon />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="grid items-center gap-6 sm:grid-cols-[auto_1fr]">
        <div>
          <p className="text-4xl font-semibold tracking-tight tabular-nums">{pct(t.oee)}</p>
          <p className="text-muted-foreground text-xs">{t.oee === null ? "No production yet today" : `World class is ${pct(OEE_WORLD_CLASS, 0)}`}</p>
        </div>
        <div className="space-y-2.5">
          {factors.map((f) => (
            <div key={f.label} className="grid grid-cols-[6.5rem_1fr_3.5rem] items-center gap-3 text-sm">
              <span className="text-muted-foreground">{f.label}</span>
              <div className="bg-primary/15 h-2 overflow-hidden rounded-full">
                <div className="bg-primary h-full rounded-full" style={{ width: `${Math.min(100, (f.value ?? 0) * 100)}%` }} />
              </div>
              <span className="text-right font-medium tabular-nums">{pct(f.value, 0)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
