"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsUpDownIcon, LogOutIcon, UserCogIcon } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { UserAvatar } from "@/components/user-avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { can, ROLE_LABELS, type Role } from "@/lib/auth/permissions";
import { NAV_SECTIONS } from "@/lib/nav";
import { logout } from "@/app/(app)/actions";

interface SidebarUser {
  fullName: string;
  username: string;
  role: Role;
}

function SidebarBrand() {
  return (
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" asChild className="hover:bg-sidebar-accent/60">
            <Link href="/dashboard">
              <BrandMark className="size-8" />
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-semibold">Factory MS</span>
                <span className="text-sidebar-foreground/60 truncate text-xs">Operations hub</span>
              </div>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
  );
}

export function AppSidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const sections = NAV_SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => can(user.role, i.permission)) })).filter(
    (s) => s.items.length > 0,
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarBrand />
      <SidebarContent>
        {sections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel className="text-sidebar-foreground/50">{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const active =
                    pathname === item.href || (!item.exact && pathname.startsWith(`${item.href}/`));
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                        className="transition-all duration-150 hover:translate-x-0.5 data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground data-[active=true]:shadow-md data-[active=true]:shadow-black/20"
                      >
                        <Link href={item.href} onClick={() => isMobile && setOpenMobile(false)}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <UserMenu user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function UserMenu({ user }: { user: SidebarUser }) {
  const { isMobile } = useSidebar();
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <UserAvatar name={user.fullName} />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.fullName}</span>
                <span className="text-sidebar-foreground/60 truncate text-xs">{ROLE_LABELS[user.role]}</span>
              </div>
              <ChevronsUpDownIcon className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <UserAvatar name={user.fullName} />
                <div className="grid flex-1 leading-tight">
                  <span className="truncate font-medium">{user.fullName}</span>
                  <span className="text-muted-foreground truncate text-xs">@{user.username}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile">
                <UserCogIcon /> Profile &amp; security
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <form action={logout}>
              <DropdownMenuItem asChild variant="destructive">
                <button type="submit" className="w-full">
                  <LogOutIcon /> Sign out
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function AppSidebarSkeleton() {
  return (
    <Sidebar collapsible="icon">
      <SidebarBrand />
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {["70%", "55%", "80%", "60%"].map((width, i) => (
              <SidebarMenuItem key={i} className="flex h-8 items-center gap-2 px-2">
                <Skeleton className="bg-sidebar-accent size-4 rounded-md" />
                <Skeleton className="bg-sidebar-accent h-4" style={{ width }} />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
