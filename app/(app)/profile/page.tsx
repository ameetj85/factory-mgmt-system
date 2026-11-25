import type { Metadata } from "next";
import { LaptopIcon, MailIcon, ShieldIcon, UserIcon } from "lucide-react";
import { LocalTime } from "@/components/local-time";
import { PageHeader } from "@/components/page-header";
import { UserAvatar } from "@/components/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/dal";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { currentSessionId } from "@/lib/auth/session";
import { db, SQL_NOW } from "@/lib/db/client";
import { ChangePasswordForm } from "./change-password-form";
import { SignOutOthersButton } from "./sign-out-others-button";

export const metadata: Metadata = { title: "Profile & security" };

function describeAgent(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Chrome\//.test(userAgent)
      ? "Chrome"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Browser";
  const os = /Windows/.test(userAgent)
    ? "Windows"
    : /Android/.test(userAgent)
      ? "Android"
      : /iPhone|iPad/.test(userAgent)
        ? "iOS"
        : /Mac OS/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "Unknown OS";
  return `${browser} on ${os}`;
}

export default async function ProfilePage() {
  const user = await requireUser();
  const [details, sessions, thisSession] = await Promise.all([
    db.get<{ created_at: string; last_login_at: string | null; password_changed_at: string | null }>(
      "SELECT created_at, last_login_at, password_changed_at FROM users WHERE id = ?",
      [user.id],
    ),
    db.all<{ id: string; created_at: string; expires_at: string; ip_address: string | null; user_agent: string | null }>(
      `SELECT id, created_at, expires_at, ip_address, user_agent FROM sessions WHERE user_id = ? AND expires_at > ${SQL_NOW} ORDER BY created_at DESC`,
      [user.id],
    ),
    currentSessionId(),
  ]);

  return (
    <>
      <PageHeader title="Profile & security" description="Your account details, password and signed-in devices." />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card className="hover-lift">
          <CardHeader className="flex flex-row items-center gap-4">
            <UserAvatar name={user.fullName} className="size-14 rounded-2xl text-base" />
            <div className="space-y-1">
              <CardTitle className="text-lg">{user.fullName}</CardTitle>
              <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm">
              <DetailRow icon={UserIcon} label="Username" value={`@${user.username}`} />
              <DetailRow icon={MailIcon} label="Email" value={user.email} />
              <DetailRow icon={ShieldIcon} label="Member since" value={<LocalTime iso={details?.created_at} />} />
              <DetailRow icon={ShieldIcon} label="Password changed" value={<LocalTime iso={details?.password_changed_at} />} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
            <CardDescription>Changing your password signs you out on every other device.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm username={user.username} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Active sessions</CardTitle>
            <CardDescription>Devices currently signed in to your account.</CardDescription>
          </div>
          {sessions.length > 1 && <SignOutOthersButton />}
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="hover:bg-accent/50 -mx-2 flex flex-wrap items-center justify-between gap-3 rounded-md px-2 py-3 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg">
                    <LaptopIcon className="size-4" />
                  </div>
                  <div>
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {describeAgent(s.user_agent)}
                      {s.id === thisSession && <Badge className="h-5">This device</Badge>}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {s.ip_address ?? "Unknown IP"} · signed in <LocalTime iso={s.created_at} />
                    </p>
                  </div>
                </div>
                <p className="text-muted-foreground text-xs">
                  Expires <LocalTime iso={s.expires_at} />
                </p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground flex items-center gap-2">
        <Icon className="size-4" /> {label}
      </dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}
