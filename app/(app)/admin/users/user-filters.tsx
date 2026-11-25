"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

const ALL = "all";

export function UserFilters({
  q,
  role,
  status,
  counts,
}: {
  q: string;
  role?: Role;
  status?: "active" | "inactive";
  counts: Record<Role, number>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function apply(next: { q?: string; role?: string; status?: string }) {
    const merged = { q, role: role ?? ALL, status: status ?? ALL, ...next };
    const params = new URLSearchParams();
    if (merged.q) params.set("q", merged.q);
    if (merged.role !== ALL) params.set("role", merged.role);
    if (merged.status !== ALL) params.set("status", merged.status);
    startTransition(() => router.replace(params.size ? `${pathname}?${params}` : pathname));
  }

  const hasFilters = Boolean(q || role || status);

  return (
    <div className={cn("flex flex-col gap-3 transition-opacity md:flex-row md:items-center", pending && "opacity-60")}>
      <form
        className="relative flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          apply({ q: String(new FormData(e.currentTarget).get("q") ?? "").trim() });
        }}
      >
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          key={q}
          name="q"
          defaultValue={q}
          placeholder="Search name, username or email… (press Enter)"
          className="h-10 pl-9"
        />
      </form>
      <Select value={role ?? ALL} onValueChange={(value) => apply({ role: value })}>
        <SelectTrigger className="h-10 w-full md:w-56">
          <SelectValue placeholder="All roles" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All roles</SelectItem>
          {ROLES.map((r) => (
            <SelectItem key={r} value={r}>
              {ROLE_LABELS[r]} <span className="text-muted-foreground ml-1 text-xs">({counts[r]})</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={status ?? ALL} onValueChange={(value) => apply({ status: value })}>
        <SelectTrigger className="h-10 w-full md:w-40">
          <SelectValue placeholder="Any status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Any status</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="inactive">Inactive</SelectItem>
        </SelectContent>
      </Select>
      {hasFilters && (
        <Button variant="ghost" className="h-10" onClick={() => apply({ q: "", role: ALL, status: ALL })}>
          <XIcon /> Clear
        </Button>
      )}
    </div>
  );
}
