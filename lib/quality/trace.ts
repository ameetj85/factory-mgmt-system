import "server-only";
import { db } from "@/lib/db/client";

// Lot genealogy. A lot is (item, batch number). Production output is received under the work order
// number, and every backflushed material is a MATERIAL_CONSUMPTION row referencing that work order,
// so the ledger alone links finished lots to the lots they were made from.

export interface TraceLot {
  key: string;
  itemId: number;
  sku: string;
  name: string;
  uom: string;
  batchNumber: string;
  onHold: boolean;
  onHandMilli: number;
  events: TraceEvent[];
  /** True when this lot already appears higher in the tree (shown, not expanded again). */
  repeated?: boolean;
  /** How much of this lot the parent work order consumed (backward trace only). */
  usedMilli?: number;
}

export type TraceEventKind = "RECEIPT" | "PRODUCED_BY" | "ADJUSTMENT" | "CONSUMED_BY" | "SHIPPED";

export interface TraceEvent {
  kind: TraceEventKind;
  label: string;
  detail: string | null;
  date: string;
  qtyMilli: number;
  href: string | null;
  lots: TraceLot[];
}

export interface AffectedShipment {
  shipmentNumber: string;
  customer: string;
  orderReference: string | null;
  shippedAt: string;
  sku: string;
  batchNumber: string;
  qtyMilli: number;
  uom: string;
}

const MAX_DEPTH = 10;
const lotKey = (itemId: number, batch: string) => `${itemId}|${batch}`;

async function lotHeader(itemId: number, batchNumber: string): Promise<Omit<TraceLot, "events" | "key"> | null> {
  const row = await db.get<{ sku: string; name: string; uom: string; on_hold: number; on_hand: number | null }>(
    `SELECT i.sku, i.name, i.uom,
            EXISTS (SELECT 1 FROM lot_holds h WHERE h.item_id = i.id AND h.batch_number = ? AND h.status = 'ACTIVE') AS on_hold,
            (SELECT SUM(qty_change_milli) FROM inventory_txns t WHERE t.item_id = i.id AND t.batch_number = ?) AS on_hand
       FROM items i WHERE i.id = ?`,
    [batchNumber, batchNumber, itemId],
  );
  if (!row) return null;
  return { itemId, sku: row.sku, name: row.name, uom: row.uom, batchNumber, onHold: row.on_hold === 1, onHandMilli: row.on_hand ?? 0 };
}

/** Where a lot came from: supplier receipts, adjustments, and the work orders (with their consumed lots) that made it. */
export async function traceBackward(itemId: number, batchNumber: string, depth = 0, seen = new Set<string>()): Promise<TraceLot | null> {
  const header = await lotHeader(itemId, batchNumber);
  if (!header) return null;
  const key = lotKey(itemId, batchNumber);
  if (seen.has(key) || depth > MAX_DEPTH) return { ...header, key, events: [], repeated: true };
  const path = new Set(seen).add(key);

  const origins = await db.all<{ txn_type: string; reference_id: number | null; qty: number; first_at: string }>(
    `SELECT txn_type, reference_id, SUM(qty_change_milli) AS qty, MIN(created_at) AS first_at
       FROM inventory_txns
      WHERE item_id = ? AND batch_number = ? AND qty_change_milli > 0 AND txn_type IN ('RECEIPT', 'PRODUCTION_OUTPUT', 'ADJUSTMENT')
      GROUP BY txn_type, reference_id ORDER BY first_at`,
    [itemId, batchNumber],
  );

  const events: TraceEvent[] = [];
  for (const o of origins) {
    if (o.txn_type === "RECEIPT" && o.reference_id) {
      const r = await db.get<{ receipt_number: string; supplier_name: string; supplier_reference: string | null; received_at: string }>(
        "SELECT receipt_number, supplier_name, supplier_reference, received_at FROM receipts WHERE id = ?",
        [o.reference_id],
      );
      events.push({
        kind: "RECEIPT",
        label: `Received from ${r?.supplier_name ?? "supplier"}`,
        detail: [r?.receipt_number, r?.supplier_reference].filter(Boolean).join(" · ") || null,
        date: r?.received_at ?? o.first_at,
        qtyMilli: o.qty,
        href: null,
        lots: [],
      });
    } else if (o.txn_type === "PRODUCTION_OUTPUT" && o.reference_id) {
      const wo = await db.get<{ wo_number: string }>("SELECT wo_number FROM work_orders WHERE id = ?", [o.reference_id]);
      const consumed = await db.all<{ item_id: number; batch_number: string }>(
        `SELECT item_id, batch_number FROM inventory_txns
          WHERE reference_type = 'work_order' AND reference_id = ? AND txn_type = 'MATERIAL_CONSUMPTION'
          GROUP BY item_id, batch_number ORDER BY MIN(id)`,
        [o.reference_id],
      );
      const lots: TraceLot[] = [];
      for (const c of consumed) {
        const child = await traceBackward(c.item_id, c.batch_number, depth + 1, path);
        if (child) {
          const used = await db.get<{ qty: number }>(
            `SELECT -SUM(qty_change_milli) AS qty FROM inventory_txns
              WHERE reference_type = 'work_order' AND reference_id = ? AND txn_type = 'MATERIAL_CONSUMPTION' AND item_id = ? AND batch_number = ?`,
            [o.reference_id, c.item_id, c.batch_number],
          );
          lots.push({ ...child, key: `${child.key}@wo${o.reference_id}`, usedMilli: used?.qty ?? 0 });
        }
      }
      events.push({
        kind: "PRODUCED_BY",
        label: `Produced by ${wo?.wo_number ?? "work order"}`,
        detail: lots.length ? `from ${lots.length} material lot${lots.length === 1 ? "" : "s"}` : "no materials recorded",
        date: o.first_at,
        qtyMilli: o.qty,
        href: `/production/work-orders/${o.reference_id}`,
        lots,
      });
    } else {
      events.push({ kind: "ADJUSTMENT", label: "Added by stock adjustment", detail: null, date: o.first_at, qtyMilli: o.qty, href: null, lots: [] });
    }
  }
  return { ...header, key, events };
}

