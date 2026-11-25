import "server-only";
import { db, nowIso, SQL_NOW, transaction } from "@/lib/db/client";
import { appUrl, sendPasswordResetEmail } from "@/lib/email";
import { generateToken, getRequestMeta, sha256 } from "./session";

export const RESET_TOKEN_TTL_MINUTES = 60;
const MAX_REQUESTS_PER_WINDOW = 3;
const REQUEST_WINDOW_MINUTES = 15;

interface ResetRecipient {
  id: number;
  email: string;
  full_name: string;
}

/**
 * Issues a single-use reset token (invalidating any earlier unused ones) and emails the link.
 * Returns false without sending when the user has requested too many resets recently.
 */
export async function issuePasswordReset(user: ResetRecipient): Promise<boolean> {
  const windowStart = nowIso(new Date(Date.now() - REQUEST_WINDOW_MINUTES * 60_000));
  const recent = await db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM password_reset_tokens WHERE user_id = ? AND created_at > ?",
    [user.id, windowStart],
  );
  if ((recent?.n ?? 0) >= MAX_REQUESTS_PER_WINDOW) return false;

  const token = generateToken();
  const now = nowIso();
  const expiresAt = nowIso(new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000));
  const { ip } = await getRequestMeta();

  await transaction(async (tx) => {
    await tx.run("UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL", [now, user.id]);
    await tx.run(
      "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, requested_ip) VALUES (?, ?, ?, ?)",
      [user.id, sha256(token), expiresAt, ip],
    );
  });

  const resetUrl = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  await sendPasswordResetEmail(user.email, user.full_name, resetUrl, RESET_TOKEN_TTL_MINUTES);
  return true;
}

/** Looks up a still-valid reset token for an active user. */
export async function findValidResetToken(token: string) {
  return db.get<{ id: number; user_id: number; username: string; full_name: string }>(
    `SELECT t.id, t.user_id, u.username, u.full_name
       FROM password_reset_tokens t
       JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = ? AND t.used_at IS NULL AND t.expires_at > ${SQL_NOW} AND u.is_active = 1`,
    [sha256(token)],
  );
}
