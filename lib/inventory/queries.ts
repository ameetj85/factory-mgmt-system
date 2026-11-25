import "server-only";
import { db, type SqlValue } from "@/lib/db/client";
import type { ItemType, TxnType } from "./constants";

export interface ItemOption {
  id: number;
  sku: string;
  name: string;
  uom: string;
  type: ItemType;
}

export interface LocationOption {
  id: number;
  code: string;
  name: string;
}

/** A batch at a location with stock on hand — what can be shipped, moved or written down. */
export interface StockLot {
  itemId: number;
  locationId: number;
  locationCode: string;
  batchNumber: string;
  qtyMilli: number;
  onHold: boolean;
}

export async function activeItemOptions(types?: ItemType[]): Promise<ItemOption[]> {
  const filter = types?.length ? `AND type IN (${types.map(() => "?").join(", ")})` : "";
  return db.all<ItemOption>(
    `SELECT id, sku, name, uom, type FROM items WHERE is_active = 1 ${filter} ORDER BY sku COLLATE NOCASE`,
    types ?? [],
  );
}

export async function activeLocationOptions(): Promise<LocationOption[]> {
  return db.all<LocationOption>("SELECT id, code, name FROM locations WHERE is_active = 1 ORDER BY code COLLATE NOCASE");
}

export async function availableLots(itemId?: number): Promise<StockLot[]> {
  const rows = await db.all<Omit<StockLot, "onHold"> & { onHold: number }>(
    `SELECT s.item_id AS itemId, s.location_id AS locationId, l.code AS locationCode,
            s.batch_number AS batchNumber, s.qty_milli AS qtyMilli,
            EXISTS (SELECT 1 FROM lot_holds h WHERE h.item_id = s.item_id AND h.batch_number = s.batch_number AND h.status = 'ACTIVE') AS onHold
       FROM stock_levels s
       JOIN locations l ON l.id = s.location_id
       JOIN items i ON i.id = s.item_id
      WHERE s.qty_milli > 0 AND i.is_active = 1 ${itemId ? "AND s.item_id = ?" : ""}
      ORDER BY s.first_txn_at, s.batch_number`,
    itemId ? [itemId] : [],
  );
  return rows.map((r) => ({ ...r, onHold: Boolean(r.onHold) }));
}

export interface StockRow {
  id: number;
  sku: string;
  name: string;
  type: ItemType;
  uom: string;
  reorder_point_milli: number;
  on_hand_milli: number;
  batch_count: number;
  is_active: number;
}

export async function stockByItem(filters: {
  q?: string;
  type?: ItemType;
  lowOnly?: boolean;
  includeInactive?: boolean;
}): Promise<StockRow[]> {
  const where: string[] = [];
  const args: SqlValue[] = [];
  if (!filters.includeInactive) where.push("i.is_active = 1");
  if (filters.q) {
    where.push("(i.sku LIKE ? OR i.name LIKE ?)");
    args.push(`%${filters.q}%`, `%${filters.q}%`);
  }
  if (filters.type) {
    where.push("i.type = ?");
    args.push(filters.type);
  }
  const having = filters.lowOnly ? "HAVING on_hand_milli < i.reorder_point_milli OR on_hand_milli <= 0" : "";

  return db.all<StockRow>(
    `SELECT i.id, i.sku, i.name, i.type, i.uom, i.reorder_point_milli, i.is_active,
            COALESCE(SUM(s.qty_milli), 0) AS on_hand_milli,
            COUNT(CASE WHEN s.qty_milli > 0 THEN 1 END) AS batch_count
       FROM items i
       LEFT JOIN stock_levels s ON s.item_id = i.id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      GROUP BY i.id
      ${having}
      ORDER BY i.sku COLLATE NOCASE`,
    args,
  );
}

export interface LowStockRow {
  id: number;
  sku: string;
  name: string;
  uom: string;
  reorder_point_milli: number;
  on_hand_milli: number;
}

