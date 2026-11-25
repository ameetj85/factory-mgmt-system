"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { nowIso, transaction, type Executor } from "@/lib/db/client";
import { ADJUSTMENT_REASONS, txnTypeForReason } from "@/lib/inventory/constants";
import {
  assertAvailable,
  assertNotHeld,
  claimIdempotencyKey,
  generateLotNumber,
  InventoryError,
  nextDocumentNumber,
  postTxn,
} from "@/lib/inventory/service";
import {
  formError,
  idSchema,
  optionalCentsSchema,
  optionalText,
  qtyMilliSchema,
  validationError,
  type FormState,
} from "@/lib/forms";
import { formatQty } from "@/lib/quantity";

const ALREADY_RECORDED: FormState = { status: "success", message: "This submission was already recorded." };

const batchSchema = z
  .string()
  .trim()
  .max(60, "Use at most 60 characters.")
  .regex(/^[A-Za-z0-9._/-]*$/, "Use letters, numbers, dots, dashes, slashes or underscores.")
  .transform((v) => v.toUpperCase());

const idempotencyKeySchema = z.uuid().optional();

/** Parses the JSON-encoded line items that multi-line forms submit in a hidden `lines` field. */
function parseLines<T extends z.ZodType>(formData: FormData, lineSchema: T) {
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    raw = [];
  }
  return z.array(lineSchema).min(1, "Add at least one line.").max(50, "Use at most 50 lines.").safeParse(raw);
}

async function itemLabel(tx: Executor, itemId: number) {
  const row = await tx.get<{ sku: string; uom: string; is_active: number }>("SELECT sku, uom, is_active FROM items WHERE id = ?", [itemId]);
  if (!row || !row.is_active) throw new InventoryError("One of the selected items is no longer active.");
  return row;
}

async function assertLocationActive(tx: Executor, locationId: number) {
  const row = await tx.get<{ code: string; is_active: number }>("SELECT code, is_active FROM locations WHERE id = ?", [locationId]);
  if (!row || !row.is_active) throw new InventoryError("One of the selected locations is no longer active.");
  return row;
}

async function runMovement(fn: () => Promise<FormState>): Promise<FormState> {
  try {
    const result = await fn();
    if (result.status === "success") refresh();
    return result;
  } catch (error) {
    if (error instanceof InventoryError) return formError(error.message);
    throw error;
  }
}

// ---------------------------------------------------------------- Receiving

const receiptLineSchema = z.object({
  itemId: idSchema,
  locationId: idSchema,
  batchNumber: batchSchema,
  qty: qtyMilliSchema(),
  unitCost: optionalCentsSchema,
});

const receiptSchema = z.object({
  supplierName: z.string().trim().min(2, "Enter the supplier.").max(120, "Use at most 120 characters."),
  supplierReference: optionalText(80),
  notes: optionalText(500),
  idempotencyKey: idempotencyKeySchema,
});

export async function receiveStock(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("inventory.receive");
  const header = receiptSchema.safeParse(Object.fromEntries(formData));
  if (!header.success) return validationError(header.error);
  const lines = parseLines(formData, receiptLineSchema);
  if (!lines.success) return linesError(lines.error);

  return runMovement(() =>
    transaction(async (tx): Promise<FormState> => {
      if (!(await claimIdempotencyKey(tx, header.data.idempotencyKey, "inventory.receive", user.id))) return ALREADY_RECORDED;

      const receiptNumber = await nextDocumentNumber(tx, "receipts", "receipt_number", "RCV");
      const { lastID: receiptId } = await tx.run(
        "INSERT INTO receipts (receipt_number, supplier_name, supplier_reference, notes, received_by) VALUES (?, ?, ?, ?, ?)",
        [receiptNumber, header.data.supplierName, header.data.supplierReference, header.data.notes, user.id],
      );

      const lots: string[] = [];
      for (const line of lines.data) {
        await itemLabel(tx, line.itemId);
        await assertLocationActive(tx, line.locationId);
        const batchNumber = line.batchNumber || generateLotNumber();
        lots.push(batchNumber);
        await postTxn(tx, {
          itemId: line.itemId,
          locationId: line.locationId,
          batchNumber,
          qtyChangeMilli: line.qty,
          txnType: "RECEIPT",
          referenceType: "receipt",
          referenceId: receiptId,
          unitCostCents: line.unitCost,
          userId: user.id,
        });
      }

      await writeAudit(
        {
          userId: user.id,
          action: "inventory.receive",
          entityType: "receipt",
          entityId: receiptId,
          details: { receiptNumber, supplier: header.data.supplierName, lines: lines.data.length, lots },
        },
        tx,
      );
      return { status: "success", message: `Receipt ${receiptNumber} recorded with ${lines.data.length} line${lines.data.length === 1 ? "" : "s"}.` };
    }),
  );
}

