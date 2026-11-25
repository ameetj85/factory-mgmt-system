import { CheckCircle2Icon, ShieldAlertIcon, XCircleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function ResultBadge({ result }: { result: "PASS" | "FAIL" }) {
  return result === "PASS" ? (
    <Badge variant="outline" className="border-success/40 text-success">
      <CheckCircle2Icon /> Pass
    </Badge>
  ) : (
    <Badge variant="outline" className="border-destructive/40 text-destructive">
      <XCircleIcon /> Fail
    </Badge>
  );
}

export function HoldBadge() {
  return (
    <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
      <ShieldAlertIcon /> On hold
    </Badge>
  );
}
