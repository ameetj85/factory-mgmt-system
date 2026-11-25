"use client";

import { useState, useTransition } from "react";
import { HistoryIcon, Loader2Icon, PlayIcon } from "lucide-react";
import { toast } from "sonner";
import { LocalTime } from "@/components/local-time";
import { Elapsed } from "@/components/shop-floor/elapsed";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useIdempotencyKey } from "@/hooks/use-idempotency-key";
import { downtimeReasonLabel, formatMinutes } from "@/lib/maintenance/constants";
import { cn } from "@/lib/utils";
import { resolveDowntime } from "./actions";

export interface DowntimeRow {
  id: number;
  workstationCode: string;
  reasonCode: string;
  isPlanned: boolean;
  startedAt: string;
  endedAt: string | null;
  seconds: number;
  notes: string | null;
  resolutionNotes: string | null;
  isRetroactive: boolean;
  reportedBy: string;
  resolvedBy: string | null;
  canResume: boolean;
  pausedWo: string | null;
}

export function DowntimeTable({ rows }: { rows: DowntimeRow[] }) {
  const [resolving, setResolving] = useState<DowntimeRow | null>(null);
  const [notes, setNotes] = useState("");
  const [resume, setResume] = useState(true);
  const [pending, startTransition] = useTransition();
  const idempotency = useIdempotencyKey();

  const submit = () => {
    if (!resolving) return;
    startTransition(async () => {
      const result = await resolveDowntime({ downtimeId: resolving.id, resolutionNotes: notes, resumeRun: resume && resolving.canResume, key: idempotency.current() });
      if (result.status === "success") {
        idempotency.reset();
        toast.success(result.message);
        setResolving(null);
        setNotes("");
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <>
      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader className="bg-muted/60">
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">Machine</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="hidden md:table-cell">Started</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead className="hidden lg:table-cell">Notes</TableHead>
              <TableHead className="w-32 pr-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const open = !r.endedAt;
              return (
                <TableRow key={r.id} className={cn("hover:bg-accent/40 align-top transition-colors", open && "bg-destructive/[0.04]")}>
                  <TableCell className="pl-4">
                    <p className="font-mono text-sm font-medium">{r.workstationCode}</p>
                    <p className="text-muted-foreground text-xs">#{r.id}</p>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm font-medium">{downtimeReasonLabel(r.reasonCode)}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.isPlanned ? (
                        <Badge variant="outline" className="border-warning/50 text-warning h-5">
                          Planned
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-destructive/40 text-destructive h-5">
                          Unplanned
                        </Badge>
                      )}
                      {r.isRetroactive && (
                        <Badge variant="outline" className="text-muted-foreground h-5">
                          <HistoryIcon /> Logged later
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-sm md:table-cell">
                    <LocalTime iso={r.startedAt} />
                    <p className="text-xs">by {r.reportedBy}</p>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {open ? (
                      <span className="text-destructive font-semibold">
                        <Elapsed since={r.startedAt} />
                      </span>
                    ) : (
                      formatMinutes(r.seconds / 60)
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden max-w-64 text-xs lg:table-cell">
                    {r.notes && <p className="line-clamp-2">{r.notes}</p>}
                    {r.resolutionNotes && <p className="text-success line-clamp-2">Fix: {r.resolutionNotes}</p>}
                    {r.resolvedBy && !r.isRetroactive && <p>Resolved by {r.resolvedBy}</p>}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    {open && (
                      <Button size="sm" className="bg-success hover:bg-success/90 text-white" onClick={() => setResolving(r)}>
                        <PlayIcon /> Back up
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={resolving !== null} onOpenChange={(open) => !open && setResolving(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Is {resolving?.workstationCode} back up?</DialogTitle>
            <DialogDescription>{resolving && downtimeReasonLabel(resolving.reasonCode)}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="resolution">What fixed it?</Label>
            <Textarea id="resolution" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Optional" />
          </div>
          {resolving?.canResume && (
            <label className="flex cursor-pointer items-center gap-3 text-sm">
              <Switch checked={resume} onCheckedChange={setResume} />
              Resume production on <span className="font-mono font-medium">{resolving.pausedWo}</span>
            </label>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolving(null)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending} className="bg-success hover:bg-success/90 text-white">
              {pending && <Loader2Icon className="animate-spin" />} Mark as back up
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