// ---------------------------------------------------------------- Shipping

const shipmentLineSchema = z.object({
  itemId: idSchema,
  locationId: idSchema,
  batchNumber: batchSchema.refine((v) => v.length > 0, "Choose a lot."),
  qty: qtyMilliSchema(),
});

const shipmentSchema = z.object({
  customerName: z.string().trim().min(2, "Enter the customer.").max(120, "Use at most 120 characters."),
  orderReference: optionalText(80),
  notes: optionalText(500),
  idempotencyKey: idempotencyKeySchema,
});

export async function shipStock(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("inventory.ship");
  const header = shipmentSchema.safeParse(Object.fromEntries(formData));
  if (!header.success) return validationError(header.error);
  const lines = parseLines(formData, shipmentLineSchema);
  if (!lines.success) return linesError(lines.error);

  return runMovement(() =>
    transaction(async (tx): Promise<FormState> => {
      if (!(await claimIdempotencyKey(tx, header.data.idempotencyKey, "inventory.ship", user.id))) return ALREADY_RECORDED;

      // Several lines may draw from the same lot, so check the combined quantity per lot.
      const demand = new Map<string, { itemId: number; locationId: number; batchNumber: string; qty: number }>();
      for (const line of lines.data) {
        const key = `${line.itemId}|${line.locationId}|${line.batchNumber}`;
        const entry = demand.get(key) ?? { ...line, qty: 0 };
        entry.qty += line.qty;
        demand.set(key, entry);
      }
      for (const d of demand.values()) {
        const item = await itemLabel(tx, d.itemId);
        const location = await assertLocationActive(tx, d.locationId);
        await assertNotHeld(tx, d.itemId, d.batchNumber, item.sku);
        await assertAvailable(tx, d.itemId, d.locationId, d.batchNumber, d.qty, () =>
          `Not enough ${item.sku} in lot ${d.batchNumber} at ${location.code} to ship ${formatQty(d.qty, item.uom)}.`,
        );
      }

      const shipmentNumber = await nextDocumentNumber(tx, "shipments", "shipment_number", "SHP");
      const { lastID: shipmentId } = await tx.run(
        "INSERT INTO shipments (shipment_number, customer_name, order_reference, notes, shipped_by) VALUES (?, ?, ?, ?, ?)",
        [shipmentNumber, header.data.customerName, header.data.orderReference, header.data.notes, user.id],
      );
      for (const line of lines.data) {
        await postTxn(tx, {
          itemId: line.itemId,
          locationId: line.locationId,
          batchNumber: line.batchNumber,
          qtyChangeMilli: -line.qty,
          txnType: "SHIPMENT",
          referenceType: "shipment",
          referenceId: shipmentId,
          userId: user.id,
        });
      }

      await writeAudit(
        {
          userId: user.id,
          action: "inventory.ship",
          entityType: "shipment",
          entityId: shipmentId,
          details: { shipmentNumber, customer: header.data.customerName, lines: lines.data.length },
        },
        tx,
      );
      return { status: "success", message: `Shipment ${shipmentNumber} recorded.` };
    }),
  );
}

// ---------------------------------------------------------------- Transfers

const transferSchema = z
  .object({
    itemId: idSchema,
    batchNumber: batchSchema.refine((v) => v.length > 0, "Choose a lot."),
    fromLocationId: idSchema,
    toLocationId: idSchema,
    qty: qtyMilliSchema(),
    notes: optionalText(300),
    idempotencyKey: idempotencyKeySchema,
  })
  .refine((d) => d.fromLocationId !== d.toLocationId, {
    message: "Choose a different destination.",
    path: ["toLocationId"],
  });

