"use client";

import { formatDateTime } from "@/lib/format";

/** Renders an ISO timestamp in the viewer's own time zone. */
export function LocalTime({ iso, className }: { iso: string | null | undefined; className?: string }) {
  return (
    <time dateTime={iso ?? undefined} className={className} suppressHydrationWarning>
      {formatDateTime(iso)}
    </time>
  );
}
