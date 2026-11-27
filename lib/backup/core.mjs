// Database backup and restore, shared by the app (scheduled + on-demand backups) and the CLI scripts.
// Plain JavaScript so `node scripts/*.mjs` can import it without a build step.
//
// A backup is a gzip-compressed JSON snapshot: the full schema (tables, indexes, views, triggers) from
// sqlite_master plus every row of every table. Restoring recreates it into an EMPTY database. Hosted
// databases don't expose the database file, so VACUUM INTO / file copies aren't available to the app.
// Both directions use the provider-neutral driver operations from lib/db/factory.mjs.

import { gunzipSync, gzipSync } from "node:zlib";

const PAGE = 1000;
const RESTORE_PAGE = 500;
// Internal objects of SQLite, libSQL/Turso and SQLite Cloud are never part of a backup.
const SKIP = (name) => ["sqlite_", "libsql_", "_litestream", "_sqliteai"].some((prefix) => name.startsWith(prefix));
const quoteIdent = (name) => `"${String(name).replace(/"/g, '""')}"`;

/**
 * @param {(sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>} query
 * @param {{ database?: string }} meta
 */
export async function createBackup(query, meta = {}) {
  const schema = (await query("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY rowid")).filter(
    (o) => !SKIP(String(o.name)) && !SKIP(String(o.tbl_name)),
  );
  const tables = {};
  let rowCount = 0;
  for (const t of schema.filter((o) => o.type === "table")) {
    const columns = (await query(`PRAGMA table_info(${quoteIdent(t.name)})`)).map((c) => String(c.name));
    const rows = [];
    for (let offset = 0; ; offset += PAGE) {
      const page = await query(`SELECT * FROM ${quoteIdent(t.name)} ORDER BY rowid LIMIT ? OFFSET ?`, [PAGE, offset]);
      for (const r of page) rows.push(columns.map((c) => (r[c] === undefined ? null : r[c])));
      if (page.length < PAGE) break;
    }
    tables[t.name] = { columns, rows };
    rowCount += rows.length;
  }
  return { format: "fms-backup", version: 1, createdAt: new Date().toISOString(), database: meta.database ?? null, schema, tables, rowCount };
}

export function encodeBackup(backup) {
  return gzipSync(Buffer.from(JSON.stringify(backup)));
}

export function decodeBackup(buffer) {
  const backup = JSON.parse(gunzipSync(buffer).toString("utf8"));
  if (backup?.format !== "fms-backup" || backup.version !== 1) throw new Error("Not a Factory Management System backup file.");
  return backup;
}

/**
 * Restores into an empty database: tables, then rows (in pages), then indexes, views and triggers.
 * `database` is a DbDriver from lib/db/factory.mjs (only `query` and `batch` are used).
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>,
 *           batch: (statements: { sql: string, params?: unknown[] }[], options?: { foreignKeys?: boolean }) => Promise<void> }} database
 */
export async function restoreBackup(database, backup, onProgress = () => {}) {
  const existing = (await database.query("SELECT name FROM sqlite_master WHERE type = 'table'")).filter((t) => !SKIP(String(t.name)));
  if (existing.length > 0) {
    throw new Error(`The target database already has ${existing.length} table(s). Restore only into a new, empty database.`);
  }
  // Each step is one atomic batch with foreign key checks off, so table order doesn't matter.
  const noFk = { foreignKeys: false };
  const tables = backup.schema.filter((o) => o.type === "table");
  await database.batch(tables.map((t) => ({ sql: t.sql })), noFk);
  for (const t of tables) {
    const { columns, rows } = backup.tables[t.name] ?? { columns: [], rows: [] };
    if (!rows.length) continue;
    const insert = `INSERT INTO ${quoteIdent(t.name)} (${columns.map(quoteIdent).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
    for (let i = 0; i < rows.length; i += RESTORE_PAGE) {
      await database.batch(rows.slice(i, i + RESTORE_PAGE).map((row) => ({ sql: insert, params: row })), noFk);
    }
    onProgress(`${t.name}: ${rows.length} rows`);
  }
  const rest = ["index", "view", "trigger"].flatMap((type) => backup.schema.filter((o) => o.type === type));
  if (rest.length) await database.batch(rest.map((o) => ({ sql: o.sql })), noFk);
}

/** fms-backup-20261125-143000Z.json.gz */
export function backupFileName(date = new Date()) {
  const iso = date.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return `fms-backup-${iso.slice(0, 8)}-${iso.slice(9)}.json.gz`;
}

export const BACKUP_NAME_PATTERN = /^fms-backup-\d{8}-\d{6}Z\.json\.gz$/;
