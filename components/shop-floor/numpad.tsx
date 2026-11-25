"use client";

import { DeleteIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"] as const;

/** Large on-screen number pad for gloved hands and touch screens (keys are 64px tall). */
export function Numpad({
  value,
  onChange,
  allowDecimal = true,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  allowDecimal?: boolean;
  className?: string;
}) {
  const press = (key: (typeof KEYS)[number]) => {
    if (key === "back") return onChange(value.slice(0, -1));
    if (key === ".") {
      if (!allowDecimal || value.includes(".")) return;
      return onChange(value === "" ? "0." : `${value}.`);
    }
    const decimals = value.split(".")[1];
    if (decimals && decimals.length >= 3) return;
    if (value === "0") return onChange(key);
    if (value.replace(".", "").length >= 9) return;
    onChange(value + key);
  };

  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => press(key)}
          disabled={key === "." && !allowDecimal}
          aria-label={key === "back" ? "Backspace" : key}
          className={cn(
            "flex h-16 items-center justify-center rounded-xl border text-2xl font-semibold tabular-nums transition-all select-none",
            "bg-card hover:border-primary/50 hover:bg-accent active:bg-primary active:text-primary-foreground active:scale-95",
            "disabled:opacity-30",
            key === "back" && "text-muted-foreground",
          )}
        >
          {key === "back" ? <DeleteIcon className="size-6" /> : key}
        </button>
      ))}
    </div>
  );
}
