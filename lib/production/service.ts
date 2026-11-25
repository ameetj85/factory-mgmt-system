import "server-only";
import { nowIso, type Executor } from "@/lib/db/client";
import { InventoryError, notHeldSql, postTxn } from "@/lib/inventory/service";
import { formatQty } from "@/lib/quantity";
import { requiredComponentMilli, type RunType, type WoStatus } from "./constants";

export interface WorkOrderRecord {
  id: number;
  wo_number: string;
  bom_id: number;
  item_id: number;
  workstation_id: number;
  qty_target_milli: number;
  qty_completed_milli: number;
  qty_scrap_milli: number;
  status: WoStatus;
  material_location_id: number;
  output_location_id: number;
  started_at: string | null;
}

export async function loadWorkOrder(tx: Executor, id: number): Promise<WorkOrderRecord | undefined> {
  return tx.get<WorkOrderRecord>(
    `SELECT id, wo_number, bom_id, item_id, workstation_id, qty_target_milli, qty_completed_milli, qty_scrap_milli,
            status, material_location_id, output_location_id, started_at
       FROM work_orders WHERE id = ?`,
    [id],
  );
}

interface BomLineRecord {
  component_item_id: number;
  quantity_required_milli: number;
  scrap_factor_bp: number;
  sku: string;
  uom: string;
}

async function bomLines(tx: Executor, bomId: number): Promise<BomLineRecord[]> {
  return tx.all<BomLineRecord>(
    `SELECT l.component_item_id, l.quantity_required_milli, l.scrap_factor_bp, i.sku, i.uom
       FROM bom_lines l JOIN items i ON i.id = l.component_item_id
      WHERE l.bom_id = ? ORDER BY l.sort_order, l.id`,
    [bomId],
  );
}

/** Material already consumed by a work order, per component (positive thousandths). */
async function consumedSoFar(tx: Executor, workOrderId: number): Promise<Map<number, number>> {
  const rows = await tx.all<{ item_id: number; qty: number }>(
    `SELECT item_id, -SUM(qty_change_milli) AS qty FROM inventory_txns
      WHERE reference_type = 'work_order' AND reference_id = ? AND txn_type = 'MATERIAL_CONSUMPTION'
      GROUP BY item_id`,
    [workOrderId],
  );
  return new Map(rows.map((r) => [r.item_id, r.qty]));
}

/**
 * Backflushes materials so that total consumption matches `totalProducedMilli` (good + scrap so far).
 * Computing the cumulative target, instead of rounding each report separately, means many small reports
 * never consume more than one big report would. Lots are drawn oldest first (FIFO) from the work order's
 * material location; throws InventoryError when stock is short so nothing is half-posted.
 */
export async function backflushMaterials(
  tx: Executor,
  wo: WorkOrderRecord,
  totalProducedMilli: number,
  userId: number,
): Promise<void> {
  const [lines, consumed] = await Promise.all([bomLines(tx, wo.bom_id), consumedSoFar(tx, wo.id)]);
  const location = await tx.get<{ code: string }>("SELECT code FROM locations WHERE id = ?", [wo.material_location_id]);

  for (const line of lines) {
    const target = requiredComponentMilli(totalProducedMilli, line.quantity_required_milli, line.scrap_factor_bp);
    let remaining = target - (consumed.get(line.component_item_id) ?? 0);
    if (remaining <= 0) continue;

    // Lots on quality hold are never consumed.
    const allLots = await tx.all<{ batch_number: string; qty_milli: number; held: number }>(
      `SELECT s.batch_number, s.qty_milli, NOT ${notHeldSql("s")} AS held FROM stock_levels s
        WHERE s.item_id = ? AND s.location_id = ? AND s.qty_milli > 0
        ORDER BY s.first_txn_at, s.batch_number`,
      [line.component_item_id, wo.material_location_id],
    );
    const lots = allLots.filter((l) => !l.held);
    const available = lots.reduce((sum, l) => sum + l.qty_milli, 0);
    if (available < remaining) {
      const heldQty = allLots.filter((l) => l.held).reduce((sum, l) => sum + l.qty_milli, 0);
      throw new InventoryError(
        `Not enough ${line.sku} at ${location?.code ?? "the material location"}: needs ${formatQty(remaining, line.uom)}, ` +
          `${formatQty(available, line.uom)} available` +
          (heldQty > 0 ? ` (${formatQty(heldQty, line.uom)} more is on quality hold)` : "") +
          ". Receive or move stock there first.",
      );
    }

    for (const lot of lots) {
      if (remaining <= 0) break;
      const take = Math.min(lot.qty_milli, remaining);
      await postTxn(tx, {
        itemId: line.component_item_id,
        locationId: wo.material_location_id,
        batchNumber: lot.batch_number,
        qtyChangeMilli: -take,
        txnType: "MATERIAL_CONSUMPTION",
        referenceType: "work_order",
        referenceId: wo.id,
        userId,
      });
      remaining -= take;
    }
  }
}

export interface OutputInput {
  runId: number;
  goodMilli: number;
  scrapMilli: number;
  scrapReason: string | null;
  userId: number;
}

/**
 * Records good and scrap output against an open run: backflushes materials, receives good units into the
 * output location under the work order number as their lot, and updates run and work order totals.
 */
