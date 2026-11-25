import type { Metadata } from "next";
import Link from "next/link";
import { ActivityIcon, ArrowRightIcon, KeyRoundIcon, LogInIcon, ShieldCheckIcon, UsersIcon } from "lucide-react";
import { Greeting } from "@/components/greeting";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/dal";
import { can, ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { formatAuditAction, formatRelative } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requirePermission("dashboard.view");
  const firstName = user.fullName.split(/\s+/)[0];

  return (
    <>
      <section className="bg-brand-gradient relative overflow-hidden rounded-2xl p-6 text-white shadow-lg shadow-primary/20 md:p-8">
        <div className="pointer-events-none absolute -top-16 -right-16 size-64 rounded-full bg-white/10 blur-2xl" />
        <div className="relative space-y-2">
          <Badge className="bg-white/15 text-white ring-1 ring-white/25 hover:bg-white/20">{ROLE_LABELS[user.role]}</Badge>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            <Greeting name={firstName} />
          </h1>
          <p className="max-w-2xl text-white/75">{ROLE_DESCRIPTIONS[user.role]}</p>
        </div>
      </section>

      {can(user.role, "audit.view") ? <AdminOverview showUsersLink={can(user.role, "users.manage")} /> : <MemberOverview />}
    </>
  );
}

function loadAdminOverview() {
  const since = "strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 day')";
  return Promise.all([
    db.get<{ active_users: number; admins: number; logins_24h: number; resets_24h: number }>(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE is_active = 1) AS active_users,
         (SELECT COUNT(*) FROM users WHERE is_active = 1 AND role = 'admin') AS admins,
         (SELECT COUNT(*) FROM audit_logs WHERE action = 'auth.login' AND created_at > ${since}) AS logins_24h,
         (SELECT COUNT(*) FROM audit_logs WHERE action = 'auth.password_reset' AND created_at > ${since}) AS resets_24h`,
    ),
    db.all<{ id: number; action: string; created_at: string; full_name: string | null }>(
      `SELECT a.id, a.action, a.created_at, u.full_name
         FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
        ORDER BY a.id DESC LIMIT 8`,
    ),
  ]);
}

async function AdminOverview({ showUsersLink }: { showUsersLink: boolean }) {
  const [counts, recent] = await loadAdminOverview();

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active users" value={counts?.active_users ?? 0} icon={UsersIcon} hint="Accounts able to sign in" />
        <StatCard label="Administrators" value={counts?.admins ?? 0} icon={ShieldCheckIcon} hint="Full system access" />
        <StatCard label="Sign-ins" value={counts?.logins_24h ?? 0} icon={LogInIcon} hint="Last 24 hours" />
        <StatCard label="Password resets" value={counts?.resets_24h ?? 0} icon={KeyRoundIcon} hint="Last 24 hours" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <ActivityIcon className="text-primary size-4" /> Recent activity
            </CardTitle>
            <CardDescription>The latest entries in the audit log.</CardDescription>
          </div>
          <div className="flex gap-2">
            {showUsersLink && (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/users">Manage users</Link>
              </Button>
            )}
            <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary">
              <Link href="/admin/audit-log">
                View all <ArrowRightIcon />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-muted-foreground text-sm">No activity yet.</p>
          ) : (
            <ul className="divide-y">
              {recent.map((entry) => (
                <li
                  key={entry.id}
                  className="hover:bg-accent/50 -mx-2 flex items-center justify-between gap-4 rounded-md px-2 py-2.5 text-sm transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="bg-primary size-2 rounded-full" />
                    <span className="font-medium">{formatAuditAction(entry.action)}</span>
                    <span className="text-muted-foreground hidden sm:inline">{entry.full_name ?? "System"}</span>
                  </div>
                  <span className="text-muted-foreground shrink-0 text-xs">{formatRelative(entry.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function MemberOverview() {
  return (
    <>
      <PageHeader title="Your workspace" description="Modules for your role will appear in the sidebar as they come online." />
      <Card className="hover-lift">
        <CardHeader>
          <CardTitle>Account security</CardTitle>
          <CardDescription>Update your password and review where you&apos;re signed in.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/profile">
              Open profile <ArrowRightIcon />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
