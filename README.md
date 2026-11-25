# Factory Management System

A full-stack factory management system (MES/ERP lite) for inventory, production, equipment maintenance and quality control. Built with Next.js (App Router, Server Functions), Tailwind CSS, shadcn/ui and a SQLite database hosted on [SQLite Cloud](https://sqlitecloud.io).

Functional requirements live in [FUNCTIONAL-REQ.md](FUNCTIONAL-REQ.md).

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in the values:

   | Variable | Purpose |
   | --- | --- |
   | `SQLITE_CONNECTION_STRING` | SQLite Cloud connection string, pointing at the app's own database (e.g. `/factory.sqlite`) |
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
| `npm run db:restore -- <file>` | Restore a backup into an empty database (`RESTORE_CONNECTION_STRING`) |

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
- The `backups/` folder holds business data and is git-ignored. Copy backups off the server, or also enable SQLite Cloud's managed backups for the database.

## Database notes

- Migrations are plain SQL files in `db/migrations`, applied in filename order and tracked in `schema_migrations`.
- All timestamps are stored as UTC ISO-8601 strings (`YYYY-MM-DDTHH:MM:SSZ`).
- Multi-step writes run in `BEGIN IMMEDIATE` transactions on a dedicated connection (`transaction()` in `lib/db/client.ts`), so concurrent requests never interleave inside a transaction.
