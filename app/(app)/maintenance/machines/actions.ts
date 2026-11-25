"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/dal";
import { nowIso, transaction } from "@/lib/db/client";
import { formError, idSchema, optionalCentsSchema, optionalText, validationError, type FormState } from "@/lib/forms";

const assetSchema = z.object({
  id: idSchema,
  assetTag: optionalText(40),
  manufacturer: optionalText(80),
  model: optionalText(80),
  serialNumber: optionalText(80),
  installDate: z
    .string()
    .default("")
    .transform((v, ctx) => {
      const value = v.trim();
      if (!value) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        ctx.addIssue({ code: "custom", message: "Enter a valid date." });
        return z.NEVER;
      }
      return value;
    }),
  hourlyRate: optionalCentsSchema,
  runtimeOffsetHours: z
    .string()
    .default("0")
    .transform((v, ctx) => {
      const value = v.trim() || "0";
      if (!/^\d+(\.\d)?$/.test(value)) {
        ctx.addIssue({ code: "custom", message: "Enter hours, e.g. 1250 or 1250.5." });
        return z.NEVER;
      }
      return Math.round(Number(value) * 3600);
    }),
});

export async function updateMachineAsset(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("maintenance.manage");
  const parsed = assetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const a = parsed.data;

  const result = await transaction(async (tx): Promise<FormState> => {
    const ws = await tx.get<Record<string, unknown> & { code: string }>(
      "SELECT code, asset_tag, manufacturer, model, serial_number, install_date, hourly_rate_cents, runtime_offset_seconds FROM workstations WHERE id = ?",
      [a.id],
    );
    if (!ws) return formError("Machine not found.");
    await tx.run(
      `UPDATE workstations SET asset_tag = ?, manufacturer = ?, model = ?, serial_number = ?, install_date = ?, hourly_rate_cents = ?,
              runtime_offset_seconds = ?, updated_at = ? WHERE id = ?`,
      [a.assetTag, a.manufacturer, a.model, a.serialNumber, a.installDate, a.hourlyRate, a.runtimeOffsetHours, nowIso(), a.id],
    );
    const after: Record<string, unknown> = {
      asset_tag: a.assetTag,
      manufacturer: a.manufacturer,
      model: a.model,
      serial_number: a.serialNumber,
      install_date: a.installDate,
      hourly_rate_cents: a.hourlyRate,
      runtime_offset_seconds: a.runtimeOffsetHours,
    };
    const changes = Object.fromEntries(Object.keys(after).filter((k) => ws[k] !== after[k]).map((k) => [k, { from: ws[k], to: after[k] }]));
    if (Object.keys(changes).length) {
      await writeAudit({ userId: user.id, action: "machine.update", entityType: "workstation", entityId: a.id, details: changes }, tx);
    }
    return { status: "success", message: `${ws.code} asset details saved.` };
  });

  if (result.status === "success") refresh();
  return result;
}
