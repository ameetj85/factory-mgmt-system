"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/dal";
import { nowIso, transaction, type Executor } from "@/lib/db/client";
import { formError, idSchema, type FormState } from "@/lib/forms";
import { claimIdempotencyKey, InventoryError } from "@/lib/inventory/service";
import { SCRAP_REASONS, type RunType } from "@/lib/production/constants";
import { endRunWithin, loadWorkOrder, recordOutput, startRunWithin } from "@/lib/production/service";
import { formatQty, parseQtyMilli } from "@/lib/quantity";

// Every shop-floor action is keyed: a tablet retrying after a dropped connection must not double-count.
const keySchema = z.uuid();
const ALREADY: FormState = { status: "success", message: "Already recorded." };

async function run(fn: () => Promise<FormState>): Promise<FormState> {
  try {
    const result = await fn();
    if (result.status === "success") refresh();
    return result;
  } catch (error) {
    if (error instanceof InventoryError) return formError(error.message);
    throw error;
  }
}

async function openRunWithOrder(tx: Executor, runId: number) {
  const runRow = await tx.get<{ id: number; work_order_id: number; workstation_id: number; run_type: RunType; end_time: string | null }>(
    "SELECT id, work_order_id, workstation_id, run_type, end_time FROM production_logs WHERE id = ?",
    [runId],
  );
  if (!runRow) throw new InventoryError("Run not found.");
  if (runRow.end_time) throw new InventoryError("This run has already ended. Refresh the screen.");
  const wo = (await loadWorkOrder(tx, runRow.work_order_id))!;
  return { runRow, wo };
}

export async function startRun(input: { workOrderId: number; workstationId: number; runType: RunType; key: string }): Promise<FormState> {
  const user = await requirePermission("shopfloor.operate");
  const workOrderId = idSchema.parse(input.workOrderId);
  const workstationId = idSchema.parse(input.workstationId);
  const runType: RunType = input.runType === "SETUP" ? "SETUP" : "RUN";
  const key = keySchema.parse(input.key);

  return run(() =>
    transaction(async (tx): Promise<FormState> => {
      if (!(await claimIdempotencyKey(tx, key, "production.run_start", user.id))) return ALREADY;
      const wo = await loadWorkOrder(tx, workOrderId);
      if (!wo) return formError("Work order not found.");
      const runId = await startRunWithin(tx, wo, workstationId, runType, user.id);
      await writeAudit({ userId: user.id, action: "production.run_start", entityType: "work_order", entityId: wo.id, details: { runId, runType, woNumber: wo.wo_number } }, tx);
      return { status: "success", message: `${runType === "SETUP" ? "Setup" : "Production"} started on ${wo.wo_number}.` };
    }),
  );
}

const SCRAP_VALUES = SCRAP_REASONS.map((r) => r.value) as string[];

function parseOutput(good: string, scrap: string, scrapReason: string | null) {
  const goodMilli = parseQtyMilli(good || "0");
  const scrapMilli = parseQtyMilli(scrap || "0");
  if (goodMilli === null || scrapMilli === null) throw new InventoryError("Enter quantities with up to 3 decimals.");
  if (scrapMilli > 0 && (!scrapReason || !SCRAP_VALUES.includes(scrapReason))) throw new InventoryError("Choose a scrap reason.");
  return { goodMilli, scrapMilli };
}

