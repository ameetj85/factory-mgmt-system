import type { DbDriver } from "../factory.mjs";

export function databaseNameFromUrl(url: string): string | null;
export function createLibsqlDriver(config: { provider: string; url: string; authToken?: string }): DbDriver;
