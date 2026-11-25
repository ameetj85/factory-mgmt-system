// Quality definitions shared by server and client code.

export const STAGES = ["RECEIVING", "IN_PROCESS", "FINAL"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  RECEIVING: "Receiving",
  IN_PROCESS: "In-process",
  FINAL: "Final",
};

export type CriterionType = "PASS_FAIL" | "MEASUREMENT";
export type HoldStatus = "ACTIVE" | "RELEASED" | "SCRAPPED";

const SIGNED_PATTERN = /^-?\d+(\.\d{1,3})?$/;

/** Parses a signed decimal with up to 3 decimals into thousandths; null when blank or invalid. */
export function parseSignedMilli(input: string): number | null {
  const value = input.trim().replace(/,/g, "");
  if (!SIGNED_PATTERN.test(value)) return null;
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  const milli = Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
  if (!Number.isSafeInteger(milli)) return null;
  return negative ? -milli : milli;
}

export function formatMeasure(milli: number | null | undefined, unit?: string | null): string {
  if (milli == null) return "—";
  const text = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(milli / 1000);
  return unit ? `${text} ${unit}` : text;
}

/** Human description of a tolerance band, e.g. "10 ± 0.05 mm", "≥ 2 kg" or "9.95 – 10.05 mm". */
export function describeLimits(c: { min_milli: number | null; max_milli: number | null; target_milli: number | null; unit: string | null }): string {
  const { min_milli: min, max_milli: max, target_milli: target, unit } = c;
  if (min != null && max != null) {
    if (target != null && target - min === max - target) return `${formatMeasure(target)} ± ${formatMeasure(max - target, unit)}`;
    return `${formatMeasure(min)} – ${formatMeasure(max, unit)}`;
  }
  if (min != null) return `≥ ${formatMeasure(min, unit)}`;
  if (max != null) return `≤ ${formatMeasure(max, unit)}`;
  return "—";
}

export function withinLimits(value: number, min: number | null, max: number | null): boolean {
  return (min == null || value >= min) && (max == null || value <= max);
}