export async function reportOutput(input: { runId: number; good: string; scrap: string; scrapReason: string | null; key: string }): Promise<FormState> {
  const user = await requirePermission("shopfloor.operate");
  const runId = idSchema.parse(input.runId);
  const key = keySchema.parse(input.key);

  return run(() =>
    transaction(async (tx): Promise<FormState> => {
      if (!(await claimIdempotencyKey(tx, key, "production.output", user.id))) return ALREADY;
      const { goodMilli, scrapMilli } = parseOutput(input.good, input.scrap, input.scrapReason);
      if (goodMilli + scrapMilli === 0) return formError("Enter a good or scrap quantity.");
      const { runRow, wo } = await openRunWithOrder(tx, runId);
      if (runRow.run_type === "SETUP" && goodMilli > 0) return formError("Good units can't be reported during setup. Finish setup first.");

      await recordOutput(tx, wo, { runId, goodMilli, scrapMilli, scrapReason: input.scrapReason, userId: user.id });
      await writeAudit(
        { userId: user.id, action: "production.output", entityType: "work_order", entityId: wo.id, details: { runId, good_milli: goodMilli, scrap_milli: scrapMilli, reason: input.scrapReason } },
        tx,
      );
      const item = await tx.get<{ uom: string }>("SELECT uom FROM items WHERE id = ?", [wo.item_id]);
      const parts = [goodMilli > 0 && `${formatQty(goodMilli, item?.uom)} good`, scrapMilli > 0 && `${formatQty(scrapMilli, item?.uom)} scrap`].filter(Boolean);
      return { status: "success", message: `Logged ${parts.join(" and ")} on ${wo.wo_number}.` };
    }),
  );
}

/** Ends setup and starts the production run in one step, so the machine never shows idle in between. */
export async function finishSetup(input: { runId: number; key: string }): Promise<FormState> {
  const user = await requirePermission("shopfloor.operate");
  const runId = idSchema.parse(input.runId);
  const key = keySchema.parse(input.key);

  return run(() =>
    transaction(async (tx): Promise<FormState> => {
      if (!(await claimIdempotencyKey(tx, key, "production.setup_done", user.id))) return ALREADY;
      const { runRow, wo } = await openRunWithOrder(tx, runId);
      if (runRow.run_type !== "SETUP") return formError("This isn't a setup run.");
      await endRunWithin(tx, runId, runRow.workstation_id, "SETUP_DONE");
      const next = await startRunWithin(tx, wo, runRow.workstation_id, "RUN", user.id);
      await writeAudit({ userId: user.id, action: "production.setup_done", entityType: "work_order", entityId: wo.id, details: { setupRunId: runId, runId: next } }, tx);
      return { status: "success", message: `Setup done. Production running on ${wo.wo_number}.` };
    }),
  );
}

export async function endRun(input: {
  runId: number;
  completeWorkOrder: boolean;
  good?: string;
  scrap?: string;
  scrapReason?: string | null;
  key: string;
}): Promise<FormState> {
  const user = await requirePermission("shopfloor.operate");
  const runId = idSchema.parse(input.runId);
  const key = keySchema.parse(input.key);

  return run(() =>
    transaction(async (tx): Promise<FormState> => {
      if (!(await claimIdempotencyKey(tx, key, "production.run_end", user.id))) return ALREADY;
      const { runRow, wo } = await openRunWithOrder(tx, runId);
      const { goodMilli, scrapMilli } = parseOutput(input.good ?? "", input.scrap ?? "", input.scrapReason ?? null);
      if (runRow.run_type === "SETUP" && goodMilli > 0) return formError("Good units can't be reported during setup.");
      if (goodMilli + scrapMilli > 0) {
        await recordOutput(tx, wo, { runId, goodMilli, scrapMilli, scrapReason: input.scrapReason ?? null, userId: user.id });
      }

      await endRunWithin(tx, runId, runRow.workstation_id, input.completeWorkOrder ? "COMPLETED" : "PAUSED");
      if (input.completeWorkOrder) {
        const now = nowIso();
        await tx.run("UPDATE work_orders SET status = 'COMPLETED', completed_at = ?, updated_at = ? WHERE id = ?", [now, now, wo.id]);
      }
      await writeAudit(
        {
          userId: user.id,
          action: input.completeWorkOrder ? "production.work_order_completed" : "production.run_paused",
          entityType: "work_order",
          entityId: wo.id,
          details: { runId, final_good_milli: goodMilli, final_scrap_milli: scrapMilli },
        },
        tx,
      );
      return {
        status: "success",
        message: input.completeWorkOrder ? `${wo.wo_number} completed.` : `Run paused on ${wo.wo_number}.`,
      };
    }),
  );
}
