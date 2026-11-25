"use client";

import { useActionState, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, RulerIcon, SaveIcon, ToggleLeftIcon, Trash2Icon } from "lucide-react";
import { Field, FieldMessage, FormAlert, SubmitButton } from "@/components/forms";
import { Combobox } from "@/components/combobox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { initialFormState } from "@/lib/forms";
import type { ItemOption } from "@/lib/inventory/queries";
import { STAGE_LABELS, STAGES, type CriterionType, type Stage } from "@/lib/quality/constants";
import { cn } from "@/lib/utils";
import { saveChecklist } from "./actions";

export interface EditorCriterion {
  label: string;
  type: CriterionType;
  unit: string;
  target: string;
  min: string;
  max: string;
  critical: boolean;
  instructions: string;
}

const blank = (type: CriterionType): EditorCriterion => ({ label: "", type, unit: "", target: "", min: "", max: "", critical: false, instructions: "" });

export function ChecklistEditor({
  id,
  name,
  description,
  stage: initialStage,
  itemId: initialItem,
  criteria: initialCriteria,
  items,
}: {
  id?: number;
  name?: string;
  description?: string;
  stage?: Stage;
  itemId?: string;
  criteria: EditorCriterion[];
  items: ItemOption[];
}) {
  const [stage, setStage] = useState<Stage>(initialStage ?? "RECEIVING");
  const [itemId, setItemId] = useState(initialItem ?? "any");
  const [rows, setRows] = useState(() => (initialCriteria.length ? initialCriteria : [blank("PASS_FAIL")]).map((value, key) => ({ key, value })));

  const [state, action, pending] = useActionState(async (prev: typeof initialFormState, formData: FormData) => {
    if (id) formData.set("id", String(id));
    formData.set("stage", stage);
    formData.set("itemId", itemId);
    formData.set("criteria", JSON.stringify(rows.map((r) => r.value)));
    return saveChecklist(prev, formData);
  }, initialFormState);
  const errors = state.fieldErrors ?? {};
  const err = (i: number, f: string) => errors[`criteria.${i}.${f}`];
  const update = (key: number, patch: Partial<EditorCriterion>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, value: { ...r.value, ...patch } } : r)));
  const add = (type: CriterionType) => setRows((rs) => [...rs, { key: rs.length ? Math.max(...rs.map((r) => r.key)) + 1 : 0, value: blank(type) }]);
  const move = (index: number, delta: number) =>
    setRows((rs) => {
      const next = [...rs];
      const [row] = next.splice(index, 1);
      next.splice(index + delta, 0, row);
      return next;
    });

  return (
    <form action={action} className="space-y-6">
      <FormAlert state={state} />
      <Card>
        <CardHeader>
          <CardTitle>Checklist</CardTitle>
          <CardDescription>When it&apos;s used and which items it applies to.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field name="name" label="Name" defaultValue={name} placeholder="e.g. Incoming steel sheet" required errors={errors.name} />
            <Field name="description" label="Description" defaultValue={description} placeholder="Optional" errors={errors.description} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Stage</Label>
              <div className="grid grid-cols-3 gap-2">
                {STAGES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStage(s)}
                    className={cn(
                      "h-10 rounded-lg border text-sm font-medium transition-all",
                      stage === s ? "border-primary bg-primary/10 text-primary ring-primary/30 ring-2" : "text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    {STAGE_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Applies to</Label>
              <Combobox
                value={itemId}
                onChange={setItemId}
                searchPlaceholder="Search SKU or name…"
                options={[{ value: "any", label: "Any item" }, ...items.map((i) => ({ value: String(i.id), label: `${i.sku} — ${i.name}`, keywords: [i.sku, i.name] }))]}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Checks</CardTitle>
          <CardDescription>A failed critical check puts the lot on quality hold automatically.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <FieldMessage id="criteria" errors={errors.criteria} />
          {rows.map((row, i) => {
            const c = row.value;
            return (
              <div key={row.key} className={cn("hover:border-primary/30 space-y-3 rounded-xl border p-4 transition-colors", c.critical && "border-destructive/30")}>
                <div className="flex items-start gap-3">
                  <span className="bg-primary/10 text-primary mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg">
                    {c.type === "MEASUREMENT" ? <RulerIcon className="size-4" /> : <ToggleLeftIcon className="size-4" />}
                  </span>
                  <div className="grid flex-1 gap-1.5">
                    <Input
                      value={c.label}
                      onChange={(e) => update(row.key, { label: e.target.value })}
                      placeholder={c.type === "MEASUREMENT" ? "e.g. Sheet thickness" : "e.g. Free of rust and dents"}
                      aria-label="Check"
                      className="h-10"
                      aria-invalid={err(i, "label") ? true : undefined}
                    />
                    <FieldMessage id={`c-${row.key}`} errors={err(i, "label")} />
                  </div>
                  <div className="flex gap-1">
                    <Button type="button" variant="ghost" size="icon" className="hover:text-primary size-10" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                      <ArrowUpIcon />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="hover:text-primary size-10" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                      <ArrowDownIcon />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="hover:bg-destructive/10 hover:text-destructive size-10"
                      disabled={rows.length === 1}
                      onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
                      aria-label="Remove check"
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                </div>
                {c.type === "MEASUREMENT" && (
                  <div className="grid gap-3 pl-11 sm:grid-cols-4">
                    {(["min", "target", "max"] as const).map((f) => (
                      <div key={f} className="grid gap-1">
                        <Label className="text-muted-foreground text-xs capitalize">{f}</Label>
                        <Input
                          value={c[f]}
                          onChange={(e) => update(row.key, { [f]: e.target.value })}
                          inputMode="decimal"
                          className="h-10 tabular-nums"
                          placeholder={f === "target" ? "optional" : ""}
                          aria-invalid={err(i, f) ? true : undefined}
                        />
                        <FieldMessage id={`${f}-${row.key}`} errors={err(i, f)} />
                      </div>
                    ))}
                    <div className="grid gap-1">
                      <Label className="text-muted-foreground text-xs">Unit</Label>
                      <Input value={c.unit} onChange={(e) => update(row.key, { unit: e.target.value })} placeholder="mm" className="h-10" />
                    </div>
                  </div>
                )}
                <div className="flex flex-col gap-3 pl-11 sm:flex-row sm:items-center">
                  <Textarea
                    value={c.instructions}
                    onChange={(e) => update(row.key, { instructions: e.target.value })}
                    rows={1}
                    placeholder="How to check (optional)"
                    className="min-h-10 flex-1"
                  />
                  <label className="text-destructive flex cursor-pointer items-center gap-2 text-sm font-medium">
                    <Switch checked={c.critical} onCheckedChange={(critical) => update(row.key, { critical })} />
                    Critical
                  </label>
                </div>
              </div>
            );
          })}
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" className="hover:border-primary/50 hover:text-primary border-dashed" onClick={() => add("PASS_FAIL")}>
              <PlusIcon /> Pass / fail check
            </Button>
            <Button type="button" variant="outline" className="hover:border-primary/50 hover:text-primary border-dashed" onClick={() => add("MEASUREMENT")}>
              <PlusIcon /> Measurement
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <SubmitButton pending={pending} pendingText="Saving…" className="shadow-md shadow-primary/25">
          <SaveIcon /> {id ? "Save checklist" : "Create checklist"}
        </SubmitButton>
      </div>
    </form>
  );
}
