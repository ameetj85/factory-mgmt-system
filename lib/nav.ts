import { LayoutDashboardIcon, ScrollTextIcon, UsersIcon, type LucideIcon } from "lucide-react";
import type { Permission } from "@/lib/auth/permissions";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  permission: Permission;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [{ title: "Dashboard", href: "/dashboard", icon: LayoutDashboardIcon, permission: "dashboard.view" }],
  },
  {
    label: "Administration",
    items: [
      { title: "Users", href: "/admin/users", icon: UsersIcon, permission: "users.manage" },
      { title: "Audit log", href: "/admin/audit-log", icon: ScrollTextIcon, permission: "audit.view" },
    ],
  },
];