export async function recordOutput(tx: Executor, wo: WorkOrderRecord, input: OutputInput): Promise<void> {
  const { runId, goodMilli, scrapMilli, scrapReason, userId } = input;
  if (goodMilli + scrapMilli <= 0) return;

  const totalProduced = wo.qty_completed_milli + wo.qty_scrap_milli + goodMilli + scrapMilli;
  await backflushMaterials(tx, wo, totalProduced, userId);

  if (goodMilli > 0) {
    await postTxn(tx, {
      itemId: wo.item_id,
      locationId: wo.output_location_id,
      batchNumber: wo.wo_number,
      qtyChangeMilli: goodMilli,
      txnType: "PRODUCTION_OUTPUT",
      referenceType: "work_order",
      referenceId: wo.id,
      userId,
    });
  }

  await tx.run("UPDATE production_logs SET qty_good_milli = qty_good_milli + ?, qty_scrap_milli = qty_scrap_milli + ? WHERE id = ?", [
    goodMilli,
    scrapMilli,
    runId,
  ]);
  await tx.run(
    "UPDATE work_orders SET qty_completed_milli = qty_completed_milli + ?, qty_scrap_milli = qty_scrap_milli + ?, updated_at = ? WHERE id = ?",
    [goodMilli, scrapMilli, nowIso(), wo.id],
  );
  await tx.run(
    `INSERT INTO production_output_events (production_log_id, work_order_id, qty_good_milli, qty_scrap_milli, scrap_reason_code, reported_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [runId, wo.id, goodMilli, scrapMilli, scrapMilli > 0 ? scrapReason : null, userId],
  );

  wo.qty_completed_milli += goodMilli;
  wo.qty_scrap_milli += scrapMilli;
}

/**
 * Throws when making `parentItemId` from `componentIds` would create a loop, i.e. a component's own
 * active recipe (at any depth) already uses the parent.
 */
export async function assertNoBomCycle(tx: Executor, parentItemId: number, componentIds: number[]): Promise<void> {
  const visited = new Set<number>();
  const stack = [...componentIds];
  while (stack.length > 0) {
    const itemId = stack.pop()!;
    if (itemId === parentItemId) {
      const item = await tx.get<{ sku: string }>("SELECT sku FROM items WHERE id = ?", [parentItemId]);
      throw new InventoryError(`This recipe would make ${item?.sku ?? "the item"} a component of itself.`);
    }
    if (visited.has(itemId)) continue;
    visited.add(itemId);
    const children = await tx.all<{ component_item_id: number }>(
      `SELECT l.component_item_id FROM bom_lines l JOIN bom_headers h ON h.id = l.bom_id
        WHERE h.item_id = ? AND h.is_active = 1`,
      [itemId],
    );
    stack.push(...children.map((c) => c.component_item_id));
  }
}

/** Opens a run on a workstation after checking it's free and the work order is runnable. */
export async function startRunWithin(tx: Executor, wo: WorkOrderRecord, workstationId: number, runType: RunType, userId: number): Promise<number> {
  const ws = await tx.get<{ code: string; status: string; is_active: number }>("SELECT code, status, is_active FROM workstations WHERE id = ?", [workstationId]);
  if (!ws?.is_active) throw new InventoryError("This workstation is not active.");
  if (ws.status === "DOWN" || ws.status === "MAINTENANCE") {
    throw new InventoryError(`${ws.code} is ${ws.status === "DOWN" ? "down" : "in maintenance"}. Production can't start until it's back up.`);
  }
  if (wo.workstation_id !== workstationId) throw new InventoryError(`${wo.wo_number} is scheduled on a different workstation.`);
  if (wo.status !== "RELEASED" && wo.status !== "IN_PROGRESS") throw new InventoryError(`${wo.wo_number} isn't released for production.`);
  const open = await tx.get<{ wo_number: string }>(
    "SELECT o.wo_number FROM production_logs p JOIN work_orders o ON o.id = p.work_order_id WHERE p.workstation_id = ? AND p.end_time IS NULL",
    [workstationId],
  );
  if (open) throw new InventoryError(`${ws.code} is already running ${open.wo_number}. End that run first.`);

  const now = nowIso();
  const { lastID } = await tx.run(
    "INSERT INTO production_logs (work_order_id, workstation_id, operator_id, run_type, start_time) VALUES (?, ?, ?, ?, ?)",
    [wo.id, workstationId, userId, runType, now],
  );
  await tx.run("UPDATE workstations SET status = 'RUNNING', updated_at = ? WHERE id = ?", [now, workstationId]);
  if (wo.status === "RELEASED") {
    await tx.run("UPDATE work_orders SET status = 'IN_PROGRESS', started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ?", [now, now, wo.id]);
  }
  return lastID;
}

/** Closes a run and frees the workstation (unless downtime has already changed its status). */
export async function endRunWithin(tx: Executor, runId: number, workstationId: number, reason: "PAUSED" | "COMPLETED" | "SETUP_DONE") {
  const now = nowIso();
  await tx.run("UPDATE production_logs SET end_time = ?, end_reason = ? WHERE id = ?", [now, reason, runId]);
  await tx.run("UPDATE workstations SET status = 'IDLE', updated_at = ? WHERE id = ? AND status = 'RUNNING'", [now, workstationId]);
}
