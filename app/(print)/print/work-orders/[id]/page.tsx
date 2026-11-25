import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Barcode } from "@/components/print/barcode";
import { requirePermission } from "@/lib/auth/dal";
import { db } from "@/lib/db/client";
import { formatCycleTime, PRIORITY_LABELS, WO_STATUS_LABELS, type Priority, type WoStatus } from "@/lib/production/constants";
import { getBom, materialRequirements } from "@/lib/production/queries";
import { formatQty } from "@/lib/quantity";

export const metadata: Metadata = { title: "Work order traveler" };

/** Work order traveler: travels with the job on the floor. Barcode, materials and an operation sign-off grid. */
export default function TravelerPage(props: PageProps<"/print/work-orders/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Preparing document…</p>}>
      <TravelerPageContent {...props} />
    </Suspense>
  );
}

async function TravelerPageContent({ params }: PageProps<"/print/work-orders/[id]">) {
  await requirePermission("workorders.view");
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const wo = await db.get<{
    id: number;
    wo_number: string;
    bom_id: number;
    sku: string;
    item_name: string;
    uom: string;
    qty_target_milli: number;
    qty_completed_milli: number;
    status: WoStatus;
    priority: Priority;
    due_date: string | null;
    notes: string | null;
    ws_code: string;
    mat_code: string;
    out_code: string;
    material_location_id: number;
    created_at: string;
  }>(
    `SELECT o.id, o.wo_number, o.bom_id, i.sku, i.name AS item_name, i.uom, o.qty_target_milli, o.qty_completed_milli, o.status, o.priority,
            o.due_date, o.notes, w.code AS ws_code, lm.code AS mat_code, lo.code AS out_code, o.material_location_id, o.created_at
       FROM work_orders o JOIN items i ON i.id = o.item_id JOIN workstations w ON w.id = o.workstation_id
       JOIN locations lm ON lm.id = o.material_location_id JOIN locations lo ON lo.id = o.output_location_id
      WHERE o.id = ?`,
    [Number(id)],
  );
  if (!wo) notFound();
  const [bom, materials] = await Promise.all([getBom(wo.bom_id), materialRequirements(wo)]);

  return (
    <article className="space-y-6 text-sm">
      <header className="flex items-start justify-between gap-6 border-b-2 border-zinc-900 pb-4">
        <div>
          <p className="text-xs font-semibold tracking-widest text-zinc-500 uppercase">Work order traveler</p>
          <h1 className="font-mono text-3xl font-bold">{wo.wo_number}</h1>
          <p className="mt-1 text-base">
            <span className="font-mono font-semibold">{wo.sku}</span> · {wo.item_name}
          </p>
        </div>
        <Barcode value={wo.wo_number} />
      </header>

      <dl className="grid grid-cols-4 gap-x-6 gap-y-3">
        {[
          ["Quantity", formatQty(wo.qty_target_milli, wo.uom)],
          ["Due", wo.due_date ?? "—"],
          ["Priority", PRIORITY_LABELS[wo.priority]],
          ["Status", WO_STATUS_LABELS[wo.status]],
          ["Workstation", wo.ws_code],
          ["Materials from", wo.mat_code],
          ["Output to", wo.out_code],
          ["Recipe", `BOM v${bom?.version ?? "?"}`],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-zinc-500">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      {wo.notes && <p className="rounded border border-zinc-300 p-3 italic">{wo.notes}</p>}

      <section>
        <h2 className="mb-2 text-base font-semibold">Materials</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-zinc-400 text-left text-xs text-zinc-500">
              <th className="py-1.5">Component</th>
              <th className="py-1.5 text-right">Per unit</th>
              <th className="py-1.5 text-right">Required</th>
              <th className="w-40 py-1.5 pl-4">Lot issued</th>
            </tr>
          </thead>
          <tbody>
            {materials.map((m) => (
              <tr key={m.itemId} className="border-b border-zinc-200">
                <td className="py-2">
                  <span className="font-mono font-semibold">{m.sku}</span> {m.name}
                </td>
                <td className="py-2 text-right tabular-nums">{formatQty(m.qtyPerUnitMilli, m.uom)}</td>
                <td className="py-2 text-right tabular-nums">{formatQty(m.requiredMilli, m.uom)}</td>
                <td className="py-2 pl-4">
                  <div className="h-6 border-b border-zinc-400" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">Operations</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-zinc-400 text-left text-xs text-zinc-500">
              <th className="py-1.5">Seq</th>
              <th className="py-1.5">Operation</th>
              <th className="py-1.5">Station</th>
              <th className="py-1.5 text-right">Ideal cycle</th>
              <th className="py-1.5 pl-4">Good</th>
              <th className="py-1.5">Scrap</th>
              <th className="py-1.5">Operator</th>
              <th className="py-1.5">Date</th>
            </tr>
          </thead>
          <tbody>
            {(bom?.steps.length ? bom.steps : [{ sequence: 10, operationName: "Production", workstationCode: wo.ws_code, cycleMs: 0, setupMinutes: 0, workstationId: 0 }]).map((s) => (
              <tr key={s.sequence} className="h-10 border-b border-zinc-200">
                <td className="font-mono">{s.sequence}</td>
                <td className="font-medium">{s.operationName}</td>
                <td className="font-mono">{s.workstationCode}</td>
                <td className="text-right tabular-nums">{s.cycleMs ? formatCycleTime(s.cycleMs) : "—"}</td>
                {[0, 1, 2, 3].map((i) => (
                  <td key={i} className="pl-4">
                    <div className="h-6 border-b border-zinc-400" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="grid grid-cols-2 gap-6 pt-4">
        {["Inspected by", "Completed by"].map((k) => (
          <div key={k}>
            <p className="text-xs text-zinc-500">{k}</p>
            <div className="mt-6 border-b border-zinc-500" />
            <p className="mt-1 text-xs text-zinc-500">Name · signature · date</p>
          </div>
        ))}
      </section>
      <footer className="pt-6 text-xs text-zinc-400">Printed from Factory Management System · created {wo.created_at.slice(0, 10)}</footer>
    </article>
  );
}
