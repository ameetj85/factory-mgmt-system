export interface BackupObject {
  type: string;
  name: string;
  tbl_name: string;
  sql: string;
}

export interface Backup {
  format: "fms-backup";
  version: 1;
  createdAt: string;
  database: string | null;
  schema: BackupObject[];
  tables: Record<string, { columns: string[]; rows: unknown[][] }>;
  rowCount: number;
}

type Query = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

export function createBackup(query: Query, meta?: { database?: string }): Promise<Backup>;
export function encodeBackup(backup: Backup): Buffer;
export function decodeBackup(buffer: Buffer): Backup;
export interface RestoreTarget {
  query: Query;
  batch(statements: { sql: string; params?: unknown[] }[], options?: { foreignKeys?: boolean }): Promise<void>;
}

export function restoreBackup(database: RestoreTarget, backup: Backup, onProgress?: (message: string) => void): Promise<void>;
export function backupFileName(date?: Date): string;
export const BACKUP_NAME_PATTERN: RegExp;
