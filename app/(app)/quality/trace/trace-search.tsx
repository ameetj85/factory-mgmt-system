"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2Icon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TraceSearch({ q }: { q: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const value = String(new FormData(e.currentTarget).get("q") ?? "").trim();
        startTransition(() => router.push(value ? `${pathname}?q=${encodeURIComponent(value)}` : pathname));
      }}
    >
      <div className="relative flex-1">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input key={q} name="q" defaultValue={q} placeholder="Lot number, e.g. SUP-LOT-1 or WO-20261125-0001" className="h-11 pl-9 font-mono" />
      </div>
      <Button type="submit" className="h-11" disabled={pending}>
        {pending && <Loader2Icon className="animate-spin" />} Trace
      </Button>
    </form>
  );
}
