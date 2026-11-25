import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS, type Role } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

const ROLE_STYLES: Record<Role, string> = {
  admin: "bg-primary text-primary-foreground",
  production_manager: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  operator: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
  warehouse_clerk: "bg-purple-400/20 text-purple-800 dark:text-purple-200",
};

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  return (
    <Badge variant="secondary" className={cn("border-transparent", ROLE_STYLES[role], className)}>
      {ROLE_LABELS[role]}
    </Badge>
  );
}
