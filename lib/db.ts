// lib/db.ts
// Plain English: Typed query helpers for the dashboard, backed by a standard pg.Pool.
// Uses POSTGRES_URL from process.env — set in .env.local locally, Vercel env vars in production.
// Note: @vercel/postgres's sql tagged template requires Neon's HTTP driver which does not
// support local TCP Postgres. This module uses the standard pg driver directly so it
// works identically in local dev and on Vercel (which exposes a standard Postgres endpoint).

import { Pool } from "pg";

// SSL: enabled by default; opt out only via POSTGRES_SSL=false (used in local dev).
// On Vercel and any production Postgres (including Vercel Postgres), the CA is valid
// and rejectUnauthorized must be true to prevent MITM.
function buildSslConfig() {
  const explicit = process.env.POSTGRES_SSL;
  if (explicit === "false") return false;
  if (explicit === "true") return { rejectUnauthorized: true };
  // Default: SSL on in production, off in dev/test
  if (process.env.NODE_ENV === "production") return { rejectUnauthorized: true };
  return false;
}

export const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: buildSslConfig(),
  max: 2,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
});

export interface DailyRow {
  day: string;
  vendor_label: string;
  vendor_normalized: string;
  bucket: "license" | "api" | "exclude" | null;
  spend_type: "card" | "bill" | "reimbursement";
  amount_cents: number;
  txn_count: number;
}

export interface CursorUsageDay {
  day: string;          // YYYY-MM-DD (Pacific)
  charged_cents: number;
}

export async function dailySpend(opts: {
  startDate: string;
  endDate: string;
}): Promise<DailyRow[]> {
  const { rows } = await pool.query<DailyRow>(
    `SELECT day::text, vendor_label, vendor_normalized, bucket, spend_type, amount_cents::int, txn_count::int
     FROM ai_spend_daily
     WHERE day >= $1::date AND day <= $2::date
       AND (bucket IS NULL OR bucket <> 'exclude')
     ORDER BY day ASC, amount_cents DESC`,
    [opts.startDate, opts.endDate]
  );
  return rows;
}

export async function lastSuccessfulSyncAt(): Promise<Date | null> {
  const { rows } = await pool.query<{ ts: string | null }>(
    `SELECT MAX(last_run_at)::text AS ts FROM sync_state WHERE last_status = 'success'`
  );
  return rows[0]?.ts ? new Date(rows[0].ts) : null;
}

export interface TransactionDrillRow {
  id: string;
  occurred_at: string;
  amount_cents: number;
  card_name: string | null;
  user_email: string | null;
  memo: string | null;
}

export async function transactionsForVendor(opts: {
  vendor_normalized: string;
  startDate: string;
  endDate: string;
  bucket?: "license" | "api";
}): Promise<TransactionDrillRow[]> {
  // Ramp's /transactions API doesn't include email on card_holder — only
  // first_name + last_name. Reimbursements already write user_full_name into
  // the user_email column. For card rows, derive a display name from the
  // raw JSONB cardholder so the drill UI always shows a person.
  //
  // Also: respect any min_amount_cents threshold on either the allowlist
  // (vendor-wide) or the card mapping (card-specific). The Azure OpenAI card
  // uses a card-level $10k threshold so smaller Microsoft subscription / ads
  // charges on that same card don't show in the drill.
  const { rows } = await pool.query<TransactionDrillRow>(
    `SELECT
       t.id,
       t.occurred_at::text,
       t.amount_cents::int,
       t.card_name,
       COALESCE(
         NULLIF(TRIM(BOTH ' ' FROM
           COALESCE(t.raw->'card_holder'->>'first_name', '') || ' ' ||
           COALESCE(t.raw->'card_holder'->>'last_name', '')
         ), ''),
         t.user_email
       ) AS user_email,
       t.memo
     FROM ramp_transactions t
     LEFT JOIN classifications a
       ON a.scope = 'allowlist' AND a.key = t.vendor_normalized
     LEFT JOIN classifications c
       ON c.scope = 'card' AND c.key = t.card_id
     LEFT JOIN classifications co
       ON co.scope = 'vendor_override' AND co.key = t.vendor_normalized
     WHERE t.vendor_normalized = $1
       AND t.occurred_at >= $2::date
       AND t.occurred_at < ($3::date + INTERVAL '1 day')
       AND (a.min_amount_cents IS NULL OR t.amount_cents >= a.min_amount_cents)
       AND (c.min_amount_cents IS NULL OR t.amount_cents >= c.min_amount_cents)
       AND ($4::text IS NULL OR COALESCE(co.bucket, c.bucket) = $4)
     ORDER BY t.occurred_at DESC
     LIMIT 500`,
    [opts.vendor_normalized, opts.startDate, opts.endDate, opts.bucket ?? null]
  );
  return rows;
}

export async function allowlistCount(): Promise<number> {
  const { rows } = await pool.query<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM classifications WHERE scope = 'allowlist'`
  );
  return rows[0]?.c ?? 0;
}

export async function allowlistLabels(): Promise<string[]> {
  const { rows } = await pool.query<{ label: string }>(
    `SELECT COALESCE(label, key) AS label
     FROM classifications
     WHERE scope = 'allowlist'
     ORDER BY label ASC`
  );
  return rows.map((r) => r.label);
}

export interface UnclassifiedTotal {
  cents: number;
  txns: number;
}

export async function unclassifiedTotalFor(opts: {
  startDate: string;
  endDate: string;
}): Promise<UnclassifiedTotal> {
  // Note: pg returns SUM/COUNT as strings for BIGINT — coerce defensively.
  const { rows } = await pool.query<{ cents: string | number; txns: string | number }>(
    `SELECT COALESCE(SUM(amount_cents), 0) AS cents, COUNT(*) AS txns
     FROM ai_spend_daily
     WHERE bucket IS NULL AND day >= $1::date AND day <= $2::date`,
    [opts.startDate, opts.endDate]
  );
  const r = rows[0];
  return {
    cents: r ? Number(r.cents) : 0,
    txns: r ? Number(r.txns) : 0,
  };
}

export async function cursorUsageDaily(opts: {
  startDate: string;
  endDate: string;
}): Promise<CursorUsageDay[]> {
  const { rows } = await pool.query<{ day: string; charged_cents: number }>(
    `SELECT day::text, charged_cents::int
     FROM cursor_usage_daily
     WHERE day >= $1::date AND day <= $2::date
     ORDER BY day ASC`,
    [opts.startDate, opts.endDate]
  );
  return rows;
}

export async function cursorUsageLastSyncAt(): Promise<Date | null> {
  const { rows } = await pool.query<{ ts: string | null }>(
    `SELECT MAX(synced_at)::text AS ts FROM cursor_usage_daily`
  );
  return rows[0]?.ts ? new Date(rows[0].ts) : null;
}
