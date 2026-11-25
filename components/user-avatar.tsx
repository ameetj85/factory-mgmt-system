import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

export function UserAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <Avatar className={cn("size-8 rounded-lg", className)}>
      <AvatarFallback className="bg-brand-gradient rounded-lg text-xs font-semibold text-white">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
