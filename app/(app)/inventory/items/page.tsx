import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { db, type SqlValue } from "@/lib/db/client";
import { ITEM_TYPES, type ItemType } from "@/lib/inventory/constants";
import { ItemDialog } from "./item-dialog";
import { ItemFilters } from "./item-filters";
import { ItemsTable, type ItemRow } from "./items-table";

export const metadata: Metadata = { title: "Item master" };

export default function ItemsPage(props: PageProps<"/inventory/items">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ItemsPageContent {...props} />
    </Suspense>
  );
}

async function ItemsPageContent({ searchParams }: PageProps<"/inventory/items">) {
  const user = await requirePermission("items.view");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const type = ITEM_TYPES.includes(params.type as ItemType) ? (params.type as ItemType) : undefined;
  const showArchived = params.archived === "1";

  const where: string[] = [];
  const args: SqlValue[] = [];
  if (!showArchived) where.push("i.is_active = 1");
  if (q) {
    where.push("(i.sku LIKE ? OR i.name LIKE ? OR i.description LIKE ?)");
    args.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (type) {
    where.push("i.type = ?");
    args.push(type);
  }

  const rows = await db.all<{
    id: number;
    sku: string;
    name: string;
    description: string | null;
    type: ItemType;
    uom: string;
    reorder_point_milli: number;
    standard_cost_cents: number | null;
    is_active: number;
    has_txns: number;
  }>(
    `SELECT i.id, i.sku, i.name, i.description, i.type, i.uom, i.reorder_point_milli, i.standard_cost_cents, i.is_active,
            EXISTS (SELECT 1 FROM inventory_txns t WHERE t.item_id = i.id) AS has_txns
       FROM items i
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY i.is_active DESC, i.sku COLLATE NOCASE`,
    args,
  );

  const items: ItemRow[] = rows.map((r) => ({
    id: r.id,
    sku: r.sku,
    name: r.name,
    description: r.description,
    type: r.type,
    uom: r.uom,
    reorderPointMilli: r.reorder_point_milli,
    standardCostCents: r.standard_cost_cents,
    isActive: r.is_active === 1,
    hasTransactions: r.has_txns === 1,
  }));
  const canManage = can(user.role, "items.manage");

  return (
    <>
      <PageHeader title="Item master" description="Raw materials, sub-assemblies and finished goods with their SKUs and reorder points.">
        {canManage && <ItemDialog />}
      </PageHeader>
      <Card>
        <CardContent className="space-y-4">
          <ItemFilters q={q} type={type} showArchived={showArchived} />
          <ItemsTable items={items} canManage={canManage} filtered={Boolean(q || type)} />
        </CardContent>
      </Card>
    </>
  );
}
