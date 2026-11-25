// Writes a database backup to BACKUP_DIR (default ./backups). Usage: npm run db:backup
// Schedule it with cron or Windows Task Scheduler, or set BACKUP_INTERVAL_HOURS for the running server.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Database } from "@sqlitecloud/drivers";
import { backupFileName, createBackup, encodeBackup } from "../lib/backup/core.mjs";

const cs = process.env.SQLITE_CONNECTION_STRING;
if (!cs) throw new Error("SQLITE_CONNECTION_STRING is not set");
const db = await new Promise((resolve, reject) => {
  const d = new Database(cs, (err) => (err ? reject(err) : resolve(d)));
});
try {
  const query = async (sql, params = []) => [...(await db.sql(sql, ...params))].map((r) => ({ ...r }));
  const backup = await createBackup(query, { database: cs.match(/\/([^/?]+)(\?|$)/)?.[1] });
  const dir = path.resolve(process.env.BACKUP_DIR || "backups");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, backupFileName());
  await writeFile(file, encodeBackup(backup));
  console.log(`Backup written: ${file} (${backup.rowCount} rows, ${Object.keys(backup.tables).length} tables)`);
} finally {
  db.close();
}
