import "server-only";
import { cache } from "react";
import { forbidden, redirect } from "next/navigation";
import { db, SQL_NOW } from "@/lib/db/client";
import { can, type Permission, type Role } from "./permissions";
import { currentSessionId } from "./session";

export interface SessionUser {
  id: number;
  username: string;
  email: string;
  fullName: string;
  role: Role;
}

/** Resolves the signed-in user from the session cookie, once per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const sessionId = await currentSessionId();
  if (!sessionId) return null;

  const row = await db.get<{
    id: number;
    username: string;
    email: string;
    full_name: string;
    role: Role;
  }>(
    `SELECT u.id, u.username, u.email, u.full_name, u.role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > ${SQL_NOW} AND u.is_active = 1`,
    [sessionId],
  );
  if (!row) return null;

  return { id: row.id, username: row.username, email: row.email, fullName: row.full_name, role: row.role };
});

/** Returns the signed-in user, or redirects to the login page. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Returns the signed-in user if their role grants `permission`; otherwise renders the 403 page. */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) forbidden();
  return user;
}
