// Role and permission definitions. Imported by both server and client code,
// so this file must stay free of server-only dependencies.

export const ROLES = ["admin", "production_manager", "operator", "warehouse_clerk"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  production_manager: "Production Manager",
  operator: "Shop Floor Operator",
  warehouse_clerk: "Warehouse Clerk",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Full system configuration, user management and master data editing.",
  production_manager: "BOMs, work order scheduling, analytics and inventory adjustment approval.",
  operator: "Clock into work orders, log output and scrap, report machine downtime.",
  warehouse_clerk: "Receive shipments, manage stock locations and fulfil outgoing orders.",
};

const ALL: readonly Role[] = ROLES;
const MANAGEMENT: readonly Role[] = ["admin", "production_manager"];

export const PERMISSIONS = {
  "dashboard.view": ALL,
  "users.manage": ["admin"],
  "audit.view": MANAGEMENT,
  "items.view": ALL,
  "items.manage": MANAGEMENT,
  "inventory.view": ALL,
  "inventory.receive": ["admin", "production_manager", "warehouse_clerk"],
  "inventory.adjust": ["admin", "production_manager", "warehouse_clerk"],
  "inventory.approve": MANAGEMENT,
  "bom.manage": MANAGEMENT,
  "workorders.view": ALL,
  "workorders.manage": MANAGEMENT,
  "shopfloor.operate": ["admin", "production_manager", "operator"],
  "downtime.report": ["admin", "production_manager", "operator"],
  "maintenance.manage": MANAGEMENT,
  "quality.manage": MANAGEMENT,
  "analytics.view": MANAGEMENT,
  "system.configure": ["admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
