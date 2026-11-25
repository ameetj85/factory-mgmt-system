"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { issuePasswordReset } from "@/lib/auth/password-reset";
import { getDummyHash, hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, sha256 } from "@/lib/auth/session";
import { db, nowIso, transaction } from "@/lib/db/client";
import {
  emailSchema,
  formError,
  fullNameSchema,
  passwordSchema,
  safeRedirectPath,
  usernameSchema,
  validationError,
  withPasswordConfirmation,
  type FormState,
} from "@/lib/forms";

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;
const INVALID_CREDENTIALS = "Invalid username or password.";

const loginSchema = z.object({
  username: z.string().trim().min(1, "Enter your username."),
  password: z.string().min(1, "Enter your password."),
});

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const { username, password } = parsed.data;

  const user = await db.get<{
    id: number;
    password_hash: string;
    is_active: number;
    locked_until: string | null;
  }>("SELECT id, password_hash, is_active, locked_until FROM users WHERE username = ?", [username]);

  if (!user) {
    await verifyPassword(password, await getDummyHash());
    return formError(INVALID_CREDENTIALS);
  }

  const now = nowIso();
  if (user.locked_until && user.locked_until > now) {
    const minutes = Math.max(1, Math.ceil((Date.parse(user.locked_until) - Date.now()) / 60_000));
    return formError(`Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
  }

  if (!(await verifyPassword(password, user.password_hash))) {
    const lockUntil = nowIso(new Date(Date.now() + LOCKOUT_MINUTES * 60_000));
    await db.run(
      `UPDATE users
          SET failed_login_count = CASE WHEN failed_login_count + 1 >= ? THEN 0 ELSE failed_login_count + 1 END,
              locked_until       = CASE WHEN failed_login_count + 1 >= ? THEN ? ELSE locked_until END
        WHERE id = ?`,
      [MAX_FAILED_LOGINS, MAX_FAILED_LOGINS, lockUntil, user.id],
    );
    await writeAudit({ userId: user.id, action: "auth.login_failed", entityType: "user", entityId: user.id });
    return formError(INVALID_CREDENTIALS);
  }

  if (!user.is_active) {
    return formError("This account has been deactivated. Contact an administrator.");
  }

  await db.run("UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = ? WHERE id = ?", [
    now,
    user.id,
  ]);
  await createSession(user.id);
  await writeAudit({ userId: user.id, action: "auth.login", entityType: "user", entityId: user.id });

  redirect(safeRedirectPath(formData.get("next")));
}

const forgotSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your username or email."),
});

const FORGOT_RESPONSE =
  "If an active account matches, we've emailed a link to reset the password. Check your inbox in a few minutes.";

export async function forgotPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = forgotSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);

  const user = await db.get<{ id: number; email: string; full_name: string }>(
    "SELECT id, email, full_name FROM users WHERE (username = ? OR email = ?) AND is_active = 1",
    [parsed.data.identifier, parsed.data.identifier],
  );

  // Respond identically whether or not the account exists, so the form can't be used to discover accounts.
  if (user) {
    try {
      if (await issuePasswordReset(user)) {
        await writeAudit({ userId: user.id, action: "auth.password_reset_requested", entityType: "user", entityId: user.id });
      }
    } catch (error) {
      console.error("Failed to send password reset email", error);
    }
  }

  return { status: "success", message: FORGOT_RESPONSE };
}

const resetSchema = withPasswordConfirmation(
  z.object({
    token: z.string().min(1),
    password: passwordSchema,
    confirmPassword: z.string(),
  }),
);

export async function resetPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const { token, password } = parsed.data;

  const passwordHash = await hashPassword(password);
  const now = nowIso();

  const reset = await transaction(async (tx) => {
    const row = await tx.get<{ id: number; user_id: number }>(
      `SELECT t.id, t.user_id FROM password_reset_tokens t JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = ? AND t.used_at IS NULL AND t.expires_at > ? AND u.is_active = 1`,
      [sha256(token), now],
    );
    if (!row) return null;

    await tx.run("UPDATE password_reset_tokens SET used_at = ? WHERE id = ?", [now, row.id]);
    await tx.run(
      `UPDATE users SET password_hash = ?, password_changed_at = ?, failed_login_count = 0,
              locked_until = NULL, updated_at = ? WHERE id = ?`,
      [passwordHash, now, now, row.user_id],
    );
    // Sign the user out everywhere: whoever triggered the reset may not be the only one with the old password.
    await tx.run("DELETE FROM sessions WHERE user_id = ?", [row.user_id]);
    await writeAudit({ userId: row.user_id, action: "auth.password_reset", entityType: "user", entityId: row.user_id }, tx);
    return row;
  });

  if (!reset) return formError("This reset link is invalid or has expired. Request a new one.");
  redirect("/login?reset=1");
}

const setupSchema = withPasswordConfirmation(
  z.object({
    fullName: fullNameSchema,
    username: usernameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  }),
);

/** Creates the first administrator. Refuses once any user exists. */
export async function setupAdmin(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = setupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const { fullName, username, email, password } = parsed.data;
  const passwordHash = await hashPassword(password);

  const created = await transaction(async (tx) => {
    const existing = await tx.get<{ n: number }>("SELECT COUNT(*) AS n FROM users");
    if ((existing?.n ?? 0) > 0) return false;

    const now = nowIso();
    const { lastID } = await tx.run(
      `INSERT INTO users (username, email, full_name, password_hash, role, password_changed_at, last_login_at)
       VALUES (?, ?, ?, ?, 'admin', ?, ?)`,
      [username, email, fullName, passwordHash, now, now],
    );
    await writeAudit({ userId: lastID, action: "user.create", entityType: "user", entityId: lastID, details: { username, role: "admin", via: "initial setup" } }, tx);
    await createSession(lastID, tx);
    return true;
  });

  if (!created) return formError("Setup has already been completed. Sign in instead.");
  redirect("/dashboard");
}
