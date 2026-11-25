import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/dal";
import { db } from "@/lib/db/client";
import { LocationDialog } from "./location-dialog";
import { LocationsTable, type LocationRow } from "./locations-table";

export const metadata: Metadata = { title: "Locations" };

export default function LocationsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LocationsPageContent />
    </Suspense>
  );
}

async function LocationsPageContent() {
  await requirePermission("locations.manage");
  const locations = await db.all<LocationRow>(
    `SELECT l.id, l.code, l.name, l.description, l.is_active = 1 AS isActive,
            COUNT(DISTINCT CASE WHEN s.qty_milli > 0 THEN s.item_id END) AS itemCount,
            COUNT(CASE WHEN s.qty_milli > 0 THEN 1 END) AS lotCount
       FROM locations l
       LEFT JOIN stock_levels s ON s.location_id = l.id
      GROUP BY l.id
      ORDER BY l.is_active DESC, l.code COLLATE NOCASE`,
  );

  return (
    <>
      <PageHeader title="Locations" description="Warehouses, store rooms, racks and bins where stock is kept.">
        <LocationDialog />
      </PageHeader>
      <Card>
        <CardContent>
          <LocationsTable locations={locations.map((l) => ({ ...l, isActive: Boolean(l.isActive) }))} />
        </CardContent>
      </Card>
    </>
  );
}
