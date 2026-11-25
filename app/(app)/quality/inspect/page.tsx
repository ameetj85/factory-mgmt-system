import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { requirePermission } from "@/lib/auth/dal";
import { db } from "@/lib/db/client";
import type { Checklist, Criterion } from "@/lib/quality/service";
import { InspectForm, type InspectContext, type LotChoice } from "./inspect-form";

export const metadata: Metadata = { title: "Inspect" };

export default function InspectPage(props: PageProps<"/quality/inspect">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <InspectContent {...props} />
    </Suspense>
  );
}

const num = (v: unknown) => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : undefined);

async function loadContext(params: Record<string, string | string[] | undefined>): Promise<InspectContext> {
  const woId = num(params.wo);
  const receiptId = num(params.receipt);
  const itemId = num(params.item);
  const lot = typeof params.lot === "string" ? params.lot.toUpperCase() : undefined;

  if (woId) {
    const wo = await db.get<{ id: number; wo_number: string; item_id: number; sku: string; name: string; status: string }>(
      "SELECT o.id, o.wo_number, o.item_id, i.sku, i.name, o.status FROM work_orders o JOIN items i ON i.id = o.item_id WHERE o.id = ?",
      [woId],
    );
    if (wo) {
      return {
        title: `Work order ${wo.wo_number}`,
        defaultStage: wo.status === "COMPLETED" ? "FINAL" : "IN_PROCESS",
        workOrderId: wo.id,
        receiptId: null,
        lots: [{ itemId: wo.item_id, sku: wo.sku, name: wo.name, batchNumber: wo.wo_number }],
        fixed: true,
      };
    }
  }
  if (receiptId) {
    const receipt = await db.get<{ receipt_number: string; supplier_name: string }>("SELECT receipt_number, supplier_name FROM receipts WHERE id = ?", [receiptId]);
    const lines = await db.all<LotChoice>(
      `SELECT t.item_id AS itemId, i.sku, i.name, t.batch_number AS batchNumber
         FROM inventory_txns t JOIN items i ON i.id = t.item_id
        WHERE t.reference_type = 'receipt' AND t.reference_id = ? ORDER BY t.id`,
      [receiptId],
    );
    if (receipt && lines.length) {
      return {
        title: `Receipt ${receipt.receipt_number} from ${receipt.supplier_name}`,
        defaultStage: "RECEIVING",
        workOrderId: null,
        receiptId,
        lots: lines,
        fixed: lines.length === 1,
      };
    }
  }
  if (itemId && lot) {
    const row = await db.get<LotChoice>(
      `SELECT t.item_id AS itemId, i.sku, i.name, t.batch_number AS batchNumber
         FROM inventory_txns t JOIN items i ON i.id = t.item_id WHERE t.item_id = ? AND t.batch_number = ? LIMIT 1`,
      [itemId, lot],
    );
    if (row) return { title: `Lot ${row.batchNumber}`, defaultStage: "FINAL", workOrderId: null, receiptId: null, lots: [row], fixed: true };
  }
  // No context: any lot that has stock, most recent first.
  const lots = await db.all<LotChoice>(
    `SELECT s.item_id AS itemId, i.sku, i.name, s.batch_number AS batchNumber
       FROM stock_levels s JOIN items i ON i.id = s.item_id
      WHERE s.qty_milli > 0 AND i.is_active = 1
      GROUP BY s.item_id, s.batch_number ORDER BY MAX(s.last_txn_at) DESC LIMIT 300`,
  );
  return { title: null, defaultStage: "FINAL", workOrderId: null, receiptId: null, lots, fixed: false };
}

async function loadChecklists(): Promise<Checklist[]> {
  const [templates, criteria] = await Promise.all([
    db.all<Omit<Checklist, "criteria">>(
      `SELECT t.id, t.name, t.description, t.stage, t.item_id, i.sku AS item_sku, t.is_active
         FROM inspection_templates t LEFT JOIN items i ON i.id = t.item_id WHERE t.is_active = 1 ORDER BY t.name COLLATE NOCASE`,
    ),
    db.all<Criterion & { template_id: number }>(
      `SELECT c.template_id, c.id, c.label, c.criterion_type, c.unit, c.target_milli, c.min_milli, c.max_milli, c.is_critical, c.instructions
         FROM inspection_criteria c JOIN inspection_templates t ON t.id = c.template_id WHERE t.is_active = 1
        ORDER BY c.sort_order, c.id`,
    ),
  ]);
  return templates.map((t) => ({ ...t, criteria: criteria.filter((c) => c.template_id === t.id) }));
}

async function InspectContent({ searchParams }: PageProps<"/quality/inspect">) {
  await requirePermission("quality.inspect");
  const params = await searchParams;
  const [context, checklists] = await Promise.all([loadContext(params), loadChecklists()]);

  return (
    <>
      <PageHeader
        title={context.title ? `Inspect · ${context.title}` : "Record an inspection"}
        description="Choose the lot and checklist, then record each check. Measurements are judged against the checklist's limits."
      />
      <InspectForm context={context} checklists={checklists} />
    </>
  );
}

