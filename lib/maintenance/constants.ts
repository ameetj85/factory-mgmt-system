// Maintenance definitions shared by server and client code.

export const DOWNTIME_REASONS = [
  { value: "MECH_FAILURE", label: "Mechanical failure", planned: false },
  { value: "ELEC_FAILURE", label: "Electrical failure", planned: false },
  { value: "MECH_JAM", label: "Jam / blockage", planned: false },
  { value: "TOOLING", label: "Tooling change or wear", planned: false },
  { value: "CHANGEOVER", label: "Changeover", planned: false },
  { value: "MATERIAL_SHORTAGE", label: "Material shortage", planned: false },
  { value: "QUALITY_HOLD", label: "Quality hold", planned: false },
  { value: "NO_OPERATOR", label: "No operator", planned: false },
  { value: "OPERATOR_BREAK", label: "Unscheduled break", planned: false },
  { value: "PLANNED_MAINTENANCE", label: "Planned maintenance", planned: true },
  { value: "OTHER", label: "Other", planned: false },
] as const;

export type DowntimeReason = (typeof DOWNTIME_REASONS)[number]["value"];
export const DOWNTIME_REASON_VALUES = DOWNTIME_REASONS.map((r) => r.value) as [DowntimeReason, ...DowntimeReason[]];

export function downtimeReasonLabel(code: string): string {
  return DOWNTIME_REASONS.find((r) => r.value === code)?.label ?? code;
}

export function isPlannedReason(code: string): boolean {
  return DOWNTIME_REASONS.find((r) => r.value === code)?.planned ?? false;
}

export const PM_TRIGGERS = { CALENDAR: "Calendar interval", RUNTIME: "Runtime hours" } as const;
export type PmTrigger = keyof typeof PM_TRIGGERS;

export type PmStatus = "overdue" | "due_soon" | "ok" | "inactive";

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = Math.round(total % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function formatHours(seconds: number): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(seconds / 3600)} h`;
}
