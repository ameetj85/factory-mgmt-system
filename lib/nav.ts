import {
  ArrowLeftRightIcon,
  BoxesIcon,
  ClipboardListIcon,
  LayoutDashboardIcon,
  MapPinIcon,
  PackageIcon,
  PackagePlusIcon,
  ScrollTextIcon,
  SlidersHorizontalIcon,
  TruckIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/auth/permissions";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  permission: Permission;
  /** Only highlight on an exact path match (for section roots that have sibling entries). */
  exact?: boolean;
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
    label: "Inventory",
    items: [
      { title: "Stock", href: "/inventory", icon: BoxesIcon, permission: "inventory.view", exact: true },
      { title: "Items", href: "/inventory/items", icon: PackageIcon, permission: "items.view" },
      { title: "Receiving", href: "/inventory/receive", icon: PackagePlusIcon, permission: "inventory.receive" },
      { title: "Shipping", href: "/inventory/ship", icon: TruckIcon, permission: "inventory.ship" },
      { title: "Transfers", href: "/inventory/transfer", icon: ArrowLeftRightIcon, permission: "inventory.transfer" },
      { title: "Adjustments", href: "/inventory/adjustments", icon: SlidersHorizontalIcon, permission: "inventory.adjust" },
      { title: "Stock ledger", href: "/inventory/ledger", icon: ClipboardListIcon, permission: "inventory.view" },
      { title: "Locations", href: "/inventory/locations", icon: MapPinIcon, permission: "locations.manage" },
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "Users", href: "/admin/users", icon: UsersIcon, permission: "users.manage" },
      { title: "Audit log", href: "/admin/audit-log", icon: ScrollTextIcon, permission: "audit.view" },
    ],
  },
];
