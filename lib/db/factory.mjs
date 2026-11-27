// Database factory: picks a driver from DB_PROVIDER and the provider's settings.
// Plain JavaScript so the CLI scripts (node scripts/*.mjs) and the app share one implementation.
//
// To support another database, add a driver in lib/db/drivers/ that returns the DbDriver contract
// (see factory.d.mts) and register it below. Nothing else in the app imports a driver package.

import { createLibsqlDriver } from "./drivers/libsql.mjs";

function required(value, name) {
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/** @type {Record<string, (options: import("./factory.mjs").DatabaseOptions) => import("./factory.mjs").DbDriver>} */
const PROVIDERS = {
  // Turso Cloud (libsql:// or https://). Also accepts a local file: URL, which is handy for throwaway test databases.
  turso: (options) =>
    createLibsqlDriver({
      provider: "turso",
      url: required(options.url ?? process.env.TURSO_DATABASE_URL, "TURSO_DATABASE_URL"),
      authToken: options.authToken ?? process.env.TURSO_AUTH_TOKEN,
    }),
};

export const DATABASE_PROVIDERS = Object.freeze(Object.keys(PROVIDERS));

export function createDatabase(options = {}) {
  const provider = String(options.provider ?? process.env.DB_PROVIDER ?? "turso").trim().toLowerCase();
  const make = PROVIDERS[provider];
  if (!make) throw new Error(`Unknown DB_PROVIDER "${provider}". Supported: ${DATABASE_PROVIDERS.join(", ")}`);
  return make(options);
}
