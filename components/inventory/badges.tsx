import { AlertTriangleIcon, CheckCircle2Icon, XCircleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  ITEM_TYPE_LABELS,
  TXN_TYPE_LABELS,
  type ItemType,
  type StockStatus,
  type TxnType,
} from "@/lib/inventory/constants";
import { cn } from "@/lib/utils";

const TYPE_STYLES: Record<ItemType, string> = {
  raw: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
  wip: "bg-fuchsia-500/12 text-fuchsia-700 dark:text-fuchsia-300",
  finished: "bg-primary/15 text-primary",
};

export function ItemTypeBadge({ type }: { type: ItemType }) {
  return (
    <Badge variant="secondary" className={cn("border-transparent", TYPE_STYLES[type])}>
      {ITEM_TYPE_LABELS[type]}
    </Badge>
  );
}

export function StockStatusBadge({ status }: { status: StockStatus }) {
  if (status === "out") {
    return (
      <Badge variant="outline" className="border-destructive/40 text-destructive">
        <XCircleIcon /> Out of stock
      </Badge>
    );
  }
  if (status === "low") {
    return (
      <Badge variant="outline" className="border-warning/50 text-warning">
        <AlertTriangleIcon /> Low stock
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-success/40 text-success">
      <CheckCircle2Icon /> In stock
    </Badge>
  );
}

export function TxnTypeBadge({ type }: { type: TxnType }) {
  const inbound = type === "RECEIPT" || type === "TRANSFER_IN" || type === "PRODUCTION_OUTPUT";
  const scrap = type === "SCRAP";
  return (
    <Badge
      variant="secondary"
      className={cn(
        "border-transparent",
        inbound && "bg-success/12 text-success",
        scrap && "bg-destructive/10 text-destructive",
        !inbound && !scrap && "bg-primary/10 text-primary",
      )}
    >
      {TXN_TYPE_LABELS[type]}
    </Badge>
  );
}

/** Signed quantity with colour: green for stock in, purple for stock out. */
export function QtyChange({ milli, uom }: { milli: number; uom: string }) {
  const text = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3, signDisplay: "always" }).format(milli / 1000);
  return (
    <span className={cn("font-medium tabular-nums", milli > 0 ? "text-success" : "text-primary")}>
      {text} <span className="text-muted-foreground text-xs font-normal">{uom}</span>
    </span>
  );
}
