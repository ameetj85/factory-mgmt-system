import "server-only";
import { connection } from "next/server";
import { createDatabase, type DbDriver, type DbOperations, type Row, type RunResult, type SqlValue } from "./factory.mjs";

export type { Row, RunResult, SqlValue };

/** The query surface shared by the shared client and a transaction. */
export interface Executor {
  all<T = Row>(sql: string, params?: SqlValue[]): Promise<T[]>;
  get<T = Row>(sql: string, params?: SqlValue[]): Promise<T | undefined>;
  run(sql: string, params?: SqlValue[]): Promise<RunResult>;
}

// One driver per server process, chosen by the factory from DB_PROVIDER. It is created on first use
// (so builds don't need credentials) and survives dev hot reloads by living on globalThis.
const globalForDb = globalThis as unknown as { __fmsDbDriver?: DbDriver };

/** The configured driver. Only infrastructure code (backups) should need it; queries go through `db`. */
export function getDatabaseDriver(): DbDriver {
  return (globalForDb.__fmsDbDriver ??= createDatabase());
}

function createExecutor(ops: () => DbOperations, { requestScoped, retryReads }: { requestScoped: boolean; retryReads: boolean }): Executor {
  return {
    async all<T>(sql: string, params?: SqlValue[]) {
      // Database reads are request-time data: never prerender them into the static shell.
      if (requestScoped) await connection();
      try {
        return await ops().query<T>(sql, params);
      } catch (error) {
        // Reads are safe to repeat after a network failure; writes never retry.
        if (!retryReads || !getDatabaseDriver().isConnectionError(error)) throw error;
        return ops().query<T>(sql, params);
      }
    },
    async get<T>(sql: string, params?: SqlValue[]) {
      const rows = await this.all<T>(sql, params);
      return rows[0];
    },
    async run(sql: string, params?: SqlValue[]) {
      if (requestScoped) await connection();
      return ops().run(sql, params);
    },
  };
}

/** For reads and single-statement writes. */
export const db: Executor = createExecutor(getDatabaseDriver, { requestScoped: true, retryReads: true });

/** For work outside a request (scheduled jobs). Never use it in rendering code. */
export const backgroundDb: Executor = createExecutor(getDatabaseDriver, { requestScoped: false, retryReads: true });

/**
 * Runs `fn` in a write transaction (BEGIN IMMEDIATE), so statements from concurrent requests can
 * never interleave with it. Commits on success and rolls back on any thrown error.
 */
export async function transaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T> {
  return getDatabaseDriver().transaction((tx) => fn(createExecutor(() => tx, { requestScoped: true, retryReads: false })));
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
