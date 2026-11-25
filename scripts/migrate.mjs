// Applies pending SQL migrations from db/migrations in filename order.
// Usage: npm run db:migrate
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Database } from "@sqlitecloud/drivers";

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../db/migrations");

function open(connectionString) {
  return new Promise((resolve, reject) => {
    const db = new Database(connectionString, (err) => (err ? reject(err) : resolve(db)));
  });
}

function exec(db, sql) {
  return new Promise((resolve, reject) => db.exec(sql, (err) => (err ? reject(err) : resolve())));
}

async function main() {
  const connectionString = process.env.SQLITE_CONNECTION_STRING;
  if (!connectionString) throw new Error("SQLITE_CONNECTION_STRING is not set");

  const db = await open(connectionString);
  try {
    await db.sql("PRAGMA foreign_keys = ON");
    await db.sql(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    )`);

    const applied = new Set((await db.sql("SELECT name FROM schema_migrations")).map((r) => r.name));
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
    const pending = files.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log("Database is up to date.");
      return;
    }

    for (const file of pending) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      process.stdout.write(`Applying ${file} ... `);
      try {
        await exec(db, `BEGIN IMMEDIATE;\n${sql}\nINSERT INTO schema_migrations (name) VALUES ('${file}');\nCOMMIT;`);
        console.log("done");
      } catch (error) {
        await exec(db, "ROLLBACK;").catch(() => {});
        console.log("failed");
        throw error;
      }
    }
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
