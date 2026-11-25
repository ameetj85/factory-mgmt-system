import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import Link from "next/link";
import { AlertTriangleIcon, BoxesIcon, ClipboardCheckIcon, PackagePlusIcon, PackageXIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ItemTypeBadge, StockStatusBadge } from "@/components/inventory/badges";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { ITEM_TYPES, stockStatus, type ItemType } from "@/lib/inventory/constants";
import { inventorySummary, stockByItem } from "@/lib/inventory/queries";
import { formatQty } from "@/lib/quantity";
import { cn } from "@/lib/utils";
import { StockFilters } from "./stock-filters";

export const metadata: Metadata = { title: "Stock" };

export default function StockPage(props: PageProps<"/inventory">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StockPageContent {...props} />
    </Suspense>
  );
}

async function StockPageContent({ searchParams }: PageProps<"/inventory">) {
  const user = await requirePermission("inventory.view");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const type = ITEM_TYPES.includes(params.type as ItemType) ? (params.type as ItemType) : undefined;
  const lowOnly = params.low === "1";

  const [summary, rows] = await Promise.all([inventorySummary(), stockByItem({ q, type, lowOnly })]);

  return (
    <>
      <PageHeader title="Stock" description="Stock on hand across all locations, calculated from the stock ledger.">
        {can(user.role, "inventory.receive") && (
          <Button asChild className="shadow-md shadow-primary/25">
            <Link href="/inventory/receive">
              <PackagePlusIcon /> Receive stock
            </Link>
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active items" value={summary?.active_items ?? 0} icon={BoxesIcon} hint="In the item master" />
        <StatCard
          label="Low stock"
          value={summary?.low_stock ?? 0}
          icon={AlertTriangleIcon}
          hint="Below reorder point"
          className={summary?.low_stock ? "ring-warning/40 ring-1" : undefined}
        />
        <StatCard
          label="Out of stock"
          value={summary?.out_of_stock ?? 0}
          icon={PackageXIcon}
          hint="Nothing on hand"
          className={summary?.out_of_stock ? "ring-destructive/30 ring-1" : undefined}
        />
        <StatCard label="Pending adjustments" value={summary?.pending_adjustments ?? 0} icon={ClipboardCheckIcon} hint="Awaiting approval" />
      </div>

      <Card>
        <CardContent className="space-y-4">
          <StockFilters q={q} type={type} lowOnly={lowOnly} />
          {rows.length === 0 ? (
            <EmptyState
              icon={BoxesIcon}
              title={q || type || lowOnly ? "Nothing matches these filters" : "No items yet"}
              description={
                q || type || lowOnly
                  ? "Try a different search or clear the filters."
                  : "Add items to the item master, then receive stock against them."
              }
            >
              {!q && !type && !lowOnly && can(user.role, "items.manage") && (
                <Button asChild>
                  <Link href="/inventory/items">Go to item master</Link>
                </Button>
              )}
            </EmptyState>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader className="bg-muted/60">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">Item</TableHead>
                    <TableHead className="hidden md:table-cell">Type</TableHead>
                    <TableHead className="text-right">On hand</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Reorder point</TableHead>
                    <TableHead className="hidden text-right lg:table-cell">Lots</TableHead>
                    <TableHead className="pr-4">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const status = stockStatus(row.on_hand_milli, row.reorder_point_milli);
                    return (
                      <TableRow
                        key={row.id}
                        className={cn(
                          "group hover:bg-accent/40 transition-colors",
                          status === "out" && "bg-destructive/[0.03]",
                          status === "low" && "bg-warning/[0.04]",
                        )}
                      >
                        <TableCell className="pl-4">
                          <Link href={`/inventory/items/${row.id}`} className="block">
                            <span className="group-hover:text-primary font-mono text-sm font-medium transition-colors">{row.sku}</span>
                            <span className="text-muted-foreground block truncate text-xs">{row.name}</span>
                          </Link>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <ItemTypeBadge type={row.type} />
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{formatQty(row.on_hand_milli, row.uom)}</TableCell>
                        <TableCell className="text-muted-foreground hidden text-right tabular-nums sm:table-cell">
                          {row.reorder_point_milli > 0 ? formatQty(row.reorder_point_milli, row.uom) : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden text-right tabular-nums lg:table-cell">{row.batch_count}</TableCell>
                        <TableCell className="pr-4">
                          <StockStatusBadge status={status} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
