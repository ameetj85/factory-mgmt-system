"use client";

import { useActionState, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { FieldMessage, FormAlert, SubmitButton } from "@/components/forms";
import { ItemPicker } from "@/components/inventory/pickers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { initialFormState } from "@/lib/forms";
import type { ItemOption } from "@/lib/inventory/queries";
import type { WorkstationOption } from "@/lib/production/queries";
import { saveBom } from "./actions";

export interface EditorLine {
  componentId: string;
  qty: string;
  scrapPct: string;
}

export interface EditorStep {
  workstationId: string;
  operationName: string;
  cycleSeconds: string;
  setupMinutes: string;
}

interface Keyed<T> {
  key: number;
  value: T;
}

const blankLine: EditorLine = { componentId: "", qty: "", scrapPct: "0" };
const blankStep: EditorStep = { workstationId: "", operationName: "", cycleSeconds: "", setupMinutes: "0" };

function keyed<T>(values: T[]): Keyed<T>[] {
  return values.map((value, key) => ({ key, value }));
}

function nextKey<T>(rows: Keyed<T>[]) {
  return rows.length ? Math.max(...rows.map((r) => r.key)) + 1 : 0;
}

export function BomEditor({
  bomId,
  itemId: initialItemId,
  lockItem,
  notes,
  lines: initialLines,
  steps: initialSteps,
  parents,
  components,
  workstations,
  submitLabel,
}: {
  bomId?: number;
  itemId?: string;
  lockItem?: boolean;
  notes?: string;
  lines: EditorLine[];
  steps: EditorStep[];
  parents: ItemOption[];
  components: ItemOption[];
  workstations: WorkstationOption[];
  submitLabel: string;
}) {
  const [itemId, setItemId] = useState(initialItemId ?? "");
  const [lines, setLines] = useState(() => keyed(initialLines.length ? initialLines : [blankLine]));
  const [steps, setSteps] = useState(() => keyed(initialSteps));
  const [activate, setActivate] = useState(true);

  const [state, action, pending] = useActionState(async (prev: typeof initialFormState, formData: FormData) => {
    formData.set("itemId", itemId);
    formData.set("activate", String(activate));
    if (bomId) formData.set("bomId", String(bomId));
    formData.set("lines", JSON.stringify(lines.map((l) => l.value)));
    formData.set("steps", JSON.stringify(steps.map((s) => s.value)));
    return saveBom(prev, formData);
  }, initialFormState);

  const errors = state.fieldErrors ?? {};
  const err = (prefix: string, i: number, field: string) => errors[`${prefix}.${i}.${field}`];
  const uomFor = (id: string) => components.find((c) => String(c.id) === id)?.uom;
  const parent = parents.find((p) => String(p.id) === itemId);

  const updateLine = (key: number, patch: Partial<EditorLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, value: { ...l.value, ...patch } } : l)));
  const updateStep = (key: number, patch: Partial<EditorStep>) =>
    setSteps((ss) => ss.map((s) => (s.key === key ? { ...s, value: { ...s.value, ...patch } } : s)));
  const moveStep = (index: number, delta: number) =>
    setSteps((ss) => {
      const next = [...ss];
      const [row] = next.splice(index, 1);
      next.splice(index + delta, 0, row);
      return next;
    });

  return (
    <form action={action} className="space-y-6">
      <FormAlert state={state} />

      <Card>
        <CardHeader>
          <CardTitle>What this recipe makes</CardTitle>
          <CardDescription>Choose a sub-assembly or finished good. Quantities below are per one {parent?.uom ?? "unit"}.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
          <div className="grid gap-1.5">
            <Label htmlFor="bom-item">Item</Label>
            {lockItem ? (
              <div className="bg-muted/50 flex h-10 items-center rounded-lg border px-3 text-sm">
                <span className="font-mono font-medium">{parent?.sku}</span>
                <span className="text-muted-foreground ml-2 truncate">{parent?.name}</span>
              </div>
            ) : (
              <ItemPicker id="bom-item" items={parents} value={itemId} onChange={setItemId} />
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bom-notes">Notes</Label>
            <Textarea id="bom-notes" name="notes" rows={1} defaultValue={notes} placeholder="Optional" className="min-h-10" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Components</CardTitle>
          <CardDescription>Exact quantity of each material per unit, plus an allowance for expected waste.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <FieldMessage id="lines" errors={errors.lines} />
          <div className="text-muted-foreground hidden grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto] gap-3 px-3 text-xs font-medium md:grid">
            <span>Component</span>
            <span>Qty per unit</span>
            <span>Scrap allowance</span>
            <span className="w-10" />
          </div>
          {lines.map((line, i) => (
            <div
              key={line.key}
              className="hover:border-primary/30 grid gap-3 rounded-xl border p-3 transition-colors md:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto] md:items-start"
            >
              <div className="grid gap-1.5">
                <ItemPicker
                  items={components.filter((c) => String(c.id) !== itemId)}
                  value={line.value.componentId}
                  onChange={(componentId) => updateLine(line.key, { componentId })}
                  invalid={Boolean(err("lines", i, "componentId"))}
                />
                <FieldMessage id={`line-${line.key}`} errors={err("lines", i, "componentId") && ["Choose a component."]} />
              </div>
              <div className="grid gap-1.5">
                <div className="relative">
                  <Input
                    value={line.value.qty}
                    onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                    inputMode="decimal"
                    placeholder="Qty"
                    aria-label="Quantity per unit"
                    className="h-10 pr-12 tabular-nums"
                    aria-invalid={err("lines", i, "qty") ? true : undefined}
                  />
                  <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs">
                    {uomFor(line.value.componentId)}
                  </span>
                </div>
                <FieldMessage id={`qty-${line.key}`} errors={err("lines", i, "qty")} />
              </div>
              <div className="grid gap-1.5">
                <div className="relative">
                  <Input
                    value={line.value.scrapPct}
                    onChange={(e) => updateLine(line.key, { scrapPct: e.target.value })}
                    inputMode="decimal"
                    aria-label="Scrap allowance percent"
                    className="h-10 pr-8 tabular-nums"
                    aria-invalid={err("lines", i, "scrapPct") ? true : undefined}
                  />
                  <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs">%</span>
                </div>
                <FieldMessage id={`scrap-${line.key}`} errors={err("lines", i, "scrapPct")} />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="hover:bg-destructive/10 hover:text-destructive size-10 justify-self-end"
                disabled={lines.length === 1}
                onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}
                aria-label="Remove component"
              >
                <Trash2Icon />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="hover:border-primary/50 hover:text-primary w-full border-dashed"
            onClick={() => setLines((ls) => [...ls, { key: nextKey(ls), value: blankLine }])}
          >
            <PlusIcon /> Add component
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Routing</CardTitle>
          <CardDescription>
            Operations in order. The ideal cycle time is the fastest a workstation can make one unit and is used for OEE performance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {workstations.length === 0 && (
            <p className="text-muted-foreground text-sm">Add workstations first to define a routing.</p>
          )}
          {steps.map((step, i) => (
            <div
              key={step.key}
              className="hover:border-primary/30 grid gap-3 rounded-xl border p-3 transition-colors md:grid-cols-[auto_minmax(0,1.2fr)_minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_auto] md:items-start"
            >
              <div className="flex items-center gap-1 md:flex-col">
                <span className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg text-xs font-semibold tabular-nums">
                  {(i + 1) * 10}
                </span>
              </div>
              <div className="grid gap-1.5">
                <Select value={step.value.workstationId} onValueChange={(workstationId) => updateStep(step.key, { workstationId })}>
                  <SelectTrigger className="h-10 w-full" aria-invalid={err("steps", i, "workstationId") ? true : undefined}>
                    <SelectValue placeholder="Workstation" />
                  </SelectTrigger>
                  <SelectContent>
                    {workstations.map((w) => (
                      <SelectItem key={w.id} value={String(w.id)}>
                        <span className="font-mono">{w.code}</span>
                        <span className="text-muted-foreground">{w.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldMessage id={`ws-${step.key}`} errors={err("steps", i, "workstationId") && ["Choose a workstation."]} />
              </div>
              <div className="grid gap-1.5">
                <Input
                  value={step.value.operationName}
                  onChange={(e) => updateStep(step.key, { operationName: e.target.value })}
                  placeholder="Operation, e.g. Cut to length"
                  aria-label="Operation name"
                  className="h-10"
                  aria-invalid={err("steps", i, "operationName") ? true : undefined}
                />
                <FieldMessage id={`op-${step.key}`} errors={err("steps", i, "operationName")} />
              </div>
              <div className="grid gap-1.5">
                <div className="relative">
                  <Input
                    value={step.value.cycleSeconds}
                    onChange={(e) => updateStep(step.key, { cycleSeconds: e.target.value })}
                    inputMode="decimal"
                    placeholder="Cycle"
                    aria-label="Ideal cycle time in seconds"
                    className="h-10 pr-14 tabular-nums"
                    aria-invalid={err("steps", i, "cycleSeconds") ? true : undefined}
                  />
                  <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs">s/unit</span>
                </div>
                <FieldMessage id={`cycle-${step.key}`} errors={err("steps", i, "cycleSeconds")} />
              </div>
              <div className="grid gap-1.5">
                <div className="relative">
                  <Input
                    value={step.value.setupMinutes}
                    onChange={(e) => updateStep(step.key, { setupMinutes: e.target.value })}
                    inputMode="numeric"
                    aria-label="Setup time in minutes"
                    className="h-10 pr-16 tabular-nums"
                    aria-invalid={err("steps", i, "setupMinutes") ? true : undefined}
                  />
                  <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs">min setup</span>
                </div>
                <FieldMessage id={`setup-${step.key}`} errors={err("steps", i, "setupMinutes")} />
              </div>
              <div className="flex justify-end gap-1">
                <Button type="button" variant="ghost" size="icon" className="hover:text-primary size-10" disabled={i === 0} onClick={() => moveStep(i, -1)} aria-label="Move up">
                  <ArrowUpIcon />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="hover:text-primary size-10"
                  disabled={i === steps.length - 1}
                  onClick={() => moveStep(i, 1)}
                  aria-label="Move down"
                >
                  <ArrowDownIcon />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="hover:bg-destructive/10 hover:text-destructive size-10"
                  onClick={() => setSteps((ss) => ss.filter((s) => s.key !== step.key))}
                  aria-label="Remove step"
                >
                  <Trash2Icon />
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={workstations.length === 0}
            className="hover:border-primary/50 hover:text-primary w-full border-dashed"
            onClick={() => setSteps((ss) => [...ss, { key: nextKey(ss), value: blankStep }])}
          >
            <PlusIcon /> Add operation
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse items-stretch justify-between gap-4 sm:flex-row sm:items-center">
        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <Switch checked={activate} onCheckedChange={setActivate} />
          <span>
            Make this the active recipe
            <span className="text-muted-foreground block text-xs">New work orders use the active version.</span>
          </span>
        </label>
        <SubmitButton pending={pending} pendingText="Saving…" className="shadow-md shadow-primary/25">
          <SaveIcon /> {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}
