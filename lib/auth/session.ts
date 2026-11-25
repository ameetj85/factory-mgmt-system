import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { db, nowIso, type Executor } from "@/lib/db/client";

export const SESSION_COOKIE = "fms_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function getRequestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ip: forwarded || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
  };
}

/** Creates a session row and sets the session cookie. Call only from Server Actions or Route Handlers. */
export async function createSession(userId: number, executor: Executor = db): Promise<void> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const { ip, userAgent } = await getRequestMeta();

  await executor.run(
    "INSERT INTO sessions (id, user_id, expires_at, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)",
    [sha256(token), userId, nowIso(expiresAt), ip, userAgent],
  );

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function getSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function currentSessionId(): Promise<string | undefined> {
  const token = await getSessionToken();
  return token ? sha256(token) : undefined;
}

/** Deletes the current session row and clears the cookie. */
export async function destroySession(): Promise<void> {
  const sessionId = await currentSessionId();
  if (sessionId) await db.run("DELETE FROM sessions WHERE id = ?", [sessionId]);
  (await cookies()).delete(SESSION_COOKIE);
}
