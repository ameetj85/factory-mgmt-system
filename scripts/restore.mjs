// Restores a backup into an EMPTY database. Usage:
//   RESTORE_CONNECTION_STRING="sqlitecloud://…/new-db.sqlite?apikey=…" npm run db:restore -- backups/fms-backup-….json.gz
// Falls back to SQLITE_CONNECTION_STRING when RESTORE_CONNECTION_STRING isn't set. Refuses a database that has tables.
import { readFile } from "node:fs/promises";
import { Database } from "@sqlitecloud/drivers";
import { decodeBackup, restoreBackup } from "../lib/backup/core.mjs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run db:restore -- <backup file>");
  process.exit(1);
}
const cs = process.env.RESTORE_CONNECTION_STRING || process.env.SQLITE_CONNECTION_STRING;
if (!cs) throw new Error("Set RESTORE_CONNECTION_STRING (or SQLITE_CONNECTION_STRING)");

const backup = decodeBackup(await readFile(file));
const db = await new Promise((resolve, reject) => {
  const d = new Database(cs, (err) => (err ? reject(err) : resolve(d)));
});
try {
  const exec = (sql, params = []) => db.sql(sql, ...params);
  const query = async (sql, params = []) => [...(await db.sql(sql, ...params))].map((r) => ({ ...r }));
  console.log(`Restoring backup from ${backup.createdAt} (${backup.rowCount} rows)…`);
  await restoreBackup(exec, query, backup, (m) => console.log("  " + m));
  console.log("Restore complete.");
} catch (error) {
  console.error("Restore failed:", error.message ?? error);
  process.exitCode = 1;
} finally {
  db.close();
}