/** Active items whose total stock is below their reorder point, most critical first. */
export async function lowStockItems(limit = 10): Promise<LowStockRow[]> {
  return db.all<LowStockRow>(
    `SELECT i.id, i.sku, i.name, i.uom, i.reorder_point_milli, COALESCE(SUM(s.qty_milli), 0) AS on_hand_milli
       FROM items i
       LEFT JOIN stock_levels s ON s.item_id = i.id
      WHERE i.is_active = 1 AND i.reorder_point_milli > 0
      GROUP BY i.id
     HAVING on_hand_milli < i.reorder_point_milli
      ORDER BY CAST(on_hand_milli AS REAL) / i.reorder_point_milli, i.sku
      LIMIT ?`,
    [limit],
  );
}

export async function inventorySummary() {
  return db.get<{ active_items: number; low_stock: number; out_of_stock: number; pending_adjustments: number }>(
    `WITH totals AS (
       SELECT i.id, i.reorder_point_milli, COALESCE(SUM(s.qty_milli), 0) AS on_hand
         FROM items i LEFT JOIN stock_levels s ON s.item_id = i.id
        WHERE i.is_active = 1
        GROUP BY i.id
     )
     SELECT
       (SELECT COUNT(*) FROM totals) AS active_items,
       (SELECT COUNT(*) FROM totals WHERE on_hand > 0 AND on_hand < reorder_point_milli) AS low_stock,
       (SELECT COUNT(*) FROM totals WHERE on_hand <= 0) AS out_of_stock,
       (SELECT COUNT(*) FROM adjustment_requests WHERE status = 'pending') AS pending_adjustments`,
  );
}

export interface LedgerRow {
  id: number;
  created_at: string;
  txn_type: TxnType;
  qty_change_milli: number;
  batch_number: string;
  reference_type: string | null;
  reference_id: number | null;
  notes: string | null;
  item_id: number;
  sku: string;
  item_name: string;
  uom: string;
  location_code: string;
  user_name: string | null;
  reference_label: string | null;
}

export interface LedgerFilters {
  itemId?: number;
  txnType?: TxnType;
  batch?: string;
  locationId?: number;
}

export async function ledgerEntries(filters: LedgerFilters, limit: number, offset: number): Promise<LedgerRow[]> {
  const { whereSql, args } = ledgerWhere(filters);
  return db.all<LedgerRow>(
    `SELECT t.id, t.created_at, t.txn_type, t.qty_change_milli, t.batch_number, t.reference_type, t.reference_id,
            t.notes, t.item_id, i.sku, i.name AS item_name, i.uom, l.code AS location_code, u.full_name AS user_name,
            CASE t.reference_type
              WHEN 'receipt' THEN (SELECT receipt_number || ' · ' || supplier_name FROM receipts WHERE id = t.reference_id)
              WHEN 'shipment' THEN (SELECT shipment_number || ' · ' || customer_name FROM shipments WHERE id = t.reference_id)
              WHEN 'adjustment' THEN 'Adjustment #' || t.reference_id
              WHEN 'transfer' THEN 'Transfer #' || t.reference_id
              WHEN 'work_order' THEN (SELECT wo_number FROM work_orders WHERE id = t.reference_id)
              WHEN 'lot_hold' THEN 'Quality hold #' || t.reference_id
              ELSE NULL
            END AS reference_label
       FROM inventory_txns t
       JOIN items i ON i.id = t.item_id
       JOIN locations l ON l.id = t.location_id
       LEFT JOIN users u ON u.id = t.created_by
      ${whereSql}
      ORDER BY t.id DESC
      LIMIT ? OFFSET ?`,
    [...args, limit, offset],
  );
}

export async function ledgerCount(filters: LedgerFilters): Promise<number> {
  const { whereSql, args } = ledgerWhere(filters);
  const row = await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM inventory_txns t ${whereSql}`, args);
  return row?.n ?? 0;
}

function ledgerWhere(filters: LedgerFilters) {
  const where: string[] = [];
  const args: SqlValue[] = [];
  if (filters.itemId) {
    where.push("t.item_id = ?");
    args.push(filters.itemId);
  }
  if (filters.txnType) {
    where.push("t.txn_type = ?");
    args.push(filters.txnType);
  }
  if (filters.batch) {
    where.push("t.batch_number LIKE ?");
    args.push(`%${filters.batch}%`);
  }
  if (filters.locationId) {
    where.push("t.location_id = ?");
    args.push(filters.locationId);
  }
  return { whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "", args };
}
