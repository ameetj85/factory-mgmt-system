"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, OctagonAlertIcon, PlayIcon, UserIcon } from "lucide-react";
import { toast } from "sonner";
import { Elapsed } from "@/components/shop-floor/elapsed";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useIdempotencyKey } from "@/hooks/use-idempotency-key";
import { downtimeReasonLabel } from "@/lib/maintenance/constants";
import { resolveDowntime } from "@/app/(app)/maintenance/downtime/actions";

export interface OpenDowntime {
  id: number;
  reasonCode: string;
  isPlanned: boolean;
  startedAt: string;
  notes: string | null;
  reportedBy: string;
  /** Work order number of the run this stop paused, if it can still be resumed. */
  resumableWoNumber: string | null;
}

/** Shown on a stopped workstation's console: what's wrong, for how long, and the "back up" action. */
export function DowntimePanel({ downtime }: { downtime: OpenDowntime }) {
  const [notes, setNotes] = useState("");
  const [resume, setResume] = useState(Boolean(downtime.resumableWoNumber));
  const [pending, startTransition] = useTransition();
  const idempotency = useIdempotencyKey();

  const resolve = () =>
    startTransition(async () => {
      const result = await resolveDowntime({ downtimeId: downtime.id, resolutionNotes: notes, resumeRun: resume, key: idempotency.current() });
      if (result.status === "success") {
        idempotency.reset();
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    });

  const tone = downtime.isPlanned ? "warning" : "destructive";

  return (
    <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
      <section className={`rounded-2xl border-2 p-6 ${tone === "warning" ? "border-warning/60 bg-warning/10" : "border-destructive/60 bg-destructive/10"}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className={`flex items-center gap-2 text-2xl font-bold ${tone === "warning" ? "text-warning" : "text-destructive"}`}>
              <OctagonAlertIcon className="size-7" /> {downtime.isPlanned ? "In maintenance" : "Machine stopped"}
            </p>
            <p className="text-xl font-medium">{downtimeReasonLabel(downtime.reasonCode)}</p>
            <p className="text-muted-foreground flex items-center gap-1.5">
              <UserIcon className="size-4" /> Reported by {downtime.reportedBy}
            </p>
            {downtime.notes && <p className="bg-background/60 rounded-lg p-3 italic">{downtime.notes}</p>}
          </div>
          <div className="text-right">
            <p className="text-muted-foreground text-sm">Stopped for</p>
            <Elapsed since={downtime.startedAt} className={`font-mono text-5xl font-bold tabular-nums ${tone === "warning" ? "text-warning" : "text-destructive"}`} />
          </div>
        </div>
      </section>

      <section className="bg-card space-y-4 rounded-2xl border-2 p-6">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="What fixed it? (optional)" />
        {downtime.resumableWoNumber && (
          <label className="flex cursor-pointer items-center gap-3 text-base">
            <Switch checked={resume} onCheckedChange={setResume} />
            Resume production on <span className="font-mono font-semibold">{downtime.resumableWoNumber}</span>
          </label>
        )}
        <Button disabled={pending} onClick={resolve} className="bg-success hover:bg-success/90 h-20 w-full text-xl text-white">
          {pending ? <Loader2Icon className="size-6 animate-spin" /> : <PlayIcon className="size-6" />} Machine is back up
        </Button>
      </section>
    </div>
  );
}
