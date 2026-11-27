# Factory Management System

A full-stack factory management system (MES/ERP lite) for inventory, production, equipment maintenance and quality control. Built with Next.js (App Router, Server Functions), Tailwind CSS, shadcn/ui and a SQLite-compatible database hosted on [Turso Cloud](https://turso.tech) (libSQL). The database driver sits behind a small factory (`lib/db/factory.mjs`), so the provider can be swapped without touching app code.

Functional requirements live in [FUNCTIONAL-REQ.md](FUNCTIONAL-REQ.md).

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in the values:

   | Variable | Purpose |
   | --- | --- |
   | `TURSO_DATABASE_URL` | Turso database URL, e.g. `libsql://factory-<org>.<region>.turso.io` (or `file:./local.db` for a local file) |
   | `TURSO_AUTH_TOKEN` | Turso database auth token (`turso db tokens create <database>`) |
   | `DB_PROVIDER` | Optional. Database provider key, defaults to `turso` |
   | `APP_URL` | Public base URL, used in password reset links. Required in production. |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | SMTP server for password reset emails |
   | `EMAIL_FROM` | Sender address for outgoing email |

3. Apply database migrations:

   ```bash
   npm run db:migrate
   ```

4. Start the dev server and open http://localhost:3000:

   ```bash
   npm run dev
   ```

   On a fresh database the sign-in page links to **initial setup**, which creates the first administrator. That page closes itself once any user exists.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm run start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |
| `npm run db:migrate` | Apply pending SQL migrations from `db/migrations` |
| `npm run db:backup` | Write a database backup to `BACKUP_DIR` (default `./backups`) |
| `npm run db:restore -- <file>` | Restore a backup into an empty database (`RESTORE_DATABASE_URL`, `RESTORE_AUTH_TOKEN`) |

## Authentication and roles

- Username + password sign-in. Passwords are hashed with scrypt; sessions are opaque random tokens stored (hashed) in the `sessions` table and sent as an `HttpOnly` cookie.
- Five failed sign-ins lock an account for 15 minutes.
- Password reset by email: single-use links that expire after one hour. Resetting signs the user out everywhere.
- Administrators create accounts, either setting a password or emailing the user a link to set their own.
- Roles: **Admin**, **Production Manager**, **Shop Floor Operator**, **Warehouse Clerk**. Permissions per role are defined in `lib/auth/permissions.ts`.
- Sign-ins, password changes and changes to users are written to an append-only audit log.

## Backups

- Backups are gzip-compressed JSON snapshots of the schema and every row, written by `npm run db:backup`, the **Back up now** button under Administration → Backups, or automatically every `BACKUP_INTERVAL_HOURS` while the server runs (keeping the newest `BACKUP_KEEP`, default 14).
- Restores only run into a new, empty database, so a backup can never overwrite live data.
- The `backups/` folder holds business data and is git-ignored. Copy backups off the server. Turso Cloud also keeps its own point-in-time restore history for the database.

## Database notes

- Migrations are plain SQL files in `db/migrations`, applied in filename order and tracked in `schema_migrations`.
- All timestamps are stored as UTC ISO-8601 strings (`YYYY-MM-DDTHH:MM:SSZ`).
- Multi-step writes run in `BEGIN IMMEDIATE` interactive transactions (`transaction()` in `lib/db/client.ts`), so concurrent requests never interleave inside a transaction.

## Database provider

The app never imports a database driver directly. Layers, from the outside in:

| Layer | File | Role |
| --- | --- | --- |
| App API | `lib/db/client.ts` | `db`, `backgroundDb`, `transaction()` for Server Components and Actions. Provider-neutral. |
| Contract | `lib/db/factory.d.mts` | The `DbDriver` interface every provider implements (`query`, `run`, `exec`, `transaction`, `batch`, …). |
| Factory | `lib/db/factory.mjs` | `createDatabase()` picks the driver from `DB_PROVIDER` (default `turso`). Also used by the CLI scripts. |
| Driver | `lib/db/drivers/libsql.mjs` | Turso Cloud / libSQL. The only file that imports `@libsql/client`. |

To move to another database, add a driver in `lib/db/drivers/` that returns a `DbDriver`, register it in `PROVIDERS` in `lib/db/factory.mjs` and set `DB_PROVIDER`. Another SQLite-compatible service needs nothing else. A database with a different SQL dialect (PostgreSQL, MySQL) would also need the SQLite-specific SQL ported: `strftime`/`SQL_NOW`, partial indexes, the triggers in the migrations, and `sqlite_master` in the backup code.
