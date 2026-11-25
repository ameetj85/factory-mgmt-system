"use client";

import { useSyncExternalStore } from "react";

function partOfDay(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const noop = () => () => {};

/** Greets by the viewer's local time of day (falls back to "Welcome" during server render). */
export function Greeting({ name }: { name: string }) {
  const salutation = useSyncExternalStore(
    noop,
    () => partOfDay(new Date().getHours()),
    () => "Welcome",
  );
  return (
    <>
      {salutation}, {name}
    </>
  );
}
