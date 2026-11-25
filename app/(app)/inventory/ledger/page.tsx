import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import Link from "next/link";
import { ClipboardListIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { QtyChange, TxnTypeBadge } from "@/components/inventory/badges";
import { LocalTime } from "@/components/local-time";
import { PageHeader } from "@/components/page-header";
import { Pager } from "@/components/pager";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/dal";
import { TXN_TYPES, type TxnType } from "@/lib/inventory/constants";
import { activeItemOptions, activeLocationOptions, ledgerCount, ledgerEntries, type LedgerFilters } from "@/lib/inventory/queries";
import { LedgerFilterBar } from "./ledger-filters";

export const metadata: Metadata = { title: "Stock ledger" };

const PAGE_SIZE = 50;

function positiveInt(value: unknown): number | undefined {
  return typeof value === "string" && /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : undefined;
}

export default function LedgerPage(props: PageProps<"/inventory/ledger">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LedgerPageContent {...props} />
    </Suspense>
  );
}

async function LedgerPageContent({ searchParams }: PageProps<"/inventory/ledger">) {
  await requirePermission("inventory.view");
  const params = await searchParams;
  const filters: LedgerFilters = {
    itemId: positiveInt(params.item),
    locationId: positiveInt(params.location),
    txnType: TXN_TYPES.includes(params.type as TxnType) ? (params.type as TxnType) : undefined,
    batch: typeof params.batch === "string" && params.batch.trim() ? params.batch.trim() : undefined,
  };
  const page = positiveInt(params.page) ?? 1;

  const [entries, total, items, locations] = await Promise.all([
    ledgerEntries(filters, PAGE_SIZE + 1, (page - 1) * PAGE_SIZE),
    ledgerCount(filters),
    activeItemOptions(),
    activeLocationOptions(),
  ]);
  const rows = entries.slice(0, PAGE_SIZE);

  const hrefFor = (p: number) => {
    const search = new URLSearchParams();
    for (const key of ["item", "location", "type", "batch"] as const) {
      const value = params[key];
      if (typeof value === "string" && value) search.set(key, value);
    }
    if (p > 1) search.set("page", String(p));
    return search.size ? `?${search}` : "?";
  };

  return (
    <>
      <PageHeader
        title="Stock ledger"
        description="Every inventory movement, newest first. Entries are permanent; corrections are posted as new adjustments."
      />
      <Card>
        <CardContent className="space-y-4">
          <LedgerFilterBar
            items={items}
            locations={locations}
            itemId={filters.itemId}
            locationId={filters.locationId}
            txnType={filters.txnType}
            batch={filters.batch}
          />
          {rows.length === 0 ? (
            <EmptyState icon={ClipboardListIcon} title="No ledger entries" description="Nothing matches these filters yet." />
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader className="bg-muted/60">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">When</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead className="hidden md:table-cell">Lot · Location</TableHead>
                    <TableHead className="hidden pr-4 lg:table-cell">Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id} className="group hover:bg-accent/40 transition-colors">
                      <TableCell className="text-muted-foreground pl-4 text-sm whitespace-nowrap">
                        <LocalTime iso={r.created_at} />
                      </TableCell>
                      <TableCell>
                        <Link href={`/inventory/items/${r.item_id}`} className="hover:text-primary font-mono text-sm font-medium transition-colors">
                          {r.sku}
                        </Link>
                        <p className="text-muted-foreground max-w-48 truncate text-xs">{r.item_name}</p>
                      </TableCell>
                      <TableCell>
                        <TxnTypeBadge type={r.txn_type} />
                      </TableCell>
                      <TableCell className="text-right">
                        <QtyChange milli={r.qty_change_milli} uom={r.uom} />
                      </TableCell>
                      <TableCell className="hidden text-sm md:table-cell">
                        <span className="font-mono">{r.batch_number}</span>
                        <span className="text-muted-foreground"> · {r.location_code}</span>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden pr-4 text-sm lg:table-cell">
                        {r.reference_label ?? "—"}
                        {r.user_name && <span className="block text-xs">by {r.user_name}</span>}
                        {r.notes && <span className="block max-w-56 truncate text-xs italic">{r.notes}</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <Pager page={page} hasNext={entries.length > PAGE_SIZE} total={total} noun={["entry", "entries"]} hrefFor={hrefFor} />
        </CardContent>
      </Card>
    </>
  );
}
