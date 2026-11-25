import { Badge } from "@/components/ui/badge";
import {
  PRIORITY_LABELS,
  WO_STATUS_LABELS,
  WORKSTATION_STATUS_LABELS,
  type Priority,
  type WoStatus,
  type WorkstationStatus,
} from "@/lib/production/constants";
import { cn } from "@/lib/utils";

const WO_STYLES: Record<WoStatus, string> = {
  DRAFT: "border-muted-foreground/30 text-muted-foreground",
  RELEASED: "border-primary/40 text-primary",
  IN_PROGRESS: "border-transparent bg-primary text-primary-foreground",
  ON_HOLD: "border-warning/50 text-warning",
  COMPLETED: "border-success/40 text-success",
  CANCELLED: "border-destructive/30 text-destructive/80 line-through decoration-1",
};

export function WoStatusBadge({ status, className }: { status: WoStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn(WO_STYLES[status], className)}>
      {status === "IN_PROGRESS" && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
      {WO_STATUS_LABELS[status]}
    </Badge>
  );
}

const PRIORITY_STYLES: Record<Priority, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-secondary text-secondary-foreground",
  high: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
  urgent: "bg-destructive/12 text-destructive",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <Badge variant="secondary" className={cn("border-transparent", PRIORITY_STYLES[priority])}>
      {PRIORITY_LABELS[priority]}
    </Badge>
  );
}

export const WORKSTATION_STATUS_DOT: Record<WorkstationStatus, string> = {
  IDLE: "bg-muted-foreground/60",
  RUNNING: "bg-success",
  MAINTENANCE: "bg-warning",
  DOWN: "bg-destructive",
};

export function WorkstationStatusBadge({ status }: { status: WorkstationStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        status === "RUNNING" && "border-success/40 text-success",
        status === "IDLE" && "text-muted-foreground",
        status === "MAINTENANCE" && "border-warning/50 text-warning",
        status === "DOWN" && "border-destructive/40 text-destructive",
      )}
    >
      <span className={cn("size-1.5 rounded-full", WORKSTATION_STATUS_DOT[status], status === "RUNNING" && "animate-pulse")} />
      {WORKSTATION_STATUS_LABELS[status]}
    </Badge>
  );
}
