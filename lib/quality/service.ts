import "server-only";
import { db, type Executor } from "@/lib/db/client";
import type { CriterionType, Stage } from "./constants";

export interface Criterion {
  id: number;
  label: string;
  criterion_type: CriterionType;
  unit: string | null;
  target_milli: number | null;
  min_milli: number | null;
  max_milli: number | null;
  is_critical: number;
  instructions: string | null;
}

export interface Checklist {
  id: number;
  name: string;
  description: string | null;
  stage: Stage;
  item_id: number | null;
  item_sku: string | null;
  is_active: number;
  criteria: Criterion[];
}

export async function getChecklist(id: number, executor: Executor = db): Promise<Checklist | null> {
  const t = await executor.get<Omit<Checklist, "criteria">>(
    `SELECT t.id, t.name, t.description, t.stage, t.item_id, i.sku AS item_sku, t.is_active
       FROM inspection_templates t LEFT JOIN items i ON i.id = t.item_id WHERE t.id = ?`,
    [id],
  );
  if (!t) return null;
  const criteria = await executor.all<Criterion>(
    `SELECT id, label, criterion_type, unit, target_milli, min_milli, max_milli, is_critical, instructions
       FROM inspection_criteria WHERE template_id = ? ORDER BY sort_order, id`,
    [id],
  );
  return { ...t, criteria };
}

/** Active checklists that apply to an item: item-specific ones first, then generic ones for the stage. */
export async function checklistsFor(itemId: number, stage?: Stage) {
  return db.all<{ id: number; name: string; stage: Stage; item_id: number | null; criteria: number }>(
    `SELECT t.id, t.name, t.stage, t.item_id, (SELECT COUNT(*) FROM inspection_criteria c WHERE c.template_id = t.id) AS criteria
       FROM inspection_templates t
      WHERE t.is_active = 1 AND (t.item_id IS NULL OR t.item_id = ?) ${stage ? "AND t.stage = ?" : ""}
      ORDER BY t.item_id IS NULL, t.stage, t.name`,
    stage ? [itemId, stage] : [itemId],
  );
}

export async function activeHold(itemId: number, batchNumber: string, executor: Executor = db) {
  return executor.get<{ id: number; reason: string; placed_at: string; placed_by: string; inspection_id: number | null }>(
    `SELECT h.id, h.reason, h.placed_at, u.full_name AS placed_by, h.inspection_id
       FROM lot_holds h JOIN users u ON u.id = h.placed_by
      WHERE h.item_id = ? AND h.batch_number = ? AND h.status = 'ACTIVE'`,
    [itemId, batchNumber],
  );
}
