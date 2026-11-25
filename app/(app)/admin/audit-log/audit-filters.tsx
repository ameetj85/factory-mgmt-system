"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AUDIT_CATEGORIES } from "@/lib/audit-categories";
import { cn } from "@/lib/utils";

const ALL = "all";

export function AuditFilters({
  category,
  userId,
  users,
}: {
  category?: string;
  userId?: number;
  users: { id: number; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function apply(next: { category?: string; user?: string }) {
    const merged = { category: category ?? ALL, user: userId ? String(userId) : ALL, ...next };
    const params = new URLSearchParams();
    if (merged.category !== ALL) params.set("category", merged.category);
    if (merged.user !== ALL) params.set("user", merged.user);
    startTransition(() => router.replace(params.size ? `${pathname}?${params}` : pathname));
  }

  return (
    <div className={cn("flex flex-col gap-3 transition-opacity sm:flex-row sm:items-center", pending && "opacity-60")}>
      <Select value={category ?? ALL} onValueChange={(value) => apply({ category: value })}>
        <SelectTrigger className="h-10 w-full sm:w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All activity</SelectItem>
          {AUDIT_CATEGORIES.map((c) => (
            <SelectItem key={c.value} value={c.value}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={userId ? String(userId) : ALL} onValueChange={(value) => apply({ user: value })}>
        <SelectTrigger className="h-10 w-full sm:w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All users</SelectItem>
          {users.map((u) => (
            <SelectItem key={u.id} value={String(u.id)}>
              {u.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {(category || userId) && (
        <Button variant="ghost" className="h-10" onClick={() => apply({ category: ALL, user: ALL })}>
          <XIcon /> Clear
        </Button>
      )}
    </div>
  );
}
