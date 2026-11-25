import {
  ArrowLeftRightIcon,
  BoxesIcon,
  CalendarClockIcon,
  ClipboardCheckIcon,
  CogIcon,
  OctagonAlertIcon,
  WrenchIcon,
  ClipboardListIcon,
  FactoryIcon,
  MonitorSmartphoneIcon,
  NetworkIcon,
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
    label: "Production",
    items: [
      { title: "Shop floor", href: "/shop-floor", icon: MonitorSmartphoneIcon, permission: "shopfloor.operate" },
      { title: "Work orders", href: "/production/work-orders", icon: ClipboardCheckIcon, permission: "workorders.view" },
      { title: "Bills of materials", href: "/production/boms", icon: NetworkIcon, permission: "bom.manage" },
      { title: "Workstations", href: "/production/workstations", icon: FactoryIcon, permission: "workstations.manage" },
    ],
  },
  {
    label: "Maintenance",
    items: [
      { title: "Machines", href: "/maintenance/machines", icon: CogIcon, permission: "maintenance.manage" },
      { title: "Downtime", href: "/maintenance/downtime", icon: OctagonAlertIcon, permission: "downtime.report" },
      { title: "Preventive maintenance", href: "/maintenance/pm", icon: WrenchIcon, permission: "maintenance.manage" },
      { title: "Shift calendar", href: "/maintenance/shifts", icon: CalendarClockIcon, permission: "shifts.manage" },
    ],
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
