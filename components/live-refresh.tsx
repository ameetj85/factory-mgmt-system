"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Keeps a dashboard current: listens to /api/live (Server-Sent Events) and re-fetches server data when
 * the shop floor changes. Falls back to polling if the stream can't be held open.
 */
export function LiveRefresh({ fallbackSeconds = 30 }: { fallbackSeconds?: number }) {
  const router = useRouter();
  const [state, setState] = useState<"connecting" | "live" | "polling">("connecting");
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let source: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let failures = 0;

    // Coalesce bursts of changes (e.g. several quick output reports) into one refresh.
    const refresh = () => {
      if (pending.current) return;
      pending.current = setTimeout(() => {
        pending.current = null;
        router.refresh();
      }, 800);
    };

    const startPolling = () => {
      if (poll) return;
      setState("polling");
      poll = setInterval(() => document.visibilityState === "visible" && router.refresh(), fallbackSeconds * 1000);
    };

    const connect = () => {
      source = new EventSource("/api/live");
      source.addEventListener("ready", () => {
        failures = 0;
        setState("live");
      });
      source.addEventListener("change", refresh);
      source.onerror = () => {
        failures += 1;
        if (failures >= 3) {
          source?.close();
          startPolling();
        }
      };
    };

    connect();
    return () => {
      source?.close();
      if (poll) clearInterval(poll);
      if (pending.current) clearTimeout(pending.current);
    };
  }, [router, fallbackSeconds]);

  return (
    <span className="text-muted-foreground inline-flex items-center gap-2 text-xs" aria-live="polite">
      <span className={cn("size-2 rounded-full", state === "live" ? "bg-success animate-pulse" : state === "polling" ? "bg-warning" : "bg-muted-foreground/50")} />
      {state === "live" ? "Live" : state === "polling" ? `Refreshing every ${fallbackSeconds}s` : "Connecting…"}
    </span>
  );
}
