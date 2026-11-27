// Writes a database backup to BACKUP_DIR (default ./backups). Usage: npm run db:backup
// Schedule it with cron or Windows Task Scheduler, or set BACKUP_INTERVAL_HOURS for the running server.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { backupFileName, createBackup, encodeBackup } from "../lib/backup/core.mjs";
import { createDatabase } from "../lib/db/factory.mjs";

const db = createDatabase();
try {
  const backup = await createBackup((sql, params) => db.query(sql, params), { database: db.databaseName ?? undefined });
  const dir = path.resolve(process.env.BACKUP_DIR || "backups");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, backupFileName());
  await writeFile(file, encodeBackup(backup));
  console.log(`Backup written: ${file} (${backup.rowCount} rows, ${Object.keys(backup.tables).length} tables)`);
} finally {
  db.close();
}
