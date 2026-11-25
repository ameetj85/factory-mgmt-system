"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQueryParams } from "@/hooks/use-query-params";
import { cn } from "@/lib/utils";

export function InspectionFilters({ result, q }: { result?: "PASS" | "FAIL"; q: string }) {
  const { update, pending } = useQueryParams();
  return (
    <div className={cn("flex flex-col gap-3 transition-opacity sm:flex-row sm:items-center", pending && "opacity-60")}>
      <div className="bg-muted inline-flex w-fit rounded-lg p-1">
        {([undefined, "PASS", "FAIL"] as const).map((r) => (
          <button
            key={r ?? "all"}
            type="button"
            onClick={() => update({ result: r })}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-all",
              result === r ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-primary",
            )}
          >
            {r === undefined ? "All" : r === "PASS" ? "Passed" : "Failed"}
          </button>
        ))}
      </div>
      <form
        className="relative flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: String(new FormData(e.currentTarget).get("q") ?? "").trim() || undefined });
        }}
      >
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input key={q} name="q" defaultValue={q} placeholder="Lot, SKU or inspection number… (Enter)" className="h-10 pl-9" />
      </form>
      {(result || q) && (
        <Button variant="ghost" className="h-10" onClick={() => update({ result: undefined, q: undefined })}>
          <XIcon /> Clear
        </Button>
      )}
    </div>
  );
}
