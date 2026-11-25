import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/dal";
import { isRole, ROLES, type Role } from "@/lib/auth/permissions";
import { db, SQL_NOW, type SqlValue } from "@/lib/db/client";
import { CreateUserDialog } from "./create-user-dialog";
import { UserFilters } from "./user-filters";
import { UsersTable, type UserRow } from "./users-table";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const admin = await requirePermission("users.manage");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const role = isRole(params.role) ? params.role : undefined;
  const status = params.status === "active" || params.status === "inactive" ? params.status : undefined;

  const where: string[] = [];
  const args: SqlValue[] = [];
  if (q) {
    where.push("(username LIKE ? OR full_name LIKE ? OR email LIKE ?)");
    const like = `%${q}%`;
    args.push(like, like, like);
  }
  if (role) {
    where.push("role = ?");
    args.push(role);
  }
  if (status) where.push(status === "active" ? "is_active = 1" : "is_active = 0");

  const [rows, roleCounts] = await Promise.all([
    db.all<{
      id: number;
      username: string;
      email: string;
      full_name: string;
      role: Role;
      is_active: number;
      is_locked: number;
      last_login_at: string | null;
      created_at: string;
    }>(
      `SELECT id, username, email, full_name, role, is_active, COALESCE(locked_until > ${SQL_NOW}, 0) AS is_locked, last_login_at, created_at
         FROM users ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY is_active DESC, full_name COLLATE NOCASE`,
      args,
    ),
    db.all<{ role: Role; n: number }>("SELECT role, COUNT(*) AS n FROM users WHERE is_active = 1 GROUP BY role"),
  ]);

  const users: UserRow[] = rows.map((r) => ({
    id: r.id,
    username: r.username,
    email: r.email,
    fullName: r.full_name,
    role: r.role,
    isActive: r.is_active === 1,
    isLocked: r.is_locked === 1,
    lastLoginAt: r.last_login_at,
    createdAt: r.created_at,
  }));
  const counts = Object.fromEntries(ROLES.map((r) => [r, roleCounts.find((c) => c.role === r)?.n ?? 0])) as Record<Role, number>;

  return (
    <>
      <PageHeader title="Users" description="Manage who can sign in and what each person can do.">
        <CreateUserDialog />
      </PageHeader>

      <Card>
        <CardContent className="space-y-4">
          <UserFilters q={q} role={role} status={status} counts={counts} />
          <UsersTable users={users} currentUserId={admin.id} />
        </CardContent>
      </Card>
    </>
  );
}
