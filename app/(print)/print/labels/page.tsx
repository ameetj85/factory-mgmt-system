import type { Metadata } from "next";
import { Suspense } from "react";
import { Barcode } from "@/components/print/barcode";
import { requirePermission } from "@/lib/auth/dal";
import { db } from "@/lib/db/client";
import { formatQty } from "@/lib/quantity";

export const metadata: Metadata = { title: "Lot labels" };

/** Lot labels on a 2-column sheet: lot barcode, item, quantity and hold status. ?item=&lot=&copies= */
export default function LabelsPage(props: PageProps<"/print/labels">) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Preparing document…</p>}>
      <LabelsPageContent {...props} />
    </Suspense>
  );
}

async function LabelsPageContent({ searchParams }: PageProps<"/print/labels">) {
  await requirePermission("inventory.view");
  const params = await searchParams;
  const itemId = typeof params.item === "string" && /^\d+$/.test(params.item) ? Number(params.item) : 0;
  const lot = typeof params.lot === "string" ? params.lot.toUpperCase() : "";
  const copies = Math.min(40, Math.max(1, Number(params.copies) || 4));

  const row = await db.get<{ sku: string; name: string; uom: string; qty: number | null; first_at: string | null; held: number }>(
    `SELECT i.sku, i.name, i.uom,
            (SELECT SUM(qty_change_milli) FROM inventory_txns t WHERE t.item_id = i.id AND t.batch_number = ?) AS qty,
            (SELECT MIN(created_at) FROM inventory_txns t WHERE t.item_id = i.id AND t.batch_number = ?) AS first_at,
            EXISTS (SELECT 1 FROM lot_holds h WHERE h.item_id = i.id AND h.batch_number = ? AND h.status = 'ACTIVE') AS held
       FROM items i WHERE i.id = ?`,
    [lot, lot, lot, itemId],
  );
  const firstAt = row?.first_at;
  if (!row || !lot || !firstAt) {
    return <p className="text-sm text-zinc-600">Lot not found. Open labels from an item&apos;s lot list or a trace page.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-4 print:gap-[6mm]">
      {Array.from({ length: copies }, (_, i) => (
        <div key={i} className="flex break-inside-avoid flex-col gap-2 rounded border border-zinc-400 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-lg leading-tight font-bold">{row.sku}</p>
              <p className="truncate text-xs text-zinc-600">{row.name}</p>
            </div>
            {row.held ? <span className="rounded border-2 border-black px-1.5 text-xs font-bold">QC HOLD</span> : null}
          </div>
          <Barcode value={lot} height={48} moduleWidth={1.4} />
          <div className="flex justify-between text-xs">
            <span>
              Lot <span className="font-mono font-semibold">{lot}</span>
            </span>
            <span>Received {firstAt.slice(0, 10)}</span>
          </div>
          <p className="text-xs">
            Qty: <span className="font-semibold">{formatQty(Math.max(0, row.qty ?? 0), row.uom)}</span> <span className="text-zinc-500">(at print)</span>
          </p>
        </div>
      ))}
    </div>
  );
}
