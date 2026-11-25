"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/dal";
import { nowIso, transaction } from "@/lib/db/client";
import { formError, idSchema, optionalText, validationError, type FormState } from "@/lib/forms";

const workstationSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Enter a code.")
    .max(20, "Use at most 20 characters.")
    .regex(/^[A-Za-z0-9._-]+$/, "Use letters, numbers, dots, dashes or underscores.")
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(2, "Enter a name.").max(80, "Use at most 80 characters."),
  description: optionalText(300),
  hourlyCapacity: z
    .string()
    .default("")
    .transform((v, ctx) => {
      const value = v.trim();
      if (value === "") return null;
      if (!/^\d+$/.test(value) || Number(value) <= 0) {
        ctx.addIssue({ code: "custom", message: "Enter a whole number of units per hour." });
        return z.NEVER;
      }
      return Number(value);
    }),
});

const CODE_TAKEN: FormState = {
  status: "error",
  message: "Please correct the highlighted fields.",
  fieldErrors: { code: ["That code is already in use."] },
};

export async function createWorkstation(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("workstations.manage");
  const parsed = workstationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const w = parsed.data;

  const result = await transaction(async (tx): Promise<FormState> => {
    if (await tx.get("SELECT id FROM workstations WHERE code = ?", [w.code])) return CODE_TAKEN;
    const { lastID } = await tx.run("INSERT INTO workstations (code, name, description, hourly_capacity) VALUES (?, ?, ?, ?)", [
      w.code,
      w.name,
      w.description,
      w.hourlyCapacity,
    ]);
    await writeAudit({ userId: user.id, action: "workstation.create", entityType: "workstation", entityId: lastID, details: { code: w.code, name: w.name } }, tx);
    return { status: "success", message: `Workstation ${w.code} created.` };
  });
  if (result.status === "success") refresh();
  return result;
}

export async function updateWorkstation(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("workstations.manage");
  const parsed = workstationSchema.extend({ id: idSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const { id, ...w } = parsed.data;

  const result = await transaction(async (tx): Promise<FormState> => {
    const before = await tx.get<Record<string, unknown>>("SELECT code, name, description, hourly_capacity FROM workstations WHERE id = ?", [id]);
    if (!before) return formError("Workstation not found.");
    if (await tx.get("SELECT id FROM workstations WHERE code = ? AND id <> ?", [w.code, id])) return CODE_TAKEN;
    await tx.run("UPDATE workstations SET code = ?, name = ?, description = ?, hourly_capacity = ?, updated_at = ? WHERE id = ?", [
      w.code,
      w.name,
      w.description,
      w.hourlyCapacity,
      nowIso(),
      id,
    ]);
    await writeAudit(
      { userId: user.id, action: "workstation.update", entityType: "workstation", entityId: id, details: { before, after: { code: w.code, name: w.name, description: w.description, hourly_capacity: w.hourlyCapacity } } },
      tx,
    );
    return { status: "success", message: `Workstation ${w.code} updated.` };
  });
  if (result.status === "success") refresh();
  return result;
}

export async function setWorkstationActive(workstationId: number, active: boolean): Promise<FormState> {
  const user = await requirePermission("workstations.manage");
  const id = idSchema.parse(workstationId);

  const result = await transaction(async (tx): Promise<FormState> => {
    const ws = await tx.get<{ code: string }>("SELECT code FROM workstations WHERE id = ?", [id]);
    if (!ws) return formError("Workstation not found.");
    if (!active) {
      const open = await tx.get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM work_orders WHERE workstation_id = ? AND status IN ('RELEASED', 'IN_PROGRESS', 'ON_HOLD')",
        [id],
      );
      if ((open?.n ?? 0) > 0) return formError(`${ws.code} has open work orders. Complete or reassign them first.`);
    }
    await tx.run("UPDATE workstations SET is_active = ?, updated_at = ? WHERE id = ?", [active ? 1 : 0, nowIso(), id]);
    await writeAudit({ userId: user.id, action: active ? "workstation.activate" : "workstation.deactivate", entityType: "workstation", entityId: id }, tx);
    return { status: "success", message: `${ws.code} ${active ? "reactivated" : "deactivated"}.` };
  });
  if (result.status === "success") refresh();
  return result;
}
