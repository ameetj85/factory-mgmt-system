// Applies pending SQL migrations from db/migrations in filename order.
// Usage: npm run db:migrate
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createDatabase } from "../lib/db/factory.mjs";

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../db/migrations");

async function main() {
  const db = createDatabase();
  try {
    await db.run(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    )`);

    const applied = new Set((await db.query("SELECT name FROM schema_migrations")).map((r) => r.name));
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
    const pending = files.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log(`Database is up to date (${db.displayName}${db.databaseName ? `: ${db.databaseName}` : ""}).`);
      return;
    }

    for (const file of pending) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      process.stdout.write(`Applying ${file} ... `);
      try {
        // The migration and its bookkeeping row commit together or not at all.
        await db.transaction(async (tx) => {
          await tx.exec(sql);
          await tx.run("INSERT INTO schema_migrations (name) VALUES (?)", [file]);
        });
        console.log("done");
      } catch (error) {
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
