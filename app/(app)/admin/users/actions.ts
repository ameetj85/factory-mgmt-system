"use server";

import { randomBytes } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/dal";
import { hashPassword } from "@/lib/auth/password";
import { issuePasswordReset } from "@/lib/auth/password-reset";
import { ROLES } from "@/lib/auth/permissions";
import { db, nowIso, transaction, type Executor } from "@/lib/db/client";
import {
  emailSchema,
  formError,
  fullNameSchema,
  passwordSchema,
  usernameSchema,
  validationError,
  withPasswordConfirmation,
  type FormState,
} from "@/lib/forms";

const userIdSchema = z.coerce.number().int().positive();

/** Maps a UNIQUE constraint failure to a field error, or rethrows anything else. */
function uniqueViolation(error: unknown): FormState {
  const message = error instanceof Error ? error.message : String(error);
  if (/UNIQUE constraint failed: users\.username/i.test(message)) {
    return { status: "error", message: "Please correct the highlighted fields.", fieldErrors: { username: ["That username is taken."] } };
  }
  if (/UNIQUE constraint failed: users\.email/i.test(message)) {
    return { status: "error", message: "Please correct the highlighted fields.", fieldErrors: { email: ["That email is already in use."] } };
  }
  throw error;
}

/** Checks username/email uniqueness up front so the common case doesn't depend on a constraint error. */
async function findConflict(
  tx: Executor,
  { username, email, excludeId }: { username?: string; email: string; excludeId?: number },
): Promise<FormState | null> {
  const row = await tx.get<{ username: string; email: string }>(
    "SELECT username, email FROM users WHERE (username = ? OR email = ?) AND id <> ?",
    [username ?? null, email, excludeId ?? 0],
  );
  if (!row) return null;
  const fieldErrors: Record<string, string[]> = {};
  if (username && row.username.toLowerCase() === username.toLowerCase()) fieldErrors.username = ["That username is taken."];
  if (row.email.toLowerCase() === email.toLowerCase()) fieldErrors.email = ["That email is already in use."];
  return { status: "error", message: "Please correct the highlighted fields.", fieldErrors };
}

async function otherActiveAdmins(tx: Executor, excludingUserId: number): Promise<number> {
  const row = await tx.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND is_active = 1 AND id <> ?",
    [excludingUserId],
  );
  return row?.n ?? 0;
}

const createUserSchema = z.object({
  fullName: fullNameSchema,
  username: usernameSchema,
  email: emailSchema,
  role: z.enum(ROLES, "Choose a role."),
  password: z.union([z.literal(""), passwordSchema]),
});

