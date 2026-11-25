// Production definitions shared by server and client code.

export const WO_STATUSES = ["DRAFT", "RELEASED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"] as const;
export type WoStatus = (typeof WO_STATUSES)[number];

export const WO_STATUS_LABELS: Record<WoStatus, string> = {
  DRAFT: "Draft",
  RELEASED: "Released",
  IN_PROGRESS: "In progress",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/** Statuses an operator can run on the shop floor. */
export const RUNNABLE_STATUSES: readonly WoStatus[] = ["RELEASED", "IN_PROGRESS"];
export const OPEN_STATUSES: readonly WoStatus[] = ["DRAFT", "RELEASED", "IN_PROGRESS", "ON_HOLD"];

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const WORKSTATION_STATUSES = ["IDLE", "RUNNING", "MAINTENANCE", "DOWN"] as const;
export type WorkstationStatus = (typeof WORKSTATION_STATUSES)[number];

export const WORKSTATION_STATUS_LABELS: Record<WorkstationStatus, string> = {
  IDLE: "Idle",
  RUNNING: "Running",
  MAINTENANCE: "Maintenance",
  DOWN: "Down",
};

export const RUN_TYPE_LABELS = { SETUP: "Setup", RUN: "Production" } as const;
export type RunType = keyof typeof RUN_TYPE_LABELS;

export const SCRAP_REASONS = [
  { value: "SCRAP_DIMENSION", label: "Out of tolerance" },
  { value: "SCRAP_SURFACE", label: "Surface defect" },
  { value: "SCRAP_MATERIAL", label: "Bad material" },
  { value: "SCRAP_SETUP", label: "Setup / start-up scrap" },
  { value: "SCRAP_HANDLING", label: "Handling damage" },
  { value: "SCRAP_OTHER", label: "Other" },
] as const;

export function scrapReasonLabel(code: string | null): string {
  if (!code) return "—";
  return SCRAP_REASONS.find((r) => r.value === code)?.label ?? code;
}

/** "2.5" (percent, up to 2 decimals) → 250 basis points; null when invalid or above 100%. */
export function parsePercentBp(input: string): number | null {
  const value = input.trim();
  if (value === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const bp = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return bp <= 10000 ? bp : null;
}

export function formatPercentBp(bp: number): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(bp / 100)}%`;
}

/** "12.5" seconds → 12500 ms; null when invalid. */
export function parseSecondsMs(input: string): number | null {
  const value = input.trim();
  if (!/^\d+(\.\d{1,3})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const ms = Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
  return ms > 0 && Number.isSafeInteger(ms) ? ms : null;
}

export function formatCycleTime(ms: number | null | undefined): string {
  if (!ms) return "—";
  const seconds = ms / 1000;
  return seconds >= 120 ? `${(seconds / 60).toFixed(1)} min` : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(seconds)} s`;
}

/**
 * Component quantity needed for `producedMilli` units of output (good + scrap), including the
 * BOM line's scrap allowance, rounded up to the nearest thousandth. BigInt avoids overflow.
 */
export function requiredComponentMilli(producedMilli: number, qtyPerUnitMilli: number, scrapFactorBp: number): number {
  const numerator = BigInt(producedMilli) * BigInt(qtyPerUnitMilli) * BigInt(10000 + scrapFactorBp);
  const denominator = BigInt(1000 * 10000);
  return Number((numerator + denominator - BigInt(1)) / denominator);
}
