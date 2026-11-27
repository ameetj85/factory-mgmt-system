// Restores a backup into an EMPTY database. Usage:
//   RESTORE_DATABASE_URL="libsql://new-db-<org>.turso.io" RESTORE_AUTH_TOKEN="…" npm run db:restore -- backups/fms-backup-….json.gz
// Without RESTORE_DATABASE_URL it targets the configured database (TURSO_DATABASE_URL). Refuses a database that has tables.
// RESTORE_DATABASE_URL can also be a local file, e.g. file:./restored.db.
import { readFile } from "node:fs/promises";
import { decodeBackup, restoreBackup } from "../lib/backup/core.mjs";
import { createDatabase } from "../lib/db/factory.mjs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run db:restore -- <backup file>");
  process.exit(1);
}

const backup = decodeBackup(await readFile(file));
// RESTORE_AUTH_TOKEN falls back to TURSO_AUTH_TOKEN, which works when that token covers the target too.
const target = process.env.RESTORE_DATABASE_URL ? { url: process.env.RESTORE_DATABASE_URL, authToken: process.env.RESTORE_AUTH_TOKEN } : {};
const db = createDatabase(target);
try {
  console.log(`Restoring backup from ${backup.createdAt} (${backup.rowCount} rows) into ${db.displayName}${db.databaseName ? `: ${db.databaseName}` : ""}…`);
  await restoreBackup(db, backup, (m) => console.log("  " + m));
  console.log("Restore complete.");
} catch (error) {
  console.error("Restore failed:", error.message ?? error);
  process.exitCode = 1;
} finally {
  db.close();
}
