import "server-only";
import { factoryTimeZone } from "@/lib/maintenance/service";
import { addDays, localDate, zonedTimeToUtc } from "@/lib/maintenance/shift-math";

export const RANGES = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
] as const;
export type RangeKey = (typeof RANGES)[number]["value"];

export interface Window {
  key: RangeKey | "custom";
  label: string;
  startMs: number;
  /** Never later than now, so "today" measures the day so far. */
  endMs: number;
  timeZone: string;
  /** Bucket size for over-time charts. */
  bucket: "hour" | "day";
  fromDate: string;
  toDate: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Resolves a reporting window in the factory time zone from ?range= or ?from=&to= (inclusive local dates). */
export async function resolveWindow(params: { range?: unknown; from?: unknown; to?: unknown }, nowMs: number): Promise<Window> {
  const timeZone = await factoryTimeZone();
  const today = localDate(nowMs, timeZone);
  const make = (key: Window["key"], label: string, fromDate: string, toDate: string): Window => {
    const startMs = zonedTimeToUtc(fromDate, "00:00", timeZone);
    const endMs = Math.min(nowMs, zonedTimeToUtc(addDays(toDate, 1), "00:00", timeZone));
    return { key, label, startMs, endMs: Math.max(startMs, endMs), timeZone, bucket: fromDate === toDate ? "hour" : "day", fromDate, toDate };
  };

  if (typeof params.from === "string" && typeof params.to === "string" && DATE.test(params.from) && DATE.test(params.to) && params.from <= params.to) {
    const to = params.to > today ? today : params.to;
    return make("custom", params.from === to ? params.from : `${params.from} – ${to}`, params.from, to);
  }
  switch (params.range) {
    case "yesterday":
      return make("yesterday", "Yesterday", addDays(today, -1), addDays(today, -1));
    case "7d":
      return make("7d", "Last 7 days", addDays(today, -6), today);
    case "30d":
      return make("30d", "Last 30 days", addDays(today, -29), today);
    default:
      return make("today", "Today", today, today);
  }
}
