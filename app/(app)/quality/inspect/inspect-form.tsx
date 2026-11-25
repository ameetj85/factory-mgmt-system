"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { AlertTriangleIcon, CheckIcon, ClipboardCheckIcon, Loader2Icon, ShieldAlertIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Combobox } from "@/components/combobox";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useIdempotencyKey } from "@/hooks/use-idempotency-key";
import { describeLimits, parseSignedMilli, STAGE_LABELS, withinLimits, type Stage } from "@/lib/quality/constants";
import type { Checklist } from "@/lib/quality/service";
import { cn } from "@/lib/utils";
import { recordInspection } from "./actions";

export interface LotChoice {
  itemId: number;
  sku: string;
  name: string;
  batchNumber: string;
}

export interface InspectContext {
  title: string | null;
  defaultStage: Stage;
  workOrderId: number | null;
  receiptId: number | null;
  lots: LotChoice[];
  fixed: boolean;
}

type Entry = { verdict: "pass" | "fail" | null; value: string; note: string };

export function InspectForm({ context, checklists }: { context: InspectContext; checklists: Checklist[] }) {
  const router = useRouter();
  const [lotKey, setLotKey] = useState(context.lots.length === 1 ? `${context.lots[0].itemId}|${context.lots[0].batchNumber}` : "");
  const lot = context.lots.find((l) => `${l.itemId}|${l.batchNumber}` === lotKey);

  const applicable = useMemo(
    () =>
      lot
        ? checklists
            .filter((c) => c.item_id === null || c.item_id === lot.itemId)
            .sort((a, b) => Number(b.stage === context.defaultStage) - Number(a.stage === context.defaultStage) || Number(b.item_id !== null) - Number(a.item_id !== null))
        : [],
    [checklists, lot, context.defaultStage],
  );
  const [templateId, setTemplateId] = useState<number | null>(null);
  const checklist = applicable.find((c) => c.id === templateId) ?? null;
  const [entries, setEntries] = useState<Record<number, Entry>>({});
  const [sampleSize, setSampleSize] = useState("1");
  const [notes, setNotes] = useState("");
  const [placeHold, setPlaceHold] = useState(true);
  const [pending, startTransition] = useTransition();
  const idempotency = useIdempotencyKey();

  const entry = (id: number): Entry => entries[id] ?? { verdict: null, value: "", note: "" };
  const setEntry = (id: number, patch: Partial<Entry>) => setEntries((e) => ({ ...e, [id]: { ...entry(id), ...patch } }));

  const evaluation = (checklist?.criteria ?? []).map((c) => {
    const e = entry(c.id);
    if (c.criterion_type === "PASS_FAIL") return { c, done: e.verdict !== null, passed: e.verdict === "pass" };
    const v = parseSignedMilli(e.value);
    return { c, done: v !== null, passed: v !== null && withinLimits(v, c.min_milli, c.max_milli) };
  });
  const complete = evaluation.length > 0 && evaluation.every((e) => e.done);
  const failed = evaluation.filter((e) => e.done && !e.passed);
  const criticalFailed = failed.some((e) => e.c.is_critical);

  const submit = () => {
    if (!lot || !checklist) return;
    startTransition(async () => {
      const result = await recordInspection({
        templateId: checklist.id,
        itemId: lot.itemId,
        batchNumber: lot.batchNumber,
        workOrderId: context.workOrderId,
        receiptId: context.receiptId,
        sampleSize: Math.max(1, Number(sampleSize) || 1),
        notes,
        placeHold: placeHold || criticalFailed,
        results: checklist.criteria.map((c) => ({ criterionId: c.id, ...entry(c.id) })),
        key: idempotency.current(),
      });
      if (result.status === "success") {
        idempotency.reset();
        if (failed.length) toast.warning(result.message);
        else toast.success(result.message);
        router.push(result.inspectionId ? `/quality/inspections/${result.inspectionId}` : "/quality/inspections");
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>1. Lot</CardTitle>
          </CardHeader>
          <CardContent>
            {context.lots.length === 0 ? (
              <p className="text-muted-foreground text-sm">There are no lots in stock to inspect.</p>
            ) : context.fixed && lot ? (
              <div className="bg-muted/50 flex items-center gap-3 rounded-xl border p-4">
                <span className="font-mono text-lg font-semibold">{lot.batchNumber}</span>
                <span className="text-muted-foreground">
                  <span className="font-mono">{lot.sku}</span> · {lot.name}
                </span>
              </div>
            ) : (
              <Combobox
                value={lotKey}
                onChange={(v) => {
                  setLotKey(v);
                  setTemplateId(null);
                  setEntries({});
                }}
                placeholder="Choose the lot you're inspecting"
                searchPlaceholder="Search lot, SKU or name…"
                options={context.lots.map((l) => ({
                  value: `${l.itemId}|${l.batchNumber}`,
                  label: `${l.batchNumber} — ${l.sku}`,
                  description: l.name,
                  keywords: [l.batchNumber, l.sku, l.name],
                }))}
              />
            )}
          </CardContent>
        </Card>

        {lot && (
          <Card>
            <CardHeader>
              <CardTitle>2. Checklist</CardTitle>
              <CardDescription>Checklists for {lot.sku} or for any item.</CardDescription>
            </CardHeader>
            <CardContent>
              {applicable.length === 0 ? (
                <EmptyState icon={ClipboardCheckIcon} title="No checklist applies" description="A quality manager can create one under Quality → Checklists." />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {applicable.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setTemplateId(c.id);
                        setEntries({});
                      }}
                      className={cn(
                        "min-h-20 rounded-xl border-2 p-4 text-left transition-all",
                        templateId === c.id ? "border-primary bg-primary/5 shadow-primary/10 shadow-md" : "hover:border-primary/40",
                      )}
                    >
                      <p className="font-medium">{c.name}</p>
                      <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                        <Badge variant="secondary" className="h-5">
                          {STAGE_LABELS[c.stage]}
                        </Badge>
                        {c.criteria.length} checks{c.item_sku ? ` · ${c.item_sku} only` : ""}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {checklist && (
          <Card>
            <CardHeader>
              <CardTitle>3. Checks</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {evaluation.map(({ c, done, passed }) => {
                const e = entry(c.id);
                return (
                  <div
                    key={c.id}
                    className={cn(
                      "rounded-xl border-2 p-4 transition-colors",
                      done && passed && "border-success/40 bg-success/[0.04]",
                      done && !passed && "border-destructive/50 bg-destructive/[0.05]",
                    )}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0 space-y-1">
                        <p className="flex items-center gap-2 font-medium">
                          {c.label}
                          {c.is_critical === 1 && (
                            <Badge variant="outline" className="border-destructive/40 text-destructive h-5">
                              Critical
                            </Badge>
                          )}
                        </p>
                        {c.criterion_type === "MEASUREMENT" && <p className="text-muted-foreground text-sm">Limits: {describeLimits(c)}</p>}
                        {c.instructions && <p className="text-muted-foreground text-xs">{c.instructions}</p>}
                      </div>
                      {c.criterion_type === "PASS_FAIL" ? (
                        <div className="grid grid-cols-2 gap-2 md:w-64">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setEntry(c.id, { verdict: "pass" })}
                            className={cn("h-14 text-base", e.verdict === "pass" ? "bg-success hover:bg-success/90 border-success text-white hover:text-white" : "hover:border-success/50 hover:text-success")}
                          >
                            <CheckIcon className="size-5" /> Pass
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setEntry(c.id, { verdict: "fail" })}
                            className={cn(
                              "h-14 text-base",
                              e.verdict === "fail" ? "bg-destructive hover:bg-destructive/90 border-destructive text-white hover:text-white" : "hover:border-destructive/50 hover:text-destructive",
                            )}
                          >
                            <XIcon className="size-5" /> Fail
                          </Button>
                        </div>
                      ) : (
                        <div className="relative md:w-64">
                          <Input
                            value={e.value}
                            onChange={(ev) => setEntry(c.id, { value: ev.target.value })}
                            inputMode="decimal"
                            placeholder="Measured value"
                            aria-label={`${c.label} measurement`}
                            className={cn("h-14 pr-24 text-xl tabular-nums", done && !passed && "border-destructive text-destructive")}
                          />
                          <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center gap-2 text-sm">
                            {c.unit}
                            {done && (passed ? <CheckIcon className="text-success size-5" /> : <XIcon className="text-destructive size-5" />)}
                          </span>
                        </div>
                      )}
                    </div>
                    {done && !passed && (
                      <Input
                        value={e.note}
                        onChange={(ev) => setEntry(c.id, { note: ev.target.value })}
                        placeholder="What did you find? (optional)"
                        className="mt-3 h-10"
                      />
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-4 xl:sticky xl:top-20 xl:h-fit">
        <Card>
          <CardHeader>
            <CardTitle>Result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!checklist ? (
              <p className="text-muted-foreground text-sm">Choose a lot and checklist to begin.</p>
            ) : (
              <>
                <div
                  className={cn(
                    "rounded-xl p-4 text-center",
                    !complete && "bg-muted",
                    complete && failed.length === 0 && "bg-success/15 text-success",
                    complete && failed.length > 0 && "bg-destructive/15 text-destructive",
                  )}
                >
                  <p className="text-3xl font-bold">{!complete ? `${evaluation.filter((e) => e.done).length}/${evaluation.length}` : failed.length ? "FAIL" : "PASS"}</p>
                  <p className="text-sm">{!complete ? "checks recorded" : failed.length ? `${failed.length} check${failed.length === 1 ? "" : "s"} failed` : "All checks passed"}</p>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="sample">Sample size</Label>
                  <Input id="sample" value={sampleSize} onChange={(e) => setSampleSize(e.target.value)} inputMode="numeric" className="h-10" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="ins-notes">Notes</Label>
                  <Textarea id="ins-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Optional" />
                </div>
                {failed.length > 0 &&
                  (criticalFailed ? (
                    <p className="border-destructive/40 bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg border p-3 text-sm">
                      <ShieldAlertIcon className="mt-0.5 size-4 shrink-0" /> A critical check failed. The lot will be put on quality hold.
                    </p>
                  ) : (
                    <label className="flex cursor-pointer items-start gap-3 text-sm">
                      <Switch checked={placeHold} onCheckedChange={setPlaceHold} className="mt-0.5" />
                      <span>
                        Put the lot on quality hold
                        <span className="text-muted-foreground block text-xs">Blocks shipping and production use until released.</span>
                      </span>
                    </label>
                  ))}
                <Button disabled={!complete || pending} onClick={submit} className="h-14 w-full text-lg shadow-md shadow-primary/25">
                  {pending ? <Loader2Icon className="size-5 animate-spin" /> : failed.length ? <AlertTriangleIcon className="size-5" /> : <CheckIcon className="size-5" />}
                  Record inspection
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
