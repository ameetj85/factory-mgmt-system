import "server-only";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { backgroundDb as db, type SqlValue } from "@/lib/db/client";
import { BACKUP_NAME_PATTERN, backupFileName, createBackup, encodeBackup } from "./core.mjs";

export function backupDir(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.env.BACKUP_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "backups"));
}

export function backupKeep(): number {
  const n = Number(process.env.BACKUP_KEEP);
  return Number.isInteger(n) && n > 0 ? n : 14;
}

export function databaseName(): string | null {
  const cs = process.env.SQLITE_CONNECTION_STRING ?? "";
  return cs.match(/\/([^/?]+)(\?|$)/)?.[1] ?? null;
}

export interface BackupFile {
  name: string;
  size: number;
  createdAt: string;
}

export async function listBackups(): Promise<BackupFile[]> {
  const dir = backupDir();
  const names = await readdir(/*turbopackIgnore: true*/ dir).catch(() => [] as string[]);
  const files = await Promise.all(
    names
      .filter((n) => BACKUP_NAME_PATTERN.test(n))
      .map(async (name) => {
        const s = await stat(/*turbopackIgnore: true*/ path.join(dir, name));
        return { name, size: s.size, createdAt: s.mtime.toISOString() };
      }),
  );
  return files.sort((a, b) => b.name.localeCompare(a.name));
}

/** Writes a new backup file and prunes the oldest beyond the retention count. */
export async function runBackup(): Promise<BackupFile & { rows: number }> {
  const backup = await createBackup((sql, params) => db.all(sql, params as SqlValue[] | undefined), { database: databaseName() ?? undefined });
  const dir = backupDir();
  await mkdir(/*turbopackIgnore: true*/ dir, { recursive: true });
  const name = backupFileName();
  const data = encodeBackup(backup);
  await writeFile(/*turbopackIgnore: true*/ path.join(dir, name), data);

  const all = await listBackups();
  for (const old of all.slice(backupKeep())) await unlink(/*turbopackIgnore: true*/ path.join(dir, old.name)).catch(() => {});
  return { name, size: data.length, createdAt: backup.createdAt, rows: backup.rowCount };
}

export async function readBackup(name: string): Promise<Buffer | null> {
  if (!BACKUP_NAME_PATTERN.test(name)) return null;
  return readFile(/*turbopackIgnore: true*/ path.join(backupDir(), name)).catch(() => null);
}

export async function deleteBackup(name: string): Promise<boolean> {
  if (!BACKUP_NAME_PATTERN.test(name)) return false;
  return unlink(/*turbopackIgnore: true*/ path.join(backupDir(), name))
    .then(() => true)
    .catch(() => false);
}

/** SQLite Cloud's own managed backups for this database, if enabled on the project. */
export async function managedBackupStatus(): Promise<{ enabled: boolean; detail: string }> {
  const name = databaseName();
  if (!name) return { enabled: false, detail: "Database name not found in the connection string." };
  try {
    const rows = await db.all(`LIST BACKUPS DATABASE ${name.replace(/[^A-Za-z0-9._-]/g, "")}`);
    return { enabled: rows.length > 0, detail: rows.length ? `${rows.length} backup generation(s) available in SQLite Cloud.` : "No managed backups yet." };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { enabled: false, detail: /no active backups/i.test(message) ? "Not enabled for this database." : message };
  }
}
