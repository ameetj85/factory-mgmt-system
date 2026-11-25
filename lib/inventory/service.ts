import "server-only";
import { randomBytes } from "node:crypto";
import type { Executor } from "@/lib/db/client";
import type { TxnType } from "./constants";

/**
 * Records an idempotency key inside the caller's transaction. Returns false when the key was
 * already used, meaning this exact submission has been processed and must not be applied twice.
 */
export async function claimIdempotencyKey(
  tx: Executor,
  key: string | undefined,
  action: string,
  userId: number,
): Promise<boolean> {
  if (!key) return true;
  const existing = await tx.get<{ key: string }>("SELECT key FROM idempotency_keys WHERE key = ?", [key]);
  if (existing) return false;
  await tx.run("INSERT INTO idempotency_keys (key, action, user_id) VALUES (?, ?, ?)", [key, action, userId]);
  return true;
}

/** Next sequential document number for today, e.g. RCV-20261125-0003. Call inside a transaction. */
export async function nextDocumentNumber(
  tx: Executor,
  table: "receipts" | "shipments" | "work_orders" | "inspections",
  column: "receipt_number" | "shipment_number" | "wo_number" | "inspection_number",
  prefix: string,
): Promise<string> {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const stem = `${prefix}-${day}-`;
  const row = await tx.get<{ last: string | null }>(
    `SELECT MAX(${column}) AS last FROM ${table} WHERE ${column} LIKE ?`,
    [`${stem}%`],
  );
  const next = row?.last ? Number(row.last.slice(stem.length)) + 1 : 1;
  return `${stem}${String(next).padStart(4, "0")}`;
}

/** Generates a lot number such as LOT-261125-7KQ2 for receipts that arrive without a supplier lot. */
export function generateLotNumber(): string {
  const day = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  const suffix = randomBytes(3).toString("hex").toUpperCase().slice(0, 4);
  return `LOT-${day}-${suffix}`;
}

export async function batchBalance(
  tx: Executor,
  itemId: number,
  locationId: number,
  batchNumber: string,
): Promise<number> {
  const row = await tx.get<{ qty: number | null }>(
    "SELECT SUM(qty_change_milli) AS qty FROM inventory_txns WHERE item_id = ? AND location_id = ? AND batch_number = ?",
    [itemId, locationId, batchNumber],
  );
  return row?.qty ?? 0;
}

export interface PostTxnInput {
  itemId: number;
  locationId: number;
  batchNumber: string;
  qtyChangeMilli: number;
  txnType: TxnType;
  referenceType?: string;
  referenceId?: number;
  unitCostCents?: number | null;
  notes?: string | null;
  userId: number;
}

/** Appends one row to the stock ledger. Callers are responsible for balance checks. */
export async function postTxn(tx: Executor, input: PostTxnInput): Promise<number> {
  const { lastID } = await tx.run(
    `INSERT INTO inventory_txns
       (item_id, location_id, batch_number, qty_change_milli, txn_type, reference_type, reference_id,
        unit_cost_cents, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.itemId,
      input.locationId,
      input.batchNumber,
      input.qtyChangeMilli,
      input.txnType,
      input.referenceType ?? null,
      input.referenceId ?? null,
      input.unitCostCents ?? null,
      input.notes ?? null,
      input.userId,
    ],
  );
  return lastID;
}

export class InventoryError extends Error {}

/** SQL condition (for a row aliased `alias` with item_id and batch_number) that excludes lots on quality hold. */
export function notHeldSql(alias: string): string {
  return `NOT EXISTS (SELECT 1 FROM lot_holds h WHERE h.item_id = ${alias}.item_id AND h.batch_number = ${alias}.batch_number AND h.status = 'ACTIVE')`;
}

/** Throws when the lot is on an active quality hold. */
export async function assertNotHeld(tx: Executor, itemId: number, batchNumber: string, sku: string): Promise<void> {
  const hold = await tx.get<{ reason: string }>(
    "SELECT reason FROM lot_holds WHERE item_id = ? AND batch_number = ? AND status = 'ACTIVE'",
    [itemId, batchNumber],
  );
  if (hold) throw new InventoryError(`Lot ${batchNumber} of ${sku} is on quality hold (${hold.reason}) and can't be used until it's released.`);
}

/** Throws InventoryError when taking `qtyMilli` out of a batch would make it negative. */
export async function assertAvailable(
  tx: Executor,
  itemId: number,
  locationId: number,
  batchNumber: string,
  qtyMilli: number,
  describe: () => string,
): Promise<void> {
  const balance = await batchBalance(tx, itemId, locationId, batchNumber);
  if (balance < qtyMilli) throw new InventoryError(describe());
}
