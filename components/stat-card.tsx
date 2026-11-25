import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: LucideIcon;
  className?: string;
}) {
  return (
    <Card className={cn("hover-lift group", className)}>
      <CardContent className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-muted-foreground text-sm">{label}</p>
          <p className="text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
          {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
        </div>
        <div className="bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground flex size-10 items-center justify-center rounded-xl transition-colors duration-200">
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  );
}
