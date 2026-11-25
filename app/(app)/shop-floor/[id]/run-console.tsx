"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCheckIcon, CheckIcon, ClipboardPenIcon, Loader2Icon, PauseIcon, PlayIcon, ShieldAlertIcon, Trash2Icon, UserIcon } from "lucide-react";
import { toast } from "sonner";
import { Elapsed } from "@/components/shop-floor/elapsed";
import { Numpad } from "@/components/shop-floor/numpad";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useIdempotencyKey } from "@/hooks/use-idempotency-key";
import type { FormState } from "@/lib/forms";
import { RUN_TYPE_LABELS, SCRAP_REASONS, type RunType } from "@/lib/production/constants";
import { formatQty } from "@/lib/quantity";
import { cn } from "@/lib/utils";
import { endRun, finishSetup, reportOutput } from "../actions";

export interface ActiveRun {
  id: number;
  runType: RunType;
  startTime: string;
  runGoodMilli: number;
  runScrapMilli: number;
  operator: string;
  isMine: boolean;
  workOrderId: number;
  woNumber: string;
  sku: string;
  itemName: string;
  uom: string;
  targetMilli: number;
  completedMilli: number;
  scrapTotalMilli: number;
  notes: string | null;
}

type Entry = "good" | "scrap" | null;

export function RunConsole({ run, downtimeButton, outputOnHold }: { run: ActiveRun; downtimeButton?: React.ReactNode; outputOnHold?: string | null }) {
  const [pending, startTransition] = useTransition();
  const [entry, setEntry] = useState<Entry>(null);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState<string | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const idempotency = useIdempotencyKey();

  const pct = Math.min(100, Math.round((run.completedMilli / run.targetMilli) * 100));
  const remaining = Math.max(0, run.targetMilli - run.completedMilli);
  const isSetup = run.runType === "SETUP";

  const submit = (fn: (key: string) => Promise<FormState>, after?: () => void) =>
    startTransition(async () => {
      const result = await fn(idempotency.current());
      if (result.status === "success") {
        idempotency.reset();
        toast.success(result.message);
        after?.();
      } else {
        toast.error(result.message);
      }
    });

  const openEntry = (kind: Exclude<Entry, null>) => {
    setValue("");
    setReason(kind === "scrap" && isSetup ? "SCRAP_SETUP" : null);
    setEntry(kind);
  };

  const sendEntry = () => {
    if (!entry || !value || Number(value) <= 0) return;
    submit(
      (key) =>
        reportOutput({
          runId: run.id,
          good: entry === "good" ? value : "0",
          scrap: entry === "scrap" ? value : "0",
          scrapReason: entry === "scrap" ? reason : null,
          key,
        }),
      () => setEntry(null),
    );
  };

  const quickGood = (n: number) => submit((key) => reportOutput({ runId: run.id, good: String(n), scrap: "0", scrapReason: null, key }));

  return (
    <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
      <section className="bg-card space-y-6 rounded-2xl border-2 border-primary/40 p-6 shadow-lg shadow-primary/10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-2xl font-bold">{run.woNumber}</span>
              <Badge className={cn("h-6 text-sm", isSetup && "bg-warning text-black")}>{RUN_TYPE_LABELS[run.runType]}</Badge>
            </div>
            <p className="text-xl">
              <span className="font-mono font-semibold">{run.sku}</span> · {run.itemName}
            </p>
            <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <UserIcon className="size-4" /> {run.operator}
              {!run.isMine && <span className="text-warning font-medium">(started by another operator)</span>}
            </p>
          </div>
          <div className="text-right">
            <p className="text-muted-foreground text-sm">Running for</p>
            <Elapsed since={run.startTime} className="text-primary font-mono text-4xl font-bold tabular-nums" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-medium">Work order progress</span>
            <span className="tabular-nums">
              <span className="text-3xl font-bold">{formatQty(run.completedMilli)}</span>
              <span className="text-muted-foreground text-lg"> / {formatQty(run.targetMilli, run.uom)}</span>
            </span>
          </div>
          <Progress value={pct} className="h-4" />
          <p className="text-muted-foreground text-sm">
            {remaining > 0 ? `${formatQty(remaining, run.uom)} to go` : "Target reached"} · {formatQty(run.scrapTotalMilli, run.uom)} scrapped so far
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-success/10 rounded-xl p-4">
            <p className="text-success text-sm font-medium">Good this run</p>
            <p className="text-success text-4xl font-bold tabular-nums">{formatQty(run.runGoodMilli)}</p>
          </div>
          <div className="bg-destructive/10 rounded-xl p-4">
            <p className="text-destructive text-sm font-medium">Scrap this run</p>
            <p className="text-destructive text-4xl font-bold tabular-nums">{formatQty(run.runScrapMilli)}</p>
          </div>
        </div>

        {run.notes && <p className="bg-muted rounded-lg p-3 text-sm italic">{run.notes}</p>}
        {outputOnHold && (
          <p className="border-destructive/40 bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg border p-3 text-sm font-medium">
            <ShieldAlertIcon className="mt-0.5 size-4 shrink-0" /> Output lot {run.woNumber} is on quality hold: {outputOnHold}
          </p>
        )}
      </section>

      <section className="space-y-3">
        {isSetup ? (
          <Button
            disabled={pending}
            onClick={() => submit((key) => finishSetup({ runId: run.id, key }))}
            className="h-24 w-full text-xl shadow-lg shadow-primary/25"
          >
            {pending ? <Loader2Icon className="size-6 animate-spin" /> : <PlayIcon className="size-6" />} Setup done — start production
          </Button>
        ) : (
          <>
            <Button
              disabled={pending}
              onClick={() => openEntry("good")}
              className="bg-success hover:bg-success/90 h-24 w-full text-xl text-white shadow-lg shadow-black/10"
            >
              <CheckIcon className="size-7" /> Report good units
            </Button>
            <div className="grid grid-cols-3 gap-3">
              {[1, 5, 10].map((n) => (
                <Button
                  key={n}
                  variant="outline"
                  disabled={pending}
                  onClick={() => quickGood(n)}
                  className="border-success/40 text-success hover:bg-success/10 hover:text-success h-16 text-xl font-bold"
                >
                  +{n}
                </Button>
              ))}
            </div>
          </>
        )}
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => openEntry("scrap")}
          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive h-20 w-full text-lg"
        >
          <Trash2Icon className="size-6" /> Report scrap
        </Button>
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => submit((key) => endRun({ runId: run.id, completeWorkOrder: false, key }))}
            className="hover:border-warning/60 hover:text-warning h-20 text-lg"
          >
            <PauseIcon className="size-6" /> Pause
          </Button>
          <Button variant="outline" disabled={pending || isSetup} onClick={() => setConfirmFinish(true)} className="hover:border-primary/60 hover:text-primary h-20 text-lg">
            <CheckCheckIcon className="size-6" /> Finish order
          </Button>
        </div>
        <Button asChild variant="outline" className="hover:border-primary/60 hover:text-primary h-16 w-full text-lg">
          <Link href={`/quality/inspect?wo=${run.workOrderId}`}>
            <ClipboardPenIcon className="size-6" /> Inspect output
          </Link>
        </Button>
        {downtimeButton}
      </section>

      <Dialog open={entry !== null} onOpenChange={(open) => !open && setEntry(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl">{entry === "good" ? "Good units" : "Scrap units"}</DialogTitle>
            <DialogDescription>
              {run.woNumber} · {run.sku} ({run.uom})
            </DialogDescription>
          </DialogHeader>
          <div
            className={cn(
              "flex h-20 items-center justify-end rounded-xl border-2 px-5 font-mono text-5xl font-bold tabular-nums",
              entry === "good" ? "border-success/50 text-success" : "border-destructive/50 text-destructive",
            )}
          >
            {value || <span className="text-muted-foreground/40">0</span>}
          </div>
          {entry === "scrap" && (
            <div className="grid grid-cols-2 gap-2">
              {SCRAP_REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setReason(r.value)}
                  className={cn(
                    "min-h-12 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-all",
                    reason === r.value ? "border-destructive bg-destructive/10 text-destructive ring-destructive/30 ring-2" : "hover:border-destructive/40",
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
          <Numpad value={value} onChange={setValue} />
          <Button
            disabled={pending || !value || Number(value) <= 0 || (entry === "scrap" && !reason)}
            onClick={sendEntry}
            className={cn("h-16 text-xl", entry === "good" ? "bg-success hover:bg-success/90 text-white" : "bg-destructive hover:bg-destructive/90 text-white")}
          >
            {pending && <Loader2Icon className="size-6 animate-spin" />}
            {entry === "scrap" && !reason ? "Choose a reason" : `Log ${value || 0} ${entry === "good" ? "good" : "scrap"}`}
          </Button>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmFinish} onOpenChange={setConfirmFinish}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl">Finish {run.woNumber}?</AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              {remaining > 0
                ? `${formatQty(remaining, run.uom)} of the target hasn't been made. Finishing closes the work order and no more output can be reported.`
                : "The target has been reached. Finishing closes the work order."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-12">Keep running</AlertDialogCancel>
            <AlertDialogAction
              className="h-12"
              onClick={(e) => {
                e.preventDefault();
                submit((key) => endRun({ runId: run.id, completeWorkOrder: true, key }), () => setConfirmFinish(false));
              }}
            >
              {pending && <Loader2Icon className="animate-spin" />} Finish work order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
