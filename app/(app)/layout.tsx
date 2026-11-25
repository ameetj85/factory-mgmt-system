import { Suspense } from "react";
import { AppSidebar, AppSidebarSkeleton } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { requireUser } from "@/lib/auth/dal";

// Every page in this group is per-user, request-time data (session + live database reads),
// so navigating into it is allowed to block rather than being validated for instant navigation.
export const instant = false;

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <SidebarProvider>
      <Suspense fallback={<AppSidebarSkeleton />}>
        <SignedInSidebar />
      </Suspense>
      <SidebarInset>
        <header className="bg-background/80 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
          <SidebarTrigger className="hover:text-primary -ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

async function SignedInSidebar() {
  const user = await requireUser();
  return <AppSidebar user={{ fullName: user.fullName, username: user.username, role: user.role }} />;
}
