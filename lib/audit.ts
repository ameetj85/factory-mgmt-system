import "server-only";
import { db, type Executor } from "@/lib/db/client";
import { getRequestMeta } from "@/lib/auth/session";

export interface AuditEntry {
  userId: number | null;
  action: string;
  entityType?: string;
  entityId?: string | number;
  details?: Record<string, unknown>;
}

/** Appends a row to the audit log. Pass the transaction executor to make it part of the same commit. */
export async function writeAudit(entry: AuditEntry, executor: Executor = db): Promise<void> {
  const { ip } = await getRequestMeta();
  await executor.run(
    "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)",
    [
      entry.userId,
      entry.action,
      entry.entityType ?? null,
      entry.entityId != null ? String(entry.entityId) : null,
      entry.details ? JSON.stringify(entry.details) : null,
      ip,
    ],
  );
}
