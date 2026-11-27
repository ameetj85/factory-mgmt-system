// libSQL driver for Turso Cloud (libsql://…, https://…) and local libSQL/SQLite files (file:…).
// This is the only module that imports @libsql/client.
//
// Remote libSQL runs each statement over HTTP, so connection PRAGMAs don't persist between requests.
// Turso enforces foreign keys by default, which is what the schema relies on.

import { createClient } from "@libsql/client";

function normalizeParams(params = []) {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === "boolean") return p ? 1 : 0;
    return p;
  });
}

/** libSQL rows expose columns as enumerable properties (indexes are hidden), so a spread gives a plain object. */
function toPlainRows(resultSet) {
  return resultSet.rows.map((row) => ({ ...row }));
}

/**
 * Turso URLs look like libsql://<database>-<organization>.<region>.turso.io, so the database name is the
 * text between "://" and the first "-". For a file: URL it is the file name without its extension.
 */
export function databaseNameFromUrl(url) {
  if (url.startsWith("file:")) {
    const file = url.slice("file:".length).split(/[?#]/)[0].split(/[\\/]/).pop() ?? "";
    return file.replace(/\.[^.]+$/, "") || null;
  }
  return url.match(/:\/\/([^-./:?#]+)/)?.[1] ?? null;
}

const NETWORK_ERROR =
  /fetch failed|socket hang up|network|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|EAI_AGAIN|ENOTFOUND|UND_ERR|status (502|503|504)/i;

function isConnectionError(error) {
  for (let e = error, depth = 0; e && depth < 5; e = e.cause, depth++) {
    if (e.code === "HRANA_WEBSOCKET_ERROR" || e.code === "HRANA_CLOSED_ERROR") return true;
    if ([502, 503, 504].includes(e.status)) return true;
    if (NETWORK_ERROR.test(String(e.code ?? "")) || NETWORK_ERROR.test(String(e.message ?? ""))) return true;
  }
  return false;
}

/** Statement operations over anything with execute()/executeMultiple(): the client or a transaction. */
function operations(target) {
  return {
    async query(sql, params) {
      return toPlainRows(await target.execute({ sql, args: normalizeParams(params) }));
    },
    async run(sql, params) {
      const result = await target.execute({ sql, args: normalizeParams(params) });
      return { lastID: Number(result.lastInsertRowid ?? 0), changes: result.rowsAffected };
    },
    async exec(script) {
      await target.executeMultiple(script);
    },
  };
}

/**
 * @param {{ provider: string, url: string, authToken?: string }} config
 * @returns {import("../factory.mjs").DbDriver}
 */
export function createLibsqlDriver({ provider, url, authToken }) {
  const client = createClient({ url, authToken: authToken || undefined, intMode: "number" });
  const isLocal = url.startsWith("file:");

  return {
    provider,
    displayName: isLocal ? "Local libSQL file" : "Turso Cloud",
    databaseName: databaseNameFromUrl(url),
    ...operations(client),

    async transaction(fn) {
      // "write" opens with BEGIN IMMEDIATE, so the transaction holds the write lock from its first statement.
      const tx = await client.transaction("write");
      try {
        const result = await fn(operations(tx));
        await tx.commit();
        return result;
      } catch (error) {
        try {
          await tx.rollback();
        } catch {
          // The transaction may already be closed; the original error is what matters.
        }
        throw error;
      } finally {
        tx.close();
      }
    },

    async batch(statements, { foreignKeys = true } = {}) {
      const stmts = statements.map(({ sql, params }) => ({ sql, args: normalizeParams(params) }));
      // migrate() is batch() wrapped in PRAGMA foreign_keys=off/on on the same connection.
      if (foreignKeys) await client.batch(stmts, "write");
      else await client.migrate(stmts);
    },

    isConnectionError,

    async managedBackupStatus() {
      if (isLocal) return { label: "Provider backups", enabled: false, detail: "A local database file has no managed backups." };
      return {
        label: "Turso Cloud backups",
        enabled: true,
        detail: "Turso keeps point-in-time restore history for every database. Retention depends on your plan.",
      };
    },

    close() {
      client.close();
    },
  };
}
