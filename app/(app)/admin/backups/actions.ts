"use server";

import { refresh } from "next/cache";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/dal";
import { deleteBackup, runBackup } from "@/lib/backup/service";
import { formError, type FormState } from "@/lib/forms";

export async function backupNow(): Promise<FormState> {
  const user = await requirePermission("system.configure");
  try {
    const result = await runBackup();
    await writeAudit({ userId: user.id, action: "system.backup", entityType: "backup", entityId: result.name, details: { rows: result.rows, bytes: result.size } });
    refresh();
    return { status: "success", message: `Backup ${result.name} written (${result.rows.toLocaleString()} rows).` };
  } catch (error) {
    console.error("Backup failed", error);
    return formError("The backup failed. Check the server log and that the backup folder is writable.");
  }
}

export async function removeBackup(name: string): Promise<FormState> {
  const user = await requirePermission("system.configure");
  if (!(await deleteBackup(name))) return formError("Backup not found.");
  await writeAudit({ userId: user.id, action: "system.backup_delete", entityType: "backup", entityId: name });
  refresh();
  return { status: "success", message: `${name} deleted.` };
}
