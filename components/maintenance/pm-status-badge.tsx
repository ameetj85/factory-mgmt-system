import { AlarmClockIcon, CheckCircle2Icon, CircleOffIcon, OctagonAlertIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PmDue } from "@/lib/maintenance/service";

export function PmStatusBadge({ due }: { due: PmDue }) {
  const pct = Math.round(due.progress * 100);
  switch (due.status) {
    case "overdue":
      return (
        <Badge variant="outline" className="border-destructive/40 text-destructive">
          <OctagonAlertIcon /> Overdue
        </Badge>
      );
    case "due_soon":
      return (
        <Badge variant="outline" className="border-warning/50 text-warning">
          <AlarmClockIcon /> Due soon · {pct}%
        </Badge>
      );
    case "inactive":
      return (
        <Badge variant="outline" className="text-muted-foreground">
          <CircleOffIcon /> Paused
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="border-success/40 text-success">
          <CheckCircle2Icon /> OK · {pct}%
        </Badge>
      );
  }
}
