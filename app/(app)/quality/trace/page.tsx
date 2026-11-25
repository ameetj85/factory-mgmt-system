import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowDownLeftIcon, ArrowUpRightIcon, ClipboardPenIcon, PrinterIcon, GitBranchIcon, SearchXIcon, UsersIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LocalTime } from "@/components/local-time";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { HoldBadge, ResultBadge } from "@/components/quality/badges";
import { TraceTree } from "@/components/quality/trace-tree";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { activeHold } from "@/lib/quality/service";
import { lotsMatching, traceBackward, traceForward, type AffectedShipment } from "@/lib/quality/trace";
import { formatQty } from "@/lib/quantity";
import { TraceSearch } from "./trace-search";

export const metadata: Metadata = { title: "Traceability" };

export default function TracePage(props: PageProps<"/quality/trace">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TraceContent {...props} />
    </Suspense>
  );
}

async function TraceContent({ searchParams }: PageProps<"/quality/trace">) {
  const user = await requirePermission("quality.view");
  const params = await searchParams;
  const itemId = typeof params.item === "string" && /^\d+$/.test(params.item) ? Number(params.item) : undefined;
  const lot = typeof params.lot === "string" ? params.lot.trim().toUpperCase() : "";
  const q = typeof params.q === "string" ? params.q.trim() : "";

  return (
    <>
      <PageHeader title="Traceability" description="Follow a lot back to its suppliers and forward to the products and customers it reached." />
      <TraceSearch q={q || lot} />
      {itemId && lot ? (
        <LotTrace itemId={itemId} lot={lot} canInspect={can(user.role, "quality.inspect")} />
      ) : q ? (
        <Matches q={q} />
      ) : (
        <EmptyState icon={GitBranchIcon} title="Search for a lot" description="Enter a lot number, such as a supplier lot or a work order number." />
      )}
    </>
  );
}

async function Matches({ q }: { q: string }) {
  const matches = await lotsMatching(q);
  if (matches.length === 0) return <EmptyState icon={SearchXIcon} title="No lots found" description={`Nothing matches "${q}".`} />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Matching lots</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {matches.map((m) => (
            <li key={`${m.item_id}|${m.batch_number}`}>
              <Link
                href={`/quality/trace?item=${m.item_id}&lot=${encodeURIComponent(m.batch_number)}`}
                className="hover:bg-accent/50 -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 transition-colors"
              >
                <span>
                  <span className="font-mono font-semibold">{m.batch_number}</span>{" "}
                  <span className="text-muted-foreground text-sm">
                    <span className="font-mono">{m.sku}</span> · {m.name}
                  </span>
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">{formatQty(m.on_hand)} on hand</span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

async function LotTrace({ itemId, lot, canInspect }: { itemId: number; lot: string; canInspect: boolean }) {
  const shipments: AffectedShipment[] = [];
  const [backward, forward, hold, inspections] = await Promise.all([
    traceBackward(itemId, lot),
    traceForward(itemId, lot, shipments),
    activeHold(itemId, lot),
    db.all<{ id: number; inspection_number: string; result: "PASS" | "FAIL"; created_at: string; template_name: string }>(
      "SELECT id, inspection_number, result, created_at, template_name FROM inspections WHERE item_id = ? AND batch_number = ? ORDER BY id DESC LIMIT 10",
      [itemId, lot],
    ),
  ]);
  if (!backward || !forward) return <EmptyState icon={SearchXIcon} title="Lot not found" />;
  if (backward.events.length === 0 && forward.events.length === 0) {
    return <EmptyState icon={SearchXIcon} title={`No movements for lot ${lot}`} description={`${backward.sku} has no ledger history under this lot number.`} />;
  }
  const customers = new Set(shipments.map((s) => s.customer)).size;

  return (
    <>
      <Card className="hover-lift">
        <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-2xl font-bold">{lot}</span>
              {hold && <HoldBadge />}
            </div>
            <p>
              <Link href={`/inventory/items/${itemId}`} className="hover:text-primary font-mono transition-colors">
                {backward.sku}
              </Link>{" "}
              · {backward.name} · <span className="tabular-nums">{formatQty(backward.onHandMilli, backward.uom)} on hand</span>
            </p>
            {hold && <p className="text-destructive text-sm">Held: {hold.reason}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/inventory/ledger?item=${itemId}&batch=${encodeURIComponent(lot)}`}>Ledger entries</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/print/labels?item=${itemId}&lot=${encodeURIComponent(lot)}`} target="_blank">
                <PrinterIcon /> Labels
              </Link>
            </Button>
            {canInspect && (
              <Button asChild>
                <Link href={`/quality/inspect?item=${itemId}&lot=${encodeURIComponent(lot)}`}>
                  <ClipboardPenIcon /> Inspect this lot
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowDownLeftIcon className="text-primary size-4" /> Where it came from
            </CardTitle>
            <CardDescription>Receipts and work orders that created this lot, down to the supplier lots.</CardDescription>
          </CardHeader>
          <CardContent>
            <TraceTree root={backward} empty="No receipts or production found for this lot." />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowUpRightIcon className="text-primary size-4" /> Where it went
            </CardTitle>
            <CardDescription>Work orders that used this lot, what they made, and where that was shipped.</CardDescription>
          </CardHeader>
          <CardContent>
            <TraceTree root={forward} empty="This lot hasn't been used or shipped yet." />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UsersIcon className="text-primary size-4" /> Customers affected
            </CardTitle>
            <CardDescription>
              {shipments.length
                ? `${shipments.length} shipment${shipments.length === 1 ? "" : "s"} to ${customers} customer${customers === 1 ? "" : "s"} contain this lot or products made from it.`
                : "Nothing containing this lot has been shipped."}
            </CardDescription>
          </CardHeader>
          {shipments.length > 0 && (
            <CardContent>
              <div className="overflow-hidden rounded-xl border">
                <Table>
                  <TableHeader className="bg-muted/60">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-4">Customer</TableHead>
                      <TableHead>Shipment</TableHead>
                      <TableHead>Lot shipped</TableHead>
                      <TableHead className="pr-4 text-right">Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shipments.map((s, i) => (
                      <TableRow key={i} className="hover:bg-accent/40 transition-colors">
                        <TableCell className="pl-4 font-medium">{s.customer}</TableCell>
                        <TableCell className="text-sm">
                          <span className="font-mono">{s.shipmentNumber}</span>
                          <span className="text-muted-foreground block text-xs">
                            {s.orderReference && <>{s.orderReference} · </>}
                            <LocalTime iso={s.shippedAt} />
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="font-mono">{s.batchNumber}</span> <span className="text-muted-foreground">{s.sku}</span>
                        </TableCell>
                        <TableCell className="pr-4 text-right tabular-nums">{formatQty(s.qtyMilli, s.uom)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          )}
        </Card>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Inspections</CardTitle>
          </CardHeader>
          <CardContent>
            {inspections.length === 0 ? (
              <p className="text-muted-foreground text-sm">This lot hasn&apos;t been inspected.</p>
            ) : (
              <ul className="divide-y">
                {inspections.map((x) => (
                  <li key={x.id}>
                    <Link href={`/quality/inspections/${x.id}`} className="hover:bg-accent/50 -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 text-sm transition-colors">
                      <span>
                        <span className="font-mono font-medium">{x.inspection_number}</span>
                        <span className="text-muted-foreground block text-xs">
                          {x.template_name} · <LocalTime iso={x.created_at} />
                        </span>
                      </span>
                      <ResultBadge result={x.result} />
                    </Link>
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
