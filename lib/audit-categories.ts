/** Action prefixes the audit log can be filtered by. Later modules add their own categories here. */
export const AUDIT_CATEGORIES = [
  { value: "auth", label: "Authentication" },
  { value: "user", label: "User management" },
] as const;
