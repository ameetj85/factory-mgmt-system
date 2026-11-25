import "server-only";
import { db } from "@/lib/db/client";
import type { ItemType } from "@/lib/inventory/constants";
import { requiredComponentMilli, type WorkstationStatus } from "./constants";

export interface WorkstationOption {
  id: number;
  code: string;
  name: string;
  status: WorkstationStatus;
}

export async function activeWorkstationOptions(): Promise<WorkstationOption[]> {
  return db.all<WorkstationOption>("SELECT id, code, name, status FROM workstations WHERE is_active = 1 ORDER BY code COLLATE NOCASE");
}

export interface BomLine {
  componentId: number;
  sku: string;
  name: string;
  uom: string;
  type: ItemType;
  qtyMilli: number;
  scrapBp: number;
  standardCostCents: number | null;
}

export interface RoutingStep {
  sequence: number;
  workstationId: number;
  workstationCode: string;
  operationName: string;
  cycleMs: number;
  setupMinutes: number;
}

export interface BomRecord {
  id: number;
  itemId: number;
  sku: string;
  name: string;
  uom: string;
  type: ItemType;
  version: number;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
  workOrderCount: number;
  lines: BomLine[];
  steps: RoutingStep[];
}

export async function getBom(id: number): Promise<BomRecord | null> {
  const header = await db.get<{
    id: number;
    item_id: number;
    sku: string;
    name: string;
    uom: string;
    type: ItemType;
    version: number;
    is_active: number;
    notes: string | null;
    created_at: string;
    created_by: string | null;
    wo_count: number;
  }>(
    `SELECT h.id, h.item_id, i.sku, i.name, i.uom, i.type, h.version, h.is_active, h.notes, h.created_at,
            u.full_name AS created_by, (SELECT COUNT(*) FROM work_orders w WHERE w.bom_id = h.id) AS wo_count
       FROM bom_headers h JOIN items i ON i.id = h.item_id LEFT JOIN users u ON u.id = h.created_by
      WHERE h.id = ?`,
    [id],
  );
  if (!header) return null;

  const [lines, steps] = await Promise.all([
    db.all<BomLine>(
      `SELECT l.component_item_id AS componentId, i.sku, i.name, i.uom, i.type, l.quantity_required_milli AS qtyMilli,
              l.scrap_factor_bp AS scrapBp, i.standard_cost_cents AS standardCostCents
         FROM bom_lines l JOIN items i ON i.id = l.component_item_id
        WHERE l.bom_id = ? ORDER BY l.sort_order, l.id`,
      [id],
    ),
    db.all<RoutingStep>(
      `SELECT r.sequence, r.workstation_id AS workstationId, w.code AS workstationCode, r.operation_name AS operationName,
              r.ideal_cycle_time_ms AS cycleMs, r.setup_time_minutes AS setupMinutes
         FROM bom_routing_steps r JOIN workstations w ON w.id = r.workstation_id
        WHERE r.bom_id = ? ORDER BY r.sequence`,
      [id],
    ),
  ]);

  return {
    id: header.id,
    itemId: header.item_id,
    sku: header.sku,
    name: header.name,
    uom: header.uom,
    type: header.type,
    version: header.version,
    isActive: header.is_active === 1,
    notes: header.notes,
    createdAt: header.created_at,
    createdBy: header.created_by,
    workOrderCount: header.wo_count,
    lines,
    steps,
  };
}

export interface ExplodedNode {
  key: string;
  depth: number;
  sku: string;
  name: string;
  uom: string;
  type: ItemType;
  /** Quantity needed for one unit of the top-level item, including scrap allowances along the way. */
  extendedMilli: number;
  qtyPerParentMilli: number;
  scrapBp: number;
  /** Extended cost in cents for purchased (leaf) components; null when no standard cost is set. */
  costCents: number | null;
  hasSubRecipe: boolean;
}

