import "server-only";
import { Database } from "@sqlitecloud/drivers";
import { connection } from "next/server";

export type SqlValue = string | number | bigint | boolean | null | undefined;
export type Row = Record<string, unknown>;

export interface RunResult {
  lastID: number;
  changes: number;
}

/** The query surface shared by the pooled connection and a transaction. */
export interface Executor {
  all<T = Row>(sql: string, params?: SqlValue[]): Promise<T[]>;
  get<T = Row>(sql: string, params?: SqlValue[]): Promise<T | undefined>;
  run(sql: string, params?: SqlValue[]): Promise<RunResult>;
}

const CONNECTION_PRAGMAS = [
  "PRAGMA foreign_keys = ON",
  "PRAGMA busy_timeout = 5000",
];

function connectionString(): string {
  const cs = process.env.SQLITE_CONNECTION_STRING;
  if (!cs) throw new Error("SQLITE_CONNECTION_STRING is not set");
  return cs;
}

function openConnection(): Promise<Database> {
  return new Promise((resolve, reject) => {
    const db = new Database(connectionString(), async (err) => {
      if (err) return reject(err);
      try {
        for (const pragma of CONNECTION_PRAGMAS) await db.sql(pragma);
        resolve(db);
      } catch (e) {
        db.close();
        reject(e);
      }
    });
  });
}

function normalizeParams(params: SqlValue[] = []) {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === "boolean") return p ? 1 : 0;
    return p;
  });
}

/** Converts driver row instances into plain objects that are safe to pass to Client Components. */
function toPlainRows<T>(result: unknown): T[] {
  if (!Array.isArray(result)) return [];
  return result.map((row) => ({ ...(row as Row) }) as T);
}

function createExecutor(getConn: () => Promise<Database>): Executor {
  return {
    async all<T>(sql: string, params?: SqlValue[]) {
      // Database reads are request-time data: never prerender them into the static shell.
      await connection();
      const conn = await getConn();
      return toPlainRows<T>(await conn.sql(sql, ...normalizeParams(params)));
    },
    async get<T>(sql: string, params?: SqlValue[]) {
      const rows = await this.all<T>(sql, params);
      return rows[0];
    },
    async run(sql: string, params?: SqlValue[]) {
      await connection();
      const conn = await getConn();
      const result = await conn.sql(sql, ...normalizeParams(params));
      return {
        lastID: Number(result?.lastID ?? 0),
        changes: Number(result?.changes ?? 0),
      };
    },
  };
}

// One long-lived connection per server process for reads and single-statement writes.
// It survives dev hot reloads by living on globalThis.
const globalForDb = globalThis as unknown as { __fmsDb?: Promise<Database> };

function sharedConnection(): Promise<Database> {
  const existing = globalForDb.__fmsDb;
  if (existing) {
    return existing.then((db) => {
      if (db.isConnected()) return db;
      globalForDb.__fmsDb = undefined;
      return sharedConnection();
    });
  }
  const pending = openConnection();
  globalForDb.__fmsDb = pending;
  pending.catch(() => {
    if (globalForDb.__fmsDb === pending) globalForDb.__fmsDb = undefined;
  });
  return pending;
}

export const db: Executor = createExecutor(sharedConnection);

/**
 * Runs `fn` inside a BEGIN IMMEDIATE transaction on a dedicated connection, so statements
 * from concurrent requests can never interleave with it. Commits on success and rolls
 * back on any thrown error.
 */
export async function transaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T> {
  const conn = await openConnection();
  const tx = createExecutor(async () => conn);
  try {
    await conn.sql("BEGIN IMMEDIATE");
    const result = await fn(tx);
    await conn.sql("COMMIT");
    return result;
  } catch (error) {
    try {
      await conn.sql("ROLLBACK");
    } catch {
      // The transaction may already be closed; the original error is what matters.
    }
    throw error;
  } finally {
    conn.close();
  }
}

/** Current UTC time as an ISO-8601 string without milliseconds (YYYY-MM-DDTHH:MM:SSZ). */
export function nowIso(date: Date = new Date()): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * SQL expression for the current UTC time in the same format as nowIso(). Use it in read queries
 * rendered by Server Components, where reading the JS clock before a request-time access is disallowed.
 */
export const SQL_NOW = "strftime('%Y-%m-%dT%H:%M:%SZ', 'now')";
