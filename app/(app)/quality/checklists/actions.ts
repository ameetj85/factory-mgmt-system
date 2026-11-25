"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/dal";
import { nowIso, transaction } from "@/lib/db/client";
import { formError, idSchema, optionalText, type FormState } from "@/lib/forms";
import { parseSignedMilli, STAGES } from "@/lib/quality/constants";

const optionalMeasure = (label: string) =>
  z
    .string()
    .default("")
    .transform((v, ctx) => {
      if (v.trim() === "") return null;
      const milli = parseSignedMilli(v);
      if (milli === null) {
        ctx.addIssue({ code: "custom", message: `${label}: up to 3 decimals.` });
        return z.NEVER;
      }
      return milli;
    });

const criterionSchema = z
  .object({
    label: z.string().trim().min(2, "Describe the check.").max(120),
    type: z.enum(["PASS_FAIL", "MEASUREMENT"]),
    unit: z.string().trim().max(20).default("").transform((v) => v || null),
    target: optionalMeasure("Target"),
    min: optionalMeasure("Min"),
    max: optionalMeasure("Max"),
    critical: z.boolean().default(false),
    instructions: z.string().trim().max(300).default("").transform((v) => v || null),
  })
  .superRefine((c, ctx) => {
    if (c.type !== "MEASUREMENT") return;
    if (c.min === null && c.max === null) ctx.addIssue({ code: "custom", message: "Set a minimum, a maximum or both.", path: ["min"] });
    if (c.min !== null && c.max !== null && c.min > c.max) ctx.addIssue({ code: "custom", message: "Min must be at most max.", path: ["max"] });
  });

const headerSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(2, "Name the checklist.").max(80),
  description: optionalText(300),
  stage: z.enum(STAGES, "Choose when it's used."),
  itemId: z.string().default("").transform((v) => (v && v !== "any" ? Number(v) : null)),
});

export async function saveChecklist(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("quality.manage");
  const header = headerSchema.safeParse(Object.fromEntries(formData));
  if (!header.success) {
    return { status: "error", message: "Please correct the highlighted fields.", fieldErrors: z.flattenError(header.error).fieldErrors as Record<string, string[]> };
  }
  let raw: unknown = [];
  try {
    raw = JSON.parse(String(formData.get("criteria") ?? "[]"));
  } catch {
    // validated below
  }
  const criteria = z.array(criterionSchema).min(1, "Add at least one check.").max(50).safeParse(raw);
  if (!criteria.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of criteria.error.issues) (fieldErrors[issue.path.length ? `criteria.${issue.path.join(".")}` : "criteria"] ??= []).push(issue.message);
    return { status: "error", message: "Some checks need attention.", fieldErrors };
  }
  const h = header.data;

  const saved = await transaction(async (tx): Promise<number | FormState> => {
    if (h.itemId && !(await tx.get("SELECT id FROM items WHERE id = ? AND is_active = 1", [h.itemId]))) return formError("Choose an active item.");
    let id = h.id ?? null;
    if (id) {
      if (!(await tx.get("SELECT id FROM inspection_templates WHERE id = ?", [id]))) return formError("Checklist not found.");
      await tx.run("UPDATE inspection_templates SET name = ?, description = ?, stage = ?, item_id = ?, updated_at = ? WHERE id = ?", [
        h.name,
        h.description,
        h.stage,
        h.itemId,
        nowIso(),
        id,
      ]);
      // Recorded inspections keep their own copy of each criterion, so replacing these is safe.
      await tx.run("DELETE FROM inspection_criteria WHERE template_id = ?", [id]);
    } else {
      ({ lastID: id } = await tx.run("INSERT INTO inspection_templates (name, description, stage, item_id, created_by) VALUES (?, ?, ?, ?, ?)", [
        h.name,
        h.description,
        h.stage,
        h.itemId,
        user.id,
      ]));
    }
    for (const [i, c] of criteria.data.entries()) {
      await tx.run(
        `INSERT INTO inspection_criteria (template_id, sort_order, label, criterion_type, unit, target_milli, min_milli, max_milli, is_critical, instructions)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          i,
          c.label,
          c.type,
          c.type === "MEASUREMENT" ? c.unit : null,
          c.type === "MEASUREMENT" ? c.target : null,
          c.type === "MEASUREMENT" ? c.min : null,
          c.type === "MEASUREMENT" ? c.max : null,
          c.critical ? 1 : 0,
          c.instructions,
        ],
      );
    }
    await writeAudit(
      { userId: user.id, action: h.id ? "quality.checklist_update" : "quality.checklist_create", entityType: "inspection_template", entityId: id!, details: { name: h.name, stage: h.stage, criteria: criteria.data.length } },
      tx,
    );
    return id!;
  });

  if (typeof saved !== "number") return saved;
  redirect("/quality/checklists");
}

export async function setChecklistActive(templateId: number, active: boolean): Promise<FormState> {
  const user = await requirePermission("quality.manage");
  const id = idSchema.parse(templateId);
  const result = await transaction(async (tx): Promise<FormState> => {
    const t = await tx.get<{ name: string }>("SELECT name FROM inspection_templates WHERE id = ?", [id]);
    if (!t) return formError("Checklist not found.");
    await tx.run("UPDATE inspection_templates SET is_active = ?, updated_at = ? WHERE id = ?", [active ? 1 : 0, nowIso(), id]);
    await writeAudit({ userId: user.id, action: active ? "quality.checklist_activate" : "quality.checklist_deactivate", entityType: "inspection_template", entityId: id }, tx);
    return { status: "success", message: `"${t.name}" ${active ? "reactivated" : "deactivated"}.` };
  });
  if (result.status === "success") refresh();
  return result;
}