/**
 * Expands a BOM through the active recipes of its WIP components, down to purchased materials.
 * Returns the tree in display order and the rolled-up material cost of one unit.
 */
export async function explodeBom(bom: BomRecord): Promise<{ nodes: ExplodedNode[]; unitCostCents: number | null; missingCosts: boolean }> {
  const nodes: ExplodedNode[] = [];
  let total = 0;
  let missingCosts = false;

  async function walk(lines: BomLine[], parentQtyMilli: number, depth: number, path: string, seen: Set<number>) {
    for (const line of lines) {
      const extended = requiredComponentMilli(parentQtyMilli, line.qtyMilli, line.scrapBp);
      const sub =
        depth < 8 && !seen.has(line.componentId)
          ? await db.get<{ id: number }>("SELECT id FROM bom_headers WHERE item_id = ? AND is_active = 1", [line.componentId])
          : undefined;
      const cost = !sub && line.standardCostCents != null ? Math.round((extended / 1000) * line.standardCostCents) : null;
      if (!sub) {
        if (cost == null) missingCosts = true;
        else total += cost;
      }
      const key = `${path}/${line.componentId}`;
      nodes.push({
        key,
        depth,
        sku: line.sku,
        name: line.name,
        uom: line.uom,
        type: line.type,
        extendedMilli: extended,
        qtyPerParentMilli: line.qtyMilli,
        scrapBp: line.scrapBp,
        costCents: cost,
        hasSubRecipe: Boolean(sub),
      });
      if (sub) {
        const child = await getBom(sub.id);
        if (child) await walk(child.lines, extended, depth + 1, key, new Set([...seen, line.componentId]));
      }
    }
  }

  await walk(bom.lines, 1000, 0, "", new Set([bom.itemId]));
  return { nodes, unitCostCents: missingCosts && total === 0 ? null : total, missingCosts };
}

export interface MaterialRequirement {
  itemId: number;
  sku: string;
  name: string;
  uom: string;
  qtyPerUnitMilli: number;
  scrapBp: number;
  requiredMilli: number;
  consumedMilli: number;
  availableMilli: number;
}

/** Per-component requirement for a work order's full target, what's been consumed, and what's on hand to use. */
export async function materialRequirements(wo: {
  id: number;
  bom_id: number;
  qty_target_milli: number;
  material_location_id: number;
}): Promise<MaterialRequirement[]> {
  const rows = await db.all<{
    item_id: number;
    sku: string;
    name: string;
    uom: string;
    qty_milli: number;
    scrap_bp: number;
    consumed: number;
    available: number;
  }>(
    `SELECT l.component_item_id AS item_id, i.sku, i.name, i.uom, l.quantity_required_milli AS qty_milli, l.scrap_factor_bp AS scrap_bp,
            COALESCE((SELECT -SUM(t.qty_change_milli) FROM inventory_txns t
                       WHERE t.reference_type = 'work_order' AND t.reference_id = ? AND t.item_id = l.component_item_id
                         AND t.txn_type = 'MATERIAL_CONSUMPTION'), 0) AS consumed,
            COALESCE((SELECT SUM(s.qty_milli) FROM stock_levels s
                       WHERE s.item_id = l.component_item_id AND s.location_id = ? AND s.qty_milli > 0), 0) AS available
       FROM bom_lines l JOIN items i ON i.id = l.component_item_id
      WHERE l.bom_id = ? ORDER BY l.sort_order, l.id`,
    [wo.id, wo.material_location_id, wo.bom_id],
  );
  return rows.map((r) => ({
    itemId: r.item_id,
    sku: r.sku,
    name: r.name,
    uom: r.uom,
    qtyPerUnitMilli: r.qty_milli,
    scrapBp: r.scrap_bp,
    requiredMilli: requiredComponentMilli(wo.qty_target_milli, r.qty_milli, r.scrap_bp),
    consumedMilli: r.consumed,
    availableMilli: r.available,
  }));
}
