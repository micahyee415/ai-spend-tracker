-- db/migrations/001_initial_schema.sql
CREATE TABLE IF NOT EXISTS ramp_transactions (
  id              TEXT PRIMARY KEY,
  spend_type      TEXT NOT NULL CHECK (spend_type IN ('card', 'bill', 'reimbursement')),
  occurred_at     TIMESTAMPTZ NOT NULL,
  amount_cents    BIGINT NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'USD',
  vendor_raw      TEXT,
  vendor_normalized TEXT,
  card_id         TEXT,
  card_name       TEXT,
  user_email      TEXT,
  memo            TEXT,
  raw             JSONB NOT NULL,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ramp_transactions_occurred_at_idx ON ramp_transactions (occurred_at DESC);
CREATE INDEX IF NOT EXISTS ramp_transactions_vendor_idx ON ramp_transactions (vendor_normalized);
CREATE INDEX IF NOT EXISTS ramp_transactions_card_idx ON ramp_transactions (card_id);

CREATE TABLE IF NOT EXISTS classifications (
  scope             TEXT NOT NULL CHECK (scope IN ('allowlist', 'card', 'vendor_override')),
  key               TEXT NOT NULL,
  bucket            TEXT CHECK (bucket IN ('license', 'api') OR bucket IS NULL),
  label             TEXT,
  min_amount_cents  BIGINT,
  notes             TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, key)
);

CREATE TABLE IF NOT EXISTS sync_state (
  spend_type      TEXT PRIMARY KEY CHECK (spend_type IN ('card', 'bill', 'reimbursement')),
  last_cursor     TEXT,
  last_run_at     TIMESTAMPTZ,
  last_status     TEXT CHECK (last_status IN ('success', 'partial', 'error')),
  last_error      TEXT
);

CREATE OR REPLACE VIEW ai_spend_daily AS
SELECT
  (date_trunc('day', t.occurred_at AT TIME ZONE 'America/Los_Angeles'))::date AS day,
  COALESCE(co.label, c.label, a.label, t.vendor_normalized) AS vendor_label,
  t.vendor_normalized,
  COALESCE(co.bucket, c.bucket) AS bucket,
  t.spend_type,
  SUM(t.amount_cents) AS amount_cents,
  COUNT(*) AS txn_count
FROM ramp_transactions t
JOIN classifications a
  ON a.scope = 'allowlist'
  AND a.key = t.vendor_normalized
  AND (a.min_amount_cents IS NULL OR t.amount_cents >= a.min_amount_cents)
LEFT JOIN classifications c
  ON c.scope = 'card' AND c.key = t.card_id
LEFT JOIN classifications co
  ON co.scope = 'vendor_override' AND co.key = t.vendor_normalized
-- Card-level threshold: if a card has a min_amount_cents rule, the txn must
-- meet it OR be excluded entirely (not moved to Needs Classification).
WHERE c.min_amount_cents IS NULL OR t.amount_cents >= c.min_amount_cents
GROUP BY 1, 2, 3, 4, 5;
