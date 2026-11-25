export function pct(v: number | null | undefined, digits = 1): string {
  return v == null ? "—" : `${(v * 100).toFixed(digits)}%`;
}

export function hours(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}

/** World-class OEE benchmark, used as the reference line and status thresholds. */
export const OEE_WORLD_CLASS = 0.85;
export const OEE_LOW = 0.6;
