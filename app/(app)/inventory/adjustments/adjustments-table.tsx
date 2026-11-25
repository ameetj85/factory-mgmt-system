"use client";

import { useState, useTransition } from "react";
import { CheckIcon, Loader2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { QtyChange } from "@/components/inventory/badges";
import { LocalTime } from "@/components/local-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { adjustmentReasonLabel } from "@/lib/inventory/constants";
import { formatQty } from "@/lib/quantity";
import { reviewAdjustment } from "../actions";

export interface AdjustmentRow {
  id: number;
  sku: string;
  itemName: string;
  uom: string;
  locationCode: string;
  batchNumber: string;
  qtyChangeMilli: number;
  reasonCode: string;
  notes: string | null;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  requestedBy: string;
  requestedById: number;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNotes: string | null;
}

type Review = { row: AdjustmentRow; decision: "approve" | "reject" } | null;

export function AdjustmentsTable({ rows, canApprove, currentUserId }: { rows: AdjustmentRow[]; canApprove: boolean; currentUserId: number }) {
  const [review, setReview] = useState<Review>(null);
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const showActions = canApprove && rows.some((r) => r.status === "pending");

  const submit = () => {
    if (!review) return;
    startTransition(async () => {
      const result = await reviewAdjustment({ id: review.row.id, decision: review.decision, reviewNotes: notes });
      if (result.status === "success") {
        toast.success(result.message);
        setReview(null);
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
              <TableHead className="pl-4">Requested</TableHead>
              <TableHead>Item</TableHead>
              <TableHead className="hidden md:table-cell">Lot · Location</TableHead>
              <TableHead className="text-right">Change</TableHead>
              <TableHead className="hidden lg:table-cell">Reason</TableHead>
              <TableHead className={showActions ? "" : "pr-4"}>{rows[0]?.status === "pending" ? "Status" : "Review"}</TableHead>
              {showActions && <TableHead className="w-40 pr-4 text-right">Decision</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const own = row.requestedById === currentUserId;
              return (
                <TableRow key={row.id} className="hover:bg-accent/40 align-top transition-colors">
                  <TableCell className="pl-4 text-sm">
                    <p className="font-medium">{row.requestedBy}</p>
                    <p className="text-muted-foreground text-xs">
                      <LocalTime iso={row.requestedAt} />
                    </p>
                  </TableCell>
                  <TableCell>
                    <p className="font-mono text-sm font-medium">{row.sku}</p>
                    <p className="text-muted-foreground max-w-48 truncate text-xs">{row.itemName}</p>
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">
                    <span className="font-mono">{row.batchNumber}</span>
                    <span className="text-muted-foreground"> · {row.locationCode}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <QtyChange milli={row.qtyChangeMilli} uom={row.uom} />
                  </TableCell>
                  <TableCell className="hidden max-w-56 lg:table-cell">
                    <p className="text-sm">{adjustmentReasonLabel(row.reasonCode)}</p>
                    {row.notes && <p className="text-muted-foreground line-clamp-2 text-xs">{row.notes}</p>}
                  </TableCell>
                  <TableCell className={showActions ? "" : "pr-4"}>
                    {row.status === "pending" && (
                      <Badge variant="outline" className="border-warning/50 text-warning">
                        Awaiting approval
                      </Badge>
                    )}
                    {row.status !== "pending" && (
                      <div className="text-sm">
                        <Badge
                          variant="outline"
                          className={row.status === "approved" ? "border-success/40 text-success" : "border-destructive/40 text-destructive"}
                        >
                          {row.status === "approved" ? "Approved" : "Rejected"}
                        </Badge>
                        <p className="text-muted-foreground mt-1 text-xs">
                          {row.reviewedBy} · <LocalTime iso={row.reviewedAt} />
                        </p>
                        {row.reviewNotes && <p className="text-muted-foreground max-w-56 text-xs italic">“{row.reviewNotes}”</p>}
                      </div>
                    )}
                  </TableCell>
                  {showActions && (
                    <TableCell className="pr-4 text-right">
                      {row.status === "pending" &&
                        (own ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-muted-foreground text-xs">Your request</span>
                            </TooltipTrigger>
                            <TooltipContent>Another approver must review requests you submitted.</TooltipContent>
                          </Tooltip>
                        ) : (
                          <div className="flex justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => setReview({ row, decision: "reject" })}
                            >
                              <XIcon /> Reject
                            </Button>
                            <Button size="sm" onClick={() => setReview({ row, decision: "approve" })}>
                              <CheckIcon /> Approve
                            </Button>
                          </div>
                        ))}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={review !== null}
        onOpenChange={(open) => {
          if (!open) {
            setReview(null);
            setNotes("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{review?.decision === "approve" ? "Approve adjustment" : "Reject adjustment"}</DialogTitle>
            <DialogDescription>
              {review && (
                <>
                  {review.row.qtyChangeMilli > 0 ? "Add" : "Remove"} {formatQty(Math.abs(review.row.qtyChangeMilli), review.row.uom)} of{" "}
                  <span className="font-mono">{review.row.sku}</span> (lot {review.row.batchNumber} at {review.row.locationCode}).{" "}
                  {review.decision === "approve" ? "This posts to the stock ledger." : "Stock won't change."}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="review-notes">Notes {review?.decision === "reject" ? "(recommended)" : "(optional)"}</Label>
            <Textarea id="review-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReview(null)}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={pending}
              className={review?.decision === "reject" ? "bg-destructive hover:bg-destructive/90 text-white" : undefined}
            >
              {pending && <Loader2Icon className="animate-spin" />}
              {review?.decision === "approve" ? "Approve & post" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
