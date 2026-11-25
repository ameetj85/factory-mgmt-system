import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { ArrowLeftRightIcon, ArrowRightIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LocalTime } from "@/components/local-time";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/dal";
import { db } from "@/lib/db/client";
import { activeItemOptions, activeLocationOptions, availableLots } from "@/lib/inventory/queries";
import { formatQty } from "@/lib/quantity";
import { TransferForm } from "./transfer-form";

export const metadata: Metadata = { title: "Transfers" };

export default function TransferPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TransferPageContent />
    </Suspense>
  );
}

async function TransferPageContent() {
  await requirePermission("inventory.transfer");
  const [items, locations, lots, recent] = await Promise.all([
    activeItemOptions(),
    activeLocationOptions(),
    availableLots(),
    db.all<{ id: number; sku: string; uom: string; batch_number: string; qty_milli: number; from_code: string; to_code: string; created_at: string; by_name: string }>(
      `SELECT t.id, i.sku, i.uom, t.batch_number, t.qty_milli, lf.code AS from_code, lt.code AS to_code, t.created_at, u.full_name AS by_name
         FROM transfers t
         JOIN items i ON i.id = t.item_id
         JOIN locations lf ON lf.id = t.from_location_id
         JOIN locations lt ON lt.id = t.to_location_id
         JOIN users u ON u.id = t.created_by
        ORDER BY t.id DESC LIMIT 8`,
    ),
  ]);
  const stockedItems = items.filter((i) => lots.some((l) => l.itemId === i.id));

  return (
    <>
      <PageHeader title="Transfers" description="Move a lot between storage locations. The lot number travels with the stock." />
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>New transfer</CardTitle>
            <CardDescription>Posts a matching transfer-out and transfer-in on the stock ledger.</CardDescription>
          </CardHeader>
          <CardContent>
            {stockedItems.length === 0 || locations.length < 2 ? (
              <EmptyState
                icon={ArrowLeftRightIcon}
                title={locations.length < 2 ? "Only one location" : "Nothing to move"}
                description={locations.length < 2 ? "Add another storage location to transfer stock between them." : "There's no stock on hand yet."}
              />
            ) : (
              <TransferForm items={stockedItems} lots={lots} locations={locations} />
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Recent transfers</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-muted-foreground text-sm">No transfers yet.</p>
            ) : (
              <ul className="divide-y">
                {recent.map((t) => (
                  <li key={t.id} className="hover:bg-accent/50 -mx-2 rounded-md px-2 py-2.5 transition-colors">
                    <p className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-mono font-medium">{t.sku}</span>
                      <span className="tabular-nums">{formatQty(t.qty_milli, t.uom)}</span>
                    </p>
                    <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                      <span className="font-mono">{t.batch_number}</span> · {t.from_code} <ArrowRightIcon className="size-3" /> {t.to_code}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      <LocalTime iso={t.created_at} /> · {t.by_name}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
