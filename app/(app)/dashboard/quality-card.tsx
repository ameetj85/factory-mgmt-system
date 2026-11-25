import Link from "next/link";
import { ArrowRightIcon, ShieldAlertIcon, ShieldCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db/client";

export async function QualityCard() {
  const [holds, stats] = await Promise.all([
    db.all<{ id: number; item_id: number; batch_number: string; sku: string; reason: string }>(
      `SELECT h.id, h.item_id, h.batch_number, i.sku, h.reason FROM lot_holds h JOIN items i ON i.id = h.item_id
        WHERE h.status = 'ACTIVE' ORDER BY h.placed_at DESC LIMIT 4`,
    ),
    db.get<{ total: number; passed: number | null; held: number }>(
      `SELECT COUNT(*) AS total, SUM(result = 'PASS') AS passed,
              (SELECT COUNT(*) FROM lot_holds WHERE status = 'ACTIVE') AS held
         FROM inspections WHERE created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')`,
    ),
  ]);
  const total = stats?.total ?? 0;
  const rate = total ? Math.round(((stats?.passed ?? 0) / total) * 100) : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheckIcon className="text-primary size-4" /> Quality
          </CardTitle>
          <CardDescription>Inspections this week and lots on hold.</CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary">
          <Link href="/quality/holds">
            Lot holds <ArrowRightIcon />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Link href="/quality/inspections" className="hover:border-primary/40 hover:bg-accent/40 rounded-xl border p-3 transition-colors">
            <p className="text-muted-foreground text-xs">Inspections (7 days)</p>
            <p className="text-2xl font-semibold tabular-nums">{total}</p>
          </Link>
          <Link href="/quality/inspections?result=FAIL" className="hover:border-primary/40 hover:bg-accent/40 rounded-xl border p-3 transition-colors">
            <p className="text-muted-foreground text-xs">First-pass rate</p>
            <p className="text-2xl font-semibold tabular-nums">{rate === null ? "—" : `${rate}%`}</p>
          </Link>
          <Link
            href="/quality/holds"
            className={`rounded-xl border p-3 transition-colors ${stats?.held ? "border-destructive/40 hover:bg-destructive/10" : "hover:border-primary/40 hover:bg-accent/40"}`}
          >
            <p className="text-muted-foreground text-xs">Lots on hold</p>
            <p className={`text-2xl font-semibold tabular-nums ${stats?.held ? "text-destructive" : ""}`}>{stats?.held ?? 0}</p>
          </Link>
        </div>
        {holds.length > 0 && (
          <ul className="space-y-2">
            {holds.map((h) => (
              <li key={h.id}>
                <Link
                  href={`/quality/trace?item=${h.item_id}&lot=${encodeURIComponent(h.batch_number)}`}
                  className="border-destructive/30 hover:bg-destructive/10 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors"
                >
                  <ShieldAlertIcon className="text-destructive size-4 shrink-0" />
                  <span className="font-mono font-medium">{h.batch_number}</span>
                  <span className="text-muted-foreground truncate">
                    {h.sku} · {h.reason}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
