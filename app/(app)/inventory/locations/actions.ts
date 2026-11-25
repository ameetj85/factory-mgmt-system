"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/dal";
import { nowIso, transaction } from "@/lib/db/client";
import { formError, idSchema, optionalText, validationError, type FormState } from "@/lib/forms";

const locationSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Enter a code.")
    .max(20, "Use at most 20 characters.")
    .regex(/^[A-Za-z0-9._-]+$/, "Use letters, numbers, dots, dashes or underscores.")
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(2, "Enter a name.").max(80, "Use at most 80 characters."),
  description: optionalText(300),
});

const CODE_TAKEN: FormState = {
  status: "error",
  message: "Please correct the highlighted fields.",
  fieldErrors: { code: ["That code is already in use."] },
};

export async function createLocation(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("locations.manage");
  const parsed = locationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const { code, name, description } = parsed.data;

  const result = await transaction(async (tx): Promise<FormState> => {
    if (await tx.get("SELECT id FROM locations WHERE code = ?", [code])) return CODE_TAKEN;
    const { lastID } = await tx.run("INSERT INTO locations (code, name, description) VALUES (?, ?, ?)", [code, name, description]);
    await writeAudit({ userId: user.id, action: "location.create", entityType: "location", entityId: lastID, details: { code, name } }, tx);
    return { status: "success", message: `Location ${code} created.` };
  });

  if (result.status === "success") refresh();
  return result;
}

export async function updateLocation(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("locations.manage");
  const parsed = locationSchema.extend({ id: idSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const { id, code, name, description } = parsed.data;

  const result = await transaction(async (tx): Promise<FormState> => {
    const before = await tx.get<{ code: string; name: string; description: string | null }>(
      "SELECT code, name, description FROM locations WHERE id = ?",
      [id],
    );
    if (!before) return formError("Location not found.");
    if (await tx.get("SELECT id FROM locations WHERE code = ? AND id <> ?", [code, id])) return CODE_TAKEN;
    await tx.run("UPDATE locations SET code = ?, name = ?, description = ?, updated_at = ? WHERE id = ?", [
      code,
      name,
      description,
      nowIso(),
      id,
    ]);
    await writeAudit(
      { userId: user.id, action: "location.update", entityType: "location", entityId: id, details: { before, after: { code, name, description } } },
      tx,
    );
    return { status: "success", message: `Location ${code} updated.` };
  });

  if (result.status === "success") refresh();
  return result;
}

export async function setLocationActive(locationId: number, active: boolean): Promise<FormState> {
  const user = await requirePermission("locations.manage");
  const id = idSchema.parse(locationId);

  const result = await transaction(async (tx): Promise<FormState> => {
    const location = await tx.get<{ code: string }>("SELECT code FROM locations WHERE id = ?", [id]);
    if (!location) return formError("Location not found.");
    if (!active) {
      const stock = await tx.get<{ n: number }>("SELECT COUNT(*) AS n FROM stock_levels WHERE location_id = ? AND qty_milli <> 0", [id]);
      if ((stock?.n ?? 0) > 0) return formError(`${location.code} still holds stock. Transfer it elsewhere before deactivating.`);
      const others = await tx.get<{ n: number }>("SELECT COUNT(*) AS n FROM locations WHERE is_active = 1 AND id <> ?", [id]);
      if ((others?.n ?? 0) === 0) return formError("At least one active location is required.");
    }
    await tx.run("UPDATE locations SET is_active = ?, updated_at = ? WHERE id = ?", [active ? 1 : 0, nowIso(), id]);
    await writeAudit({ userId: user.id, action: active ? "location.activate" : "location.deactivate", entityType: "location", entityId: id }, tx);
    return { status: "success", message: `${location.code} ${active ? "reactivated" : "deactivated"}.` };
  });

  if (result.status === "success") refresh();
  return result;
}
