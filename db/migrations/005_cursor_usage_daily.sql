-- db/migrations/005_cursor_usage_daily.sql
-- Authoritative Cursor billed usage ($) per Pacific-time day, pulled from the
-- Cursor Admin API (filtered-usage-events). Kept separate from ramp_transactions
-- because it is a different source (Cursor, not Ramp) and an accrual series, not
-- discrete card transactions. charged_cents = sum of event chargedCents (billable
-- overage that ties to the invoice — NOT overallSpendCents).
CREATE TABLE IF NOT EXISTS cursor_usage_daily (
  day            DATE PRIMARY KEY,
  charged_cents  BIGINT NOT NULL DEFAULT 0,
  event_count    INTEGER NOT NULL DEFAULT 0,
  synced_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
