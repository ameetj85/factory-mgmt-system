import Link from "next/link";
import { FactoryIcon, PackageIcon, PackagePlusIcon, SlidersHorizontalIcon, TruckIcon } from "lucide-react";
import { LocalTime } from "@/components/local-time";
import { HoldBadge } from "@/components/quality/badges";
import type { TraceEvent, TraceEventKind, TraceLot } from "@/lib/quality/trace";
import { formatQty } from "@/lib/quantity";
import { cn } from "@/lib/utils";

const EVENT_ICON: Record<TraceEventKind, typeof TruckIcon> = {
  RECEIPT: PackagePlusIcon,
  PRODUCED_BY: FactoryIcon,
  ADJUSTMENT: SlidersHorizontalIcon,
  CONSUMED_BY: FactoryIcon,
  SHIPPED: TruckIcon,
};

const EVENT_TONE: Record<TraceEventKind, string> = {
  RECEIPT: "bg-success/12 text-success",
  PRODUCED_BY: "bg-primary/12 text-primary",
  ADJUSTMENT: "bg-muted text-muted-foreground",
  CONSUMED_BY: "bg-primary/12 text-primary",
  SHIPPED: "bg-fuchsia-500/12 text-fuchsia-700 dark:text-fuchsia-300",
};

function LotChip({ lot, root }: { lot: TraceLot; root?: boolean }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", root && "text-base")}>
      <PackageIcon className="text-muted-foreground size-4 shrink-0" />
      <Link
        href={`/quality/trace?item=${lot.itemId}&lot=${encodeURIComponent(lot.batchNumber)}`}
        className="hover:text-primary font-mono font-semibold transition-colors"
      >
        {lot.batchNumber}
      </Link>
      <span className="text-muted-foreground text-sm">
        <span className="font-mono">{lot.sku}</span> {lot.name}
      </span>
      {lot.usedMilli != null && <span className="text-muted-foreground text-xs">· used {formatQty(lot.usedMilli, lot.uom)}</span>}
      {lot.onHandMilli > 0 && <span className="text-muted-foreground text-xs">· {formatQty(lot.onHandMilli, lot.uom)} on hand</span>}
      {lot.onHold && <HoldBadge />}
      {lot.repeated && <span className="text-muted-foreground text-xs italic">(shown above)</span>}
    </div>
  );
}

function EventRow({ event, depth }: { event: TraceEvent; depth: number }) {
  const Icon = EVENT_ICON[event.kind];
  const label = event.href ? (
    <Link href={event.href} className="hover:text-primary font-medium transition-colors">
      {event.label}
    </Link>
  ) : (
    <span className="font-medium">{event.label}</span>
  );
  return (
    <li className="relative">
      <div className="hover:bg-accent/40 flex items-start gap-3 rounded-lg py-1.5 pr-2 transition-colors">
        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", EVENT_TONE[event.kind])}>
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0 text-sm">
          <p>
            {label} <span className="text-muted-foreground tabular-nums">· {formatQty(event.qtyMilli)}</span>
          </p>
          <p className="text-muted-foreground text-xs">
            {event.detail && <>{event.detail} · </>}
            <LocalTime iso={event.date} />
          </p>
        </div>
      </div>
      {event.lots.length > 0 && (
        <ul className="border-primary/20 ml-3.5 space-y-2 border-l-2 pt-1 pl-5">
          {event.lots.map((lot) => (
            <li key={lot.key}>
              <LotNode lot={lot} depth={depth + 1} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function LotNode({ lot, depth }: { lot: TraceLot; depth: number }) {
  return (
    <div className="space-y-1">
      <LotChip lot={lot} root={depth === 0} />
      {lot.events.length > 0 && (
        <ul className="ml-2 space-y-1 pl-4">
          {lot.events.map((e, i) => (
            <EventRow key={`${e.kind}-${i}`} event={e} depth={depth} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Recursive lot genealogy: lots, the events that created or used them, and the lots on the other side of each event. */
export function TraceTree({ root, empty }: { root: TraceLot; empty: string }) {
  if (root.events.length === 0) return <p className="text-muted-foreground text-sm">{empty}</p>;
  return (
    <ul className="space-y-1">
      {root.events.map((e, i) => (
        <EventRow key={`${e.kind}-${i}`} event={e} depth={0} />
      ))}
    </ul>
  );
}
