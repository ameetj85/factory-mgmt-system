import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, BoxesIcon, ClipboardListIcon, GaugeIcon, LayersIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ItemTypeBadge, QtyChange, StockStatusBadge, TxnTypeBadge } from "@/components/inventory/badges";
import { LocalTime } from "@/components/local-time";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/dal";
import { db } from "@/lib/db/client";
import { stockStatus, type ItemType } from "@/lib/inventory/constants";
import { ledgerEntries } from "@/lib/inventory/queries";
import { formatCents, formatQty } from "@/lib/quantity";

export const metadata: Metadata = { title: "Item" };

export default function ItemDetailPage(props: PageProps<"/inventory/items/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ItemDetailPageContent {...props} />
    </Suspense>
  );
}

async function ItemDetailPageContent({ params }: PageProps<"/inventory/items/[id]">) {
  await requirePermission("items.view");
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const item = await db.get<{
    id: number;
    sku: string;
    name: string;
    description: string | null;
    type: ItemType;
    uom: string;
    reorder_point_milli: number;
    standard_cost_cents: number | null;
    is_active: number;
  }>("SELECT id, sku, name, description, type, uom, reorder_point_milli, standard_cost_cents, is_active FROM items WHERE id = ?", [id]);
  if (!item) notFound();

  const [lots, history] = await Promise.all([
    db.all<{ location_code: string; location_name: string; batch_number: string; qty_milli: number; first_txn_at: string; last_txn_at: string }>(
      `SELECT l.code AS location_code, l.name AS location_name, s.batch_number, s.qty_milli, s.first_txn_at, s.last_txn_at
         FROM stock_levels s JOIN locations l ON l.id = s.location_id
        WHERE s.item_id = ? AND s.qty_milli <> 0
        ORDER BY s.first_txn_at, s.batch_number`,
      [id],
    ),
    ledgerEntries({ itemId: id }, 25, 0),
  ]);

  const onHand = lots.reduce((sum, l) => sum + l.qty_milli, 0);
  const locations = new Set(lots.map((l) => l.location_code)).size;
  const status = stockStatus(onHand, item.reorder_point_milli);

  return (
    <>
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-primary -ml-2">
          <Link href="/inventory/items">
            <ArrowLeftIcon /> Item master
          </Link>
        </Button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-2xl font-semibold tracking-tight">{item.sku}</h1>
              <ItemTypeBadge type={item.type} />
              <StockStatusBadge status={status} />
              {!item.is_active && <Badge variant="outline">Archived</Badge>}
            </div>
            <p className="text-lg">{item.name}</p>
            {item.description && <p className="text-muted-foreground max-w-2xl text-sm">{item.description}</p>}
          </div>
          <Button asChild variant="outline">
            <Link href={`/inventory/ledger?item=${item.id}`}>
              <ClipboardListIcon /> Full ledger
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="On hand" value={formatQty(onHand, item.uom)} icon={BoxesIcon} />
        <StatCard
          label="Reorder point"
          value={item.reorder_point_milli > 0 ? formatQty(item.reorder_point_milli, item.uom) : "—"}
          icon={GaugeIcon}
        />
        <StatCard label="Lots in stock" value={lots.filter((l) => l.qty_milli > 0).length} icon={LayersIcon} hint={`Across ${locations} location${locations === 1 ? "" : "s"}`} />
        <StatCard label="Standard cost" value={formatCents(item.standard_cost_cents)} icon={GaugeIcon} hint={`Per ${item.uom}`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Stock by location and lot</CardTitle>
          <CardDescription>Oldest lots first, so they can be used before newer ones.</CardDescription>
        </CardHeader>
        <CardContent>
          {lots.length === 0 ? (
            <EmptyState icon={BoxesIcon} title="No stock on hand" description="Receive stock or post an adjustment to add some." />
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader className="bg-muted/60">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">Lot</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="hidden pr-4 md:table-cell">First received</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lots.map((lot) => (
                    <TableRow key={`${lot.location_code}-${lot.batch_number}`} className="hover:bg-accent/40 transition-colors">
                      <TableCell className="pl-4">
                        <Link href={`/inventory/ledger?batch=${encodeURIComponent(lot.batch_number)}`} className="hover:text-primary font-mono text-sm transition-colors">
                          {lot.batch_number}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{lot.location_code}</span>
                        <span className="text-muted-foreground ml-2 text-xs">{lot.location_name}</span>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatQty(lot.qty_milli, item.uom)}</TableCell>
                      <TableCell className="text-muted-foreground hidden pr-4 text-sm md:table-cell">
                        <LocalTime iso={lot.first_txn_at} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent movements</CardTitle>
          <CardDescription>The latest 25 ledger entries for this item.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <EmptyState icon={ClipboardListIcon} title="No movements yet" />
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader className="bg-muted/60">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">When</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead className="hidden md:table-cell">Lot · Location</TableHead>
                    <TableHead className="hidden pr-4 lg:table-cell">Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((h) => (
                    <TableRow key={h.id} className="hover:bg-accent/40 transition-colors">
                      <TableCell className="text-muted-foreground pl-4 text-sm whitespace-nowrap">
                        <LocalTime iso={h.created_at} />
                      </TableCell>
                      <TableCell>
                        <TxnTypeBadge type={h.txn_type} />
                      </TableCell>
                      <TableCell className="text-right">
                        <QtyChange milli={h.qty_change_milli} uom={h.uom} />
                      </TableCell>
                      <TableCell className="hidden text-sm md:table-cell">
                        <span className="font-mono">{h.batch_number}</span>
                        <span className="text-muted-foreground"> · {h.location_code}</span>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden pr-4 text-sm lg:table-cell">
                        {h.reference_label ?? "—"}
                        {h.user_name && <span className="block text-xs">by {h.user_name}</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
