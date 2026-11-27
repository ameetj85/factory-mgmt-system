// The provider-neutral database contract. App code never imports a driver package directly: it goes
// through lib/db/client.ts (server) or createDatabase() (CLI scripts), and both only see these types.

export type SqlValue = string | number | bigint | boolean | null | undefined;
export type Row = Record<string, unknown>;

export interface RunResult {
  /** Row id of the last inserted row (0 when the statement inserted nothing). */
  lastID: number;
  /** Rows changed by the statement. */
  changes: number;
}

export interface Statement {
  sql: string;
  params?: SqlValue[];
}

/** Statement-level operations, available on the driver itself and inside a transaction. */
export interface DbOperations {
  /** Runs one statement and returns its rows as plain objects. */
  query<T = Row>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Runs one statement and reports what it changed. */
  run(sql: string, params?: SqlValue[]): Promise<RunResult>;
  /** Runs a script of several statements without parameters (migrations). */
  exec(script: string): Promise<void>;
}

export interface ManagedBackupStatus {
  /** Short label for the provider's own backup feature, e.g. "Turso Cloud backups". */
  label: string;
  enabled: boolean;
  detail: string;
}

export interface DbDriver extends DbOperations {
  /** Provider key as selected by DB_PROVIDER, e.g. "turso". */
  readonly provider: string;
  /** Human-readable name of where the data lives, e.g. "Turso Cloud". */
  readonly displayName: string;
  /** Name of the database, if the connection settings reveal it. */
  readonly databaseName: string | null;
  /**
   * Runs `fn` in a write transaction (SQLite: BEGIN IMMEDIATE) isolated from concurrent requests.
   * Commits when `fn` resolves and rolls back when it throws.
   */
  transaction<T>(fn: (tx: DbOperations) => Promise<T>): Promise<T>;
  /** Runs statements atomically in one round trip. `foreignKeys: false` suspends FK checks (bulk restore). */
  batch(statements: Statement[], options?: { foreignKeys?: boolean }): Promise<void>;
  /** True when the error means the network or server failed, not the SQL. Such reads are safe to retry. */
  isConnectionError(error: unknown): boolean;
  /** Status of the provider's own managed backups, shown on the Backups page. */
  managedBackupStatus(): Promise<ManagedBackupStatus>;
  close(): void;
}

export interface DatabaseOptions {
  /** Provider key. Defaults to DB_PROVIDER, then "turso". */
  provider?: string;
  /** Connection URL. Defaults to the provider's own environment variable. */
  url?: string;
  /** Auth token. Defaults to the provider's own environment variable. */
  authToken?: string;
}

/** Creates a driver for the configured provider. Each call opens a new client, so share the result. */
export function createDatabase(options?: DatabaseOptions): DbDriver;

/** Provider keys createDatabase() accepts. */
export const DATABASE_PROVIDERS: readonly string[];
