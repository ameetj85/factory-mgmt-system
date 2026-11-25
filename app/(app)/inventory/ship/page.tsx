import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { TruckIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LocalTime } from "@/components/local-time";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/dal";
import { db } from "@/lib/db/client";
import { activeItemOptions, availableLots } from "@/lib/inventory/queries";
import { ShipForm } from "./ship-form";

export const metadata: Metadata = { title: "Shipping" };

export default function ShipPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ShipPageContent />
    </Suspense>
  );
}

async function ShipPageContent() {
  await requirePermission("inventory.ship");
  const [items, lots, recent] = await Promise.all([
    activeItemOptions(),
    availableLots(),
    db.all<{ id: number; shipment_number: string; customer_name: string; order_reference: string | null; shipped_at: string; shipped_by: string }>(
      `SELECT s.id, s.shipment_number, s.customer_name, s.order_reference, s.shipped_at, u.full_name AS shipped_by
         FROM shipments s JOIN users u ON u.id = s.shipped_by
        ORDER BY s.id DESC LIMIT 8`,
    ),
  ]);
  const stockedItems = items.filter((i) => lots.some((l) => l.itemId === i.id));

  return (
    <>
      <PageHeader title="Shipping" description="Record outgoing deliveries. Shipping from specific lots keeps forward traceability to customers." />
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>New shipment</CardTitle>
            <CardDescription>Only items with stock on hand are listed. Oldest lots are shown first.</CardDescription>
          </CardHeader>
          <CardContent>
            {stockedItems.length === 0 ? (
              <EmptyState icon={TruckIcon} title="Nothing to ship" description="There's no stock on hand yet." />
            ) : (
              <ShipForm items={stockedItems} lots={lots} />
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Recent shipments</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-muted-foreground text-sm">No shipments yet.</p>
            ) : (
              <ul className="divide-y">
                {recent.map((s) => (
                  <li key={s.id} className="hover:bg-accent/50 -mx-2 rounded-md px-2 py-2.5 transition-colors">
                    <p className="font-mono text-sm font-medium">{s.shipment_number}</p>
                    <p className="truncate text-sm">
                      {s.customer_name}
                      {s.order_reference && <span className="text-muted-foreground"> · {s.order_reference}</span>}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      <LocalTime iso={s.shipped_at} /> · {s.shipped_by}
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
