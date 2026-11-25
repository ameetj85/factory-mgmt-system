"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/dal";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { currentSessionId } from "@/lib/auth/session";
import { db, nowIso, transaction } from "@/lib/db/client";
import { passwordSchema, validationError, withPasswordConfirmation, type FormState } from "@/lib/forms";

const changePasswordSchema = withPasswordConfirmation(
  z.object({
    currentPassword: z.string().min(1, "Enter your current password."),
    password: passwordSchema,
    confirmPassword: z.string(),
  }),
);

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const { currentPassword, password } = parsed.data;

  const row = await db.get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", [user.id]);
  if (!row || !(await verifyPassword(currentPassword, row.password_hash))) {
    return { status: "error", message: "Please correct the highlighted fields.", fieldErrors: { currentPassword: ["Current password is incorrect."] } };
  }
  if (currentPassword === password) {
    return { status: "error", message: "Please correct the highlighted fields.", fieldErrors: { password: ["Choose a password different from your current one."] } };
  }

  const passwordHash = await hashPassword(password);
  const sessionId = await currentSessionId();
  const now = nowIso();

  await transaction(async (tx) => {
    await tx.run("UPDATE users SET password_hash = ?, password_changed_at = ?, updated_at = ? WHERE id = ?", [
      passwordHash,
      now,
      now,
      user.id,
    ]);
    // Keep this device signed in, sign out everywhere else.
    await tx.run("DELETE FROM sessions WHERE user_id = ? AND id <> ?", [user.id, sessionId ?? ""]);
    await writeAudit({ userId: user.id, action: "auth.password_changed", entityType: "user", entityId: user.id }, tx);
  });

  refresh();
  return { status: "success", message: "Password updated. Other devices have been signed out." };
}

export async function signOutOtherSessions(): Promise<FormState> {
  const user = await requireUser();
  const sessionId = await currentSessionId();
  const { changes } = await db.run("DELETE FROM sessions WHERE user_id = ? AND id <> ?", [user.id, sessionId ?? ""]);
  await writeAudit({ userId: user.id, action: "auth.sessions_revoked", entityType: "user", entityId: user.id, details: { count: changes } });
  refresh();
  return {
    status: "success",
    message: changes === 1 ? "Signed out 1 other session." : `Signed out ${changes} other sessions.`,
  };
}
