import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { PackagePlusIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LocalTime } from "@/components/local-time";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/dal";
import { db } from "@/lib/db/client";
import { activeItemOptions, activeLocationOptions } from "@/lib/inventory/queries";
import { ReceiveForm } from "./receive-form";

export const metadata: Metadata = { title: "Receiving" };

export default function ReceivePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ReceivePageContent />
    </Suspense>
  );
}

async function ReceivePageContent() {
  await requirePermission("inventory.receive");
  const [items, locations, recent] = await Promise.all([
    activeItemOptions(),
    activeLocationOptions(),
    db.all<{ id: number; receipt_number: string; supplier_name: string; supplier_reference: string | null; received_at: string; lines: number; received_by: string }>(
      `SELECT r.id, r.receipt_number, r.supplier_name, r.supplier_reference, r.received_at, u.full_name AS received_by,
              (SELECT COUNT(*) FROM inventory_txns t WHERE t.reference_type = 'receipt' AND t.reference_id = r.id) AS lines
         FROM receipts r JOIN users u ON u.id = r.received_by
        ORDER BY r.id DESC LIMIT 8`,
    ),
  ]);

  return (
    <>
      <PageHeader title="Receiving" description="Record supplier deliveries. Every line gets a lot number so it can be traced later." />
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>New receipt</CardTitle>
            <CardDescription>Leave the lot blank to generate one automatically.</CardDescription>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <EmptyState icon={PackagePlusIcon} title="No active items" description="Add items to the item master before receiving stock." />
            ) : (
              <ReceiveForm items={items} locations={locations} />
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Recent receipts</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-muted-foreground text-sm">No receipts yet.</p>
            ) : (
              <ul className="divide-y">
                {recent.map((r) => (
                  <li key={r.id} className="hover:bg-accent/50 -mx-2 rounded-md px-2 py-2.5 transition-colors">
                    <p className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-mono font-medium">{r.receipt_number}</span>
                      <span className="text-muted-foreground text-xs">
                        {r.lines} line{r.lines === 1 ? "" : "s"}
                      </span>
                    </p>
                    <p className="truncate text-sm">
                      {r.supplier_name}
                      {r.supplier_reference && <span className="text-muted-foreground"> · {r.supplier_reference}</span>}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      <LocalTime iso={r.received_at} /> · {r.received_by}
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