/** Where a lot went: work orders that consumed it (and the lots they produced), and customer shipments. */
export async function traceForward(
  itemId: number,
  batchNumber: string,
  shipments: AffectedShipment[] = [],
  depth = 0,
  seen = new Set<string>(),
): Promise<TraceLot | null> {
  const header = await lotHeader(itemId, batchNumber);
  if (!header) return null;
  const key = lotKey(itemId, batchNumber);
  if (seen.has(key) || depth > MAX_DEPTH) return { ...header, key, events: [], repeated: true };
  const path = new Set(seen).add(key);

  const uses = await db.all<{ txn_type: string; reference_id: number; qty: number; first_at: string }>(
    `SELECT txn_type, reference_id, -SUM(qty_change_milli) AS qty, MIN(created_at) AS first_at
       FROM inventory_txns
      WHERE item_id = ? AND batch_number = ? AND txn_type IN ('MATERIAL_CONSUMPTION', 'SHIPMENT') AND reference_id IS NOT NULL
      GROUP BY txn_type, reference_id ORDER BY first_at`,
    [itemId, batchNumber],
  );

  const events: TraceEvent[] = [];
  for (const u of uses) {
    if (u.txn_type === "SHIPMENT") {
      const s = await db.get<{ shipment_number: string; customer_name: string; order_reference: string | null; shipped_at: string }>(
        "SELECT shipment_number, customer_name, order_reference, shipped_at FROM shipments WHERE id = ?",
        [u.reference_id],
      );
      shipments.push({
        shipmentNumber: s?.shipment_number ?? "",
        customer: s?.customer_name ?? "",
        orderReference: s?.order_reference ?? null,
        shippedAt: s?.shipped_at ?? u.first_at,
        sku: header.sku,
        batchNumber,
        qtyMilli: u.qty,
        uom: header.uom,
      });
      events.push({
        kind: "SHIPPED",
        label: `Shipped to ${s?.customer_name ?? "customer"}`,
        detail: [s?.shipment_number, s?.order_reference].filter(Boolean).join(" · ") || null,
        date: s?.shipped_at ?? u.first_at,
        qtyMilli: u.qty,
        href: null,
        lots: [],
      });
    } else {
      const wo = await db.get<{ wo_number: string }>("SELECT wo_number FROM work_orders WHERE id = ?", [u.reference_id]);
      const outputs = await db.all<{ item_id: number; batch_number: string }>(
        `SELECT item_id, batch_number FROM inventory_txns
          WHERE reference_type = 'work_order' AND reference_id = ? AND txn_type = 'PRODUCTION_OUTPUT'
          GROUP BY item_id, batch_number`,
        [u.reference_id],
      );
      const lots: TraceLot[] = [];
      for (const out of outputs) {
        const child = await traceForward(out.item_id, out.batch_number, shipments, depth + 1, path);
        if (child) lots.push({ ...child, key: `${child.key}@wo${u.reference_id}` });
      }
      events.push({
        kind: "CONSUMED_BY",
        label: `Used in ${wo?.wo_number ?? "work order"}`,
        detail: lots.length ? `made ${lots.map((l) => l.sku).join(", ")}` : "no output yet",
        date: u.first_at,
        qtyMilli: u.qty,
        href: `/production/work-orders/${u.reference_id}`,
        lots,
      });
    }
  }
  return { ...header, key, events };
}

/** Items that have a lot with this number, for disambiguating a lot search. */
export async function lotsMatching(batchQuery: string) {
  return db.all<{ item_id: number; sku: string; name: string; batch_number: string; on_hand: number }>(
    `SELECT t.item_id, i.sku, i.name, t.batch_number, SUM(t.qty_change_milli) AS on_hand
       FROM inventory_txns t JOIN items i ON i.id = t.item_id
      WHERE t.batch_number LIKE ?
      GROUP BY t.item_id, t.batch_number
      ORDER BY t.batch_number = ? DESC, MAX(t.id) DESC
      LIMIT 25`,
    [`%${batchQuery.toUpperCase()}%`, batchQuery.toUpperCase()],
  );
}
