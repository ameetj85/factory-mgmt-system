-- Users, sessions, password resets and the audit trail.
-- All timestamps are UTC ISO-8601 strings: YYYY-MM-DDTHH:MM:SSZ

CREATE TABLE users (
  id                  INTEGER PRIMARY KEY,
  username            TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email               TEXT NOT NULL UNIQUE COLLATE NOCASE,
  full_name           TEXT NOT NULL,
  password_hash       TEXT NOT NULL,
  role                TEXT NOT NULL CHECK (role IN ('admin', 'production_manager', 'operator', 'warehouse_clerk')),
  is_active           INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  failed_login_count  INTEGER NOT NULL DEFAULT 0,
  locked_until        TEXT,
  password_changed_at TEXT,
  last_login_at       TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Session ids are SHA-256 hashes of the cookie token, so a leaked table cannot be replayed.
CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  expires_at   TEXT NOT NULL,
  ip_address   TEXT,
  user_agent   TEXT
);
CREATE INDEX idx_sessions_user ON sessions (user_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);

CREATE TABLE password_reset_tokens (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  expires_at   TEXT NOT NULL,
  used_at      TEXT,
  requested_ip TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_password_reset_user ON password_reset_tokens (user_id);

-- Append-only record of who changed what. Users are deactivated, never deleted,
-- so the user_id reference stays valid.
CREATE TABLE audit_logs (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id),
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  details     TEXT,
  ip_address  TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_audit_created ON audit_logs (created_at);
CREATE INDEX idx_audit_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_user ON audit_logs (user_id, created_at);

CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is append-only');
END;

CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is append-only');
END;
