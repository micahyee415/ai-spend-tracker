-- db/migrations/002_admin_audit_log.sql
-- v2: admin panel — audit log for classifications writes, plus suggestion dismissals.
-- Additive only; existing tables and view are unchanged.

CREATE TABLE IF NOT EXISTS audit_log (
  id           BIGSERIAL PRIMARY KEY,
  ts           TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_email  TEXT NOT NULL,
  action       TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  scope        TEXT NOT NULL CHECK (scope IN ('allowlist', 'card', 'vendor_override')),
  key          TEXT NOT NULL,
  before       JSONB,
  after        JSONB
);
CREATE INDEX IF NOT EXISTS audit_log_ts_idx ON audit_log (ts DESC);
CREATE INDEX IF NOT EXISTS audit_log_scope_key_idx ON audit_log (scope, key);

CREATE TABLE IF NOT EXISTS suggestion_dismissals (
  vendor_normalized TEXT PRIMARY KEY,
  dismissed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_email       TEXT NOT NULL
);
