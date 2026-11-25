"use server";

import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/dal";
import { destroySession } from "@/lib/auth/session";

export async function logout(): Promise<void> {
  const user = await getCurrentUser();
  await destroySession();
  if (user) await writeAudit({ userId: user.id, action: "auth.logout", entityType: "user", entityId: user.id });
  redirect("/login");
}