export async function createUser(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requirePermission("users.manage");
  const parsed = createUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const { fullName, username, email, role, password } = parsed.data;

  // Without a password, the account gets an unguessable one and the user sets their own from an emailed link.
  const sendInvite = password === "";
  const passwordHash = await hashPassword(sendInvite ? randomBytes(32).toString("hex") : password);

  let userId: number;
  try {
    const result = await transaction(async (tx): Promise<number | FormState> => {
      const conflict = await findConflict(tx, { username, email });
      if (conflict) return conflict;
      const { lastID } = await tx.run(
        `INSERT INTO users (username, email, full_name, password_hash, role, password_changed_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [username, email, fullName, passwordHash, role, sendInvite ? null : nowIso()],
      );
      await writeAudit(
        { userId: admin.id, action: "user.create", entityType: "user", entityId: lastID, details: { username, email, role } },
        tx,
      );
      return lastID;
    });
    if (typeof result !== "number") return result;
    userId = result;
  } catch (error) {
    return uniqueViolation(error);
  }

  refresh();
  if (!sendInvite) return { status: "success", message: `${fullName} can now sign in as @${username}.` };

  try {
    await issuePasswordReset({ id: userId, email, full_name: fullName });
    return { status: "success", message: `Account created. A link to set a password was emailed to ${email}.` };
  } catch (error) {
    console.error("Failed to send invite email", error);
    return {
      status: "success",
      message: "Account created, but the email could not be sent. Use “Send reset link” to try again.",
    };
  }
}

const updateUserSchema = z.object({
  id: userIdSchema,
  fullName: fullNameSchema,
  email: emailSchema,
  role: z.enum(ROLES, "Choose a role."),
});

export async function updateUser(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requirePermission("users.manage");
  const parsed = updateUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const { id, fullName, email, role } = parsed.data;

  try {
    const result = await transaction(async (tx): Promise<FormState | null> => {
      const before = await tx.get<{ full_name: string; email: string; role: string; is_active: number }>(
        "SELECT full_name, email, role, is_active FROM users WHERE id = ?",
        [id],
      );
      if (!before) return formError("User not found.");
      const conflict = await findConflict(tx, { email, excludeId: id });
      if (conflict) return conflict;

      if (before.role === "admin" && role !== "admin") {
        if (id === admin.id) return formError("You can't remove your own administrator role.");
        if (before.is_active && (await otherActiveAdmins(tx, id)) === 0) {
          return formError("At least one active administrator is required.");
        }
      }

      await tx.run("UPDATE users SET full_name = ?, email = ?, role = ?, updated_at = ? WHERE id = ?", [
        fullName,
        email,
        role,
        nowIso(),
        id,
      ]);

      const changes: Record<string, { from: unknown; to: unknown }> = {};
      if (before.full_name !== fullName) changes.fullName = { from: before.full_name, to: fullName };
      if (before.email !== email) changes.email = { from: before.email, to: email };
      if (before.role !== role) changes.role = { from: before.role, to: role };
      if (Object.keys(changes).length > 0) {
        await writeAudit({ userId: admin.id, action: "user.update", entityType: "user", entityId: id, details: changes }, tx);
      }
      return null;
    });
    if (result) return result;
  } catch (error) {
    return uniqueViolation(error);
  }

  refresh();
  return { status: "success", message: "User updated." };
}

export async function setUserActive(userId: number, active: boolean): Promise<FormState> {
  const admin = await requirePermission("users.manage");
  const id = userIdSchema.parse(userId);
  if (id === admin.id && !active) return formError("You can't deactivate your own account.");

  const result = await transaction(async (tx): Promise<FormState | null> => {
    const user = await tx.get<{ role: string; is_active: number; full_name: string }>(
      "SELECT role, is_active, full_name FROM users WHERE id = ?",
      [id],
    );
    if (!user) return formError("User not found.");
    if (!active && user.role === "admin" && (await otherActiveAdmins(tx, id)) === 0) {
      return formError("At least one active administrator is required.");
    }

    await tx.run(
      "UPDATE users SET is_active = ?, failed_login_count = 0, locked_until = NULL, updated_at = ? WHERE id = ?",
      [active ? 1 : 0, nowIso(), id],
    );
    if (!active) await tx.run("DELETE FROM sessions WHERE user_id = ?", [id]);
    await writeAudit({ userId: admin.id, action: active ? "user.activate" : "user.deactivate", entityType: "user", entityId: id }, tx);
    return { status: "success", message: `${user.full_name} ${active ? "reactivated" : "deactivated"}.` };
  });

  refresh();
  return result ?? { status: "idle" };
}

export async function sendUserPasswordReset(userId: number): Promise<FormState> {
  const admin = await requirePermission("users.manage");
  const id = userIdSchema.parse(userId);
  const user = await db.get<{ id: number; email: string; full_name: string; is_active: number }>(
    "SELECT id, email, full_name, is_active FROM users WHERE id = ?",
    [id],
  );
  if (!user) return formError("User not found.");
  if (!user.is_active) return formError("Reactivate this account before sending a reset link.");

  try {
    const sent = await issuePasswordReset(user);
    if (!sent) return formError("Too many reset links were sent recently. Try again in 15 minutes.");
  } catch (error) {
    console.error("Failed to send password reset email", error);
    return formError("The email could not be sent. Check the SMTP settings and try again.");
  }

  await writeAudit({ userId: admin.id, action: "user.password_reset_sent", entityType: "user", entityId: id });
  return { status: "success", message: `Reset link sent to ${user.email}.` };
}

const setPasswordSchema = withPasswordConfirmation(
  z.object({ id: userIdSchema, password: passwordSchema, confirmPassword: z.string() }),
);

export async function setUserPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requirePermission("users.manage");
  const parsed = setPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const { id, password } = parsed.data;
  const passwordHash = await hashPassword(password);
  const now = nowIso();

  const updated = await transaction(async (tx) => {
    const { changes } = await tx.run(
      `UPDATE users SET password_hash = ?, password_changed_at = ?, failed_login_count = 0, locked_until = NULL,
              updated_at = ? WHERE id = ?`,
      [passwordHash, now, now, id],
    );
    if (changes === 0) return false;
    // Keep the admin's own session if they're resetting themselves.
    await tx.run("DELETE FROM sessions WHERE user_id = ? AND user_id <> ?", [id, admin.id]);
    await writeAudit({ userId: admin.id, action: "user.password_set", entityType: "user", entityId: id }, tx);
    return true;
  });

  if (!updated) return formError("User not found.");
  refresh();
  return { status: "success", message: "Password updated. The user has been signed out of all devices." };
}
