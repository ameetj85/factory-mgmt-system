"use client";

import { useRef } from "react";

/**
 * One key per logical submission: retries of a failed request reuse the same key (so the server
 * can drop duplicates), and `reset()` after a success starts a fresh one for the next entry.
 */
export function useIdempotencyKey() {
  const key = useRef<string | null>(null);
  return {
    current() {
      key.current ??= crypto.randomUUID();
      return key.current;
    },
    reset() {
      key.current = null;
    },
  };
}
