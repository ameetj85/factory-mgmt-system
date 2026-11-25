"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, ShieldAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { Combobox } from "@/components/combobox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { placeHold } from "./actions";

export function PlaceHoldDialog({ lots }: { lots: { itemId: number; sku: string; name: string; batchNumber: string }[] }) {
  const [open, setOpen] = useState(false);
  const [lot, setLot] = useState("");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      const [itemId, batchNumber] = lot.split("|");
      const result = await placeHold({ itemId: Number(itemId), batchNumber, reason });
      if (result.status === "success") {
        toast.success(result.message);
        setOpen(false);
        setLot("");
        setReason("");
      } else {
        toast.error(result.message);
      }
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-destructive hover:bg-destructive/90 text-white shadow-md">
          <ShieldAlertIcon /> Place a hold
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Put a lot on quality hold</DialogTitle>
          <DialogDescription>For a suspect lot, a supplier recall or a customer complaint. It will be blocked from shipping and production.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-1.5">
            <Label>Lot</Label>
            <Combobox
              value={lot}
              onChange={setLot}
              placeholder="Choose a lot in stock"
              searchPlaceholder="Search lot or SKU…"
              options={lots.map((l) => ({ value: `${l.itemId}|${l.batchNumber}`, label: `${l.batchNumber} — ${l.sku}`, description: l.name, keywords: [l.batchNumber, l.sku] }))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="hold-reason">Reason</Label>
            <Textarea id="hold-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Supplier notified of contaminated batch" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !lot || reason.trim().length < 3} className="bg-destructive hover:bg-destructive/90 text-white">
            {pending && <Loader2Icon className="animate-spin" />} Place hold
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
