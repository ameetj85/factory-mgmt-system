import { FactoryIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "bg-brand-gradient flex size-9 shrink-0 items-center justify-center rounded-xl text-white shadow-md shadow-primary/30",
        className,
      )}
    >
      <FactoryIcon className="size-5" />
    </div>
  );
}
