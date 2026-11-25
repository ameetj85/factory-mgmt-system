const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const relativeFormat = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return dateTimeFormat.format(new Date(iso));
}

export function formatRelative(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "Never";
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return relativeFormat.format(seconds, "second");
  if (abs < 3600) return relativeFormat.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return relativeFormat.format(Math.round(seconds / 3600), "hour");
  if (abs < 86400 * 30) return relativeFormat.format(Math.round(seconds / 86400), "day");
  return formatDateTime(iso);
}

/** Human label for audit actions such as "user.password_reset" → "User · password reset". */
export function formatAuditAction(action: string): string {
  const [scope, ...rest] = action.split(".");
  const verb = rest.join(".").replace(/_/g, " ");
  return `${scope.charAt(0).toUpperCase()}${scope.slice(1)} · ${verb}`;
}
