import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ShieldAlertIcon, ShieldCheckIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LocalTime } from "@/components/local-time";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { formatQty } from "@/lib/quantity";
import { HoldActions } from "./hold-actions";
import { PlaceHoldDialog } from "./place-hold-dialog";

export const metadata: Metadata = { title: "Lot holds" };

export default function HoldsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <HoldsContent />
    </Suspense>
  );
}

async function HoldsContent() {
  const user = await requirePermission("quality.view");
  const canManage = can(user.role, "quality.manage");
  const [active, history, lots] = await Promise.all([
    db.all<{
      id: number;
      item_id: number;
      sku: string;
      item_name: string;
      uom: string;
      batch_number: string;
      reason: string;
      placed_at: string;
      placed_by: string;
      inspection_id: number | null;
      inspection_number: string | null;
      on_hand: number | null;
    }>(
      `SELECT h.id, h.item_id, i.sku, i.name AS item_name, i.uom, h.batch_number, h.reason, h.placed_at, u.full_name AS placed_by,
              h.inspection_id, x.inspection_number,
              (SELECT SUM(qty_change_milli) FROM inventory_txns t WHERE t.item_id = h.item_id AND t.batch_number = h.batch_number) AS on_hand
         FROM lot_holds h JOIN items i ON i.id = h.item_id JOIN users u ON u.id = h.placed_by LEFT JOIN inspections x ON x.id = h.inspection_id
        WHERE h.status = 'ACTIVE' ORDER BY h.placed_at`,
    ),
    db.all<{ id: number; sku: string; batch_number: string; status: string; resolved_at: string; resolved_by: string; resolution_notes: string | null; item_id: number }>(
      `SELECT h.id, i.sku, h.batch_number, h.status, h.resolved_at, u.full_name AS resolved_by, h.resolution_notes, h.item_id
         FROM lot_holds h JOIN items i ON i.id = h.item_id JOIN users u ON u.id = h.resolved_by
        WHERE h.status <> 'ACTIVE' ORDER BY h.resolved_at DESC LIMIT 15`,
    ),
    canManage
      ? db.all<{ itemId: number; sku: string; name: string; batchNumber: string }>(
          `SELECT s.item_id AS itemId, i.sku, i.name, s.batch_number AS batchNumber
             FROM stock_levels s JOIN items i ON i.id = s.item_id
            WHERE s.qty_milli > 0 AND NOT EXISTS (SELECT 1 FROM lot_holds h WHERE h.item_id = s.item_id AND h.batch_number = s.batch_number AND h.status = 'ACTIVE')
            GROUP BY s.item_id, s.batch_number ORDER BY MAX(s.last_txn_at) DESC LIMIT 300`,
        )
      : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader title="Lot holds" description="Held lots can't be shipped or consumed by production until a quality manager releases or scraps them.">
        {canManage && <PlaceHoldDialog lots={lots} />}
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlertIcon className="text-destructive size-4" /> On hold now
          </CardTitle>
        </CardHeader>
        <CardContent>
          {active.length === 0 ? (
            <EmptyState icon={ShieldCheckIcon} title="No lots on hold" description="Lots that fail a critical check are held here automatically." />
          ) : (
            <ul className="space-y-3">
              {active.map((h) => (
                <li key={h.id} className="border-destructive/30 bg-destructive/[0.03] hover:border-destructive/50 rounded-xl border p-4 transition-colors">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <Link href={`/quality/trace?item=${h.item_id}&lot=${encodeURIComponent(h.batch_number)}`} className="hover:text-primary font-mono text-lg font-semibold transition-colors">
                          {h.batch_number}
                        </Link>
                        <span className="text-muted-foreground">
                          <span className="font-mono">{h.sku}</span> · {h.item_name}
                        </span>
                      </p>
                      <p className="text-sm">{h.reason}</p>
                      <p className="text-muted-foreground text-xs">
                        {formatQty(h.on_hand ?? 0, h.uom)} on hand · held by {h.placed_by} on <LocalTime iso={h.placed_at} />
                        {h.inspection_id && (
                          <>
                            {" "}
                            ·{" "}
                            <Link href={`/quality/inspections/${h.inspection_id}`} className="hover:text-primary font-mono transition-colors">
                              {h.inspection_number}
                            </Link>
                          </>
                        )}
                      </p>
                    </div>
                    {canManage && <HoldActions holdId={h.id} batchNumber={h.batch_number} sku={h.sku} onHand={formatQty(h.on_hand ?? 0, h.uom)} />}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recently resolved</CardTitle>
          <CardDescription>Disposition decisions are kept with each hold.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-muted-foreground text-sm">No holds have been resolved yet.</p>
          ) : (
            <ul className="divide-y">
              {history.map((h) => (
                <li key={h.id} className="hover:bg-accent/40 -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 text-sm transition-colors">
                  <div>
                    <p>
                      <span className="font-mono font-medium">{h.batch_number}</span> <span className="text-muted-foreground">{h.sku}</span>
                    </p>
                    {h.resolution_notes && <p className="text-muted-foreground text-xs">{h.resolution_notes}</p>}
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className={h.status === "RELEASED" ? "border-success/40 text-success" : "border-destructive/40 text-destructive"}>
                      {h.status === "RELEASED" ? "Released" : "Scrapped"}
                    </Badge>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {h.resolved_by} · <LocalTime iso={h.resolved_at} />
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
