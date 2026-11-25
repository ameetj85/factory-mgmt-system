"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, ShieldCheckIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { resolveHold } from "./actions";

export function HoldActions({ holdId, batchNumber, sku, onHand }: { holdId: number; batchNumber: string; sku: string; onHand: string }) {
  const [disposition, setDisposition] = useState<"release" | "scrap" | null>(null);
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      if (!disposition) return;
      const result = await resolveHold({ holdId, disposition, notes });
      if (result.status === "success") {
        toast.success(result.message);
        setDisposition(null);
        setNotes("");
      } else {
        toast.error(result.message);
      }
    });

  return (
    <div className="flex shrink-0 gap-2">
      <Button variant="outline" className="hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive" onClick={() => setDisposition("scrap")}>
        <Trash2Icon /> Scrap lot
      </Button>
      <Button className="bg-success hover:bg-success/90 text-white" onClick={() => setDisposition("release")}>
        <ShieldCheckIcon /> Release
      </Button>
      <Dialog open={disposition !== null} onOpenChange={(open) => !open && setDisposition(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{disposition === "release" ? `Release lot ${batchNumber}?` : `Scrap lot ${batchNumber}?`}</DialogTitle>
            <DialogDescription>
              {disposition === "release"
                ? `${sku} from this lot can be shipped and used in production again.`
                : `The remaining ${onHand} of ${sku} in this lot will be written off as scrap at every location.`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="hold-notes">Disposition notes</Label>
            <Textarea
              id="hold-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={disposition === "release" ? "e.g. Re-measured, within tolerance after deburring" : "e.g. Dimensions out of tolerance, not reworkable"}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisposition(null)}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={pending || notes.trim().length < 3}
              className={disposition === "release" ? "bg-success hover:bg-success/90 text-white" : "bg-destructive hover:bg-destructive/90 text-white"}
            >
              {pending && <Loader2Icon className="animate-spin" />}
              {disposition === "release" ? "Release lot" : "Scrap lot"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