export async function transferStock(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("inventory.transfer");
  const parsed = transferSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const t = parsed.data;

  return runMovement(() =>
    transaction(async (tx): Promise<FormState> => {
      if (!(await claimIdempotencyKey(tx, t.idempotencyKey, "inventory.transfer", user.id))) return ALREADY_RECORDED;
      const item = await itemLabel(tx, t.itemId);
      const from = await assertLocationActive(tx, t.fromLocationId);
      const to = await assertLocationActive(tx, t.toLocationId);
      await assertAvailable(tx, t.itemId, t.fromLocationId, t.batchNumber, t.qty, () =>
        `Only part of ${formatQty(t.qty, item.uom)} of lot ${t.batchNumber} is at ${from.code}.`,
      );

      const { lastID: transferId } = await tx.run(
        `INSERT INTO transfers (item_id, batch_number, from_location_id, to_location_id, qty_milli, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [t.itemId, t.batchNumber, t.fromLocationId, t.toLocationId, t.qty, t.notes, user.id],
      );
      const common = { itemId: t.itemId, batchNumber: t.batchNumber, referenceType: "transfer", referenceId: transferId, notes: t.notes, userId: user.id };
      await postTxn(tx, { ...common, locationId: t.fromLocationId, qtyChangeMilli: -t.qty, txnType: "TRANSFER_OUT" });
      await postTxn(tx, { ...common, locationId: t.toLocationId, qtyChangeMilli: t.qty, txnType: "TRANSFER_IN" });

      await writeAudit(
        {
          userId: user.id,
          action: "inventory.transfer",
          entityType: "transfer",
          entityId: transferId,
          details: { sku: item.sku, lot: t.batchNumber, from: from.code, to: to.code, qty_milli: t.qty },
        },
        tx,
      );
      return { status: "success", message: `Moved ${formatQty(t.qty, item.uom)} of ${item.sku} from ${from.code} to ${to.code}.` };
    }),
  );
}

// ---------------------------------------------------------------- Adjustments

const REASON_VALUES = ADJUSTMENT_REASONS.map((r) => r.value) as [string, ...string[]];

const adjustmentSchema = z.object({
  itemId: idSchema,
  locationId: idSchema,
  batchNumber: batchSchema,
  direction: z.enum(["increase", "decrease"], "Choose increase or decrease."),
  qty: qtyMilliSchema(),
  reasonCode: z.enum(REASON_VALUES, "Choose a reason."),
  notes: optionalText(500),
  idempotencyKey: idempotencyKeySchema,
});

/** Applies an approved adjustment to the ledger and marks the request approved. */
async function applyAdjustment(
  tx: Executor,
  request: { id: number; item_id: number; location_id: number; batch_number: string; qty_change_milli: number; reason_code: string; notes: string | null },
  reviewerId: number,
  reviewNotes: string | null,
) {
  const item = await itemLabel(tx, request.item_id);
  const location = await assertLocationActive(tx, request.location_id);
  if (request.qty_change_milli < 0) {
    await assertAvailable(tx, request.item_id, request.location_id, request.batch_number, -request.qty_change_milli, () =>
      `Lot ${request.batch_number} of ${item.sku} at ${location.code} doesn't have ${formatQty(-request.qty_change_milli, item.uom)} to remove.`,
    );
  }
  const txnId = await postTxn(tx, {
    itemId: request.item_id,
    locationId: request.location_id,
    batchNumber: request.batch_number,
    qtyChangeMilli: request.qty_change_milli,
    txnType: txnTypeForReason(request.reason_code),
    referenceType: "adjustment",
    referenceId: request.id,
    notes: request.notes,
    userId: reviewerId,
  });
  await tx.run(
    "UPDATE adjustment_requests SET status = 'approved', reviewed_by = ?, reviewed_at = ?, review_notes = ?, txn_id = ? WHERE id = ?",
    [reviewerId, nowIso(), reviewNotes, txnId, request.id],
  );
  return item;
}

export async function requestAdjustment(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("inventory.adjust");
  const parsed = adjustmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const a = parsed.data;
  if (a.direction === "decrease" && !a.batchNumber) {
    return { status: "error", message: "Please correct the highlighted fields.", fieldErrors: { batchNumber: ["Choose the lot to reduce."] } };
  }
  const autoApprove = can(user.role, "inventory.approve");

  return runMovement(() =>
    transaction(async (tx): Promise<FormState> => {
      if (!(await claimIdempotencyKey(tx, a.idempotencyKey, "inventory.adjust", user.id))) return ALREADY_RECORDED;
      const item = await itemLabel(tx, a.itemId);
      await assertLocationActive(tx, a.locationId);

      const batchNumber = a.batchNumber || generateLotNumber();
      const qtyChange = a.direction === "increase" ? a.qty : -a.qty;
      const { lastID } = await tx.run(
        `INSERT INTO adjustment_requests (item_id, location_id, batch_number, qty_change_milli, reason_code, notes, requested_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [a.itemId, a.locationId, batchNumber, qtyChange, a.reasonCode, a.notes, user.id],
      );
      await writeAudit(
        {
          userId: user.id,
          action: "inventory.adjustment_requested",
          entityType: "adjustment",
          entityId: lastID,
          details: { sku: item.sku, lot: batchNumber, qty_change_milli: qtyChange, reason: a.reasonCode },
        },
        tx,
      );

      if (!autoApprove) {
        return { status: "success", message: `Adjustment for ${item.sku} submitted for approval.` };
      }
      await applyAdjustment(
        tx,
        { id: lastID, item_id: a.itemId, location_id: a.locationId, batch_number: batchNumber, qty_change_milli: qtyChange, reason_code: a.reasonCode, notes: a.notes },
        user.id,
        "Auto-approved: requested by an approver",
      );
      await writeAudit({ userId: user.id, action: "inventory.adjustment_approved", entityType: "adjustment", entityId: lastID, details: { auto: true } }, tx);
      return { status: "success", message: `Adjustment for ${item.sku} posted to the ledger.` };
    }),
  );
}

const reviewSchema = z.object({
  id: idSchema,
  decision: z.enum(["approve", "reject"]),
  reviewNotes: optionalText(500),
});

export async function reviewAdjustment(input: { id: number; decision: "approve" | "reject"; reviewNotes?: string }): Promise<FormState> {
  const user = await requirePermission("inventory.approve");
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return formError("Invalid request.");
  const { id, decision, reviewNotes } = parsed.data;

  return runMovement(() =>
    transaction(async (tx): Promise<FormState> => {
      const request = await tx.get<{
        id: number;
        item_id: number;
        location_id: number;
        batch_number: string;
        qty_change_milli: number;
        reason_code: string;
        notes: string | null;
        status: string;
        requested_by: number;
      }>(
        "SELECT id, item_id, location_id, batch_number, qty_change_milli, reason_code, notes, status, requested_by FROM adjustment_requests WHERE id = ?",
        [id],
      );
      if (!request) return formError("Adjustment not found.");
      if (request.status !== "pending") return formError("This adjustment has already been reviewed.");
      if (request.requested_by === user.id) return formError("You can't review your own adjustment request.");

      if (decision === "reject") {
        await tx.run(
          "UPDATE adjustment_requests SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, review_notes = ? WHERE id = ?",
          [user.id, nowIso(), reviewNotes, id],
        );
        await writeAudit({ userId: user.id, action: "inventory.adjustment_rejected", entityType: "adjustment", entityId: id, details: { notes: reviewNotes } }, tx);
        return { status: "success", message: "Adjustment rejected." };
      }

      const item = await applyAdjustment(tx, request, user.id, reviewNotes);
      await writeAudit({ userId: user.id, action: "inventory.adjustment_approved", entityType: "adjustment", entityId: id }, tx);
      return { status: "success", message: `Adjustment for ${item.sku} approved and posted.` };
    }),
  );
}

/** Flattens line-level validation errors into "lines.<index>.<field>" keys plus a summary message. */
function linesError(error: z.ZodError): FormState {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? `lines.${issue.path.join(".")}` : "lines";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { status: "error", message: "Some lines need attention.", fieldErrors };
}
