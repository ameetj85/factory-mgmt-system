"use client";

import { useSyncExternalStore } from "react";

function subscribe(onTick: () => void) {
  const timer = window.setInterval(onTick, 1000);
  return () => window.clearInterval(timer);
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Live h:mm:ss counter since `since` (ISO), ticking every second. */
export function Elapsed({ since, className }: { since: string; className?: string }) {
  const now = useSyncExternalStore(subscribe, nowSeconds, () => null);
  if (now === null) return <span className={className}>--:--</span>;
  const total = Math.max(0, now - Math.floor(Date.parse(since) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className={className} suppressHydrationWarning>
      {h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`}
    </span>
  );
}
