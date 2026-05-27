// lib/sync.ts
// Plain English: The sync engine. For each Ramp spend type (card, bill,
// reimbursement), pulls new transactions since the last cursor, normalizes
// vendor names, and upserts to ramp_transactions. Each spend type runs
// independently — if bills fails, cards still succeeds.
//
// Classifications are managed exclusively via the /admin panel (DB is canonical).

import { pool } from "@/lib/db";
import {
  RampClient,
  type RampTransaction,
  type RampBill,
  type RampReimbursement,
} from "@/lib/ramp";
import { normalizeVendor } from "@/lib/normalize";
import { alertSyncFailure } from "@/lib/slack";
import { CursorClient } from "@/lib/cursor";

type SpendType = "card" | "bill" | "reimbursement";

export interface SyncResult {
  spend_type: SpendType;
  status: "success" | "error";
  rows_upserted: number;
  error?: string;
}

// Per-run cache for card metadata lookups during sync.
// Key: card_id. Value: resolved details, or null if Ramp returned no last_four / errored.
// Caching null prevents repeated /cards/{id} calls within the same sync run.
type CardDetailCache = Map<string, { card_name: string; card_display_name: string | null } | null>;

export async function runSync(opts?: {
  sinceOverride?: string;
  types?: SpendType[];
}): Promise<SyncResult[]> {
  const client = new RampClient({
    clientId: process.env.RAMP_CLIENT_ID!,
    clientSecret: process.env.RAMP_CLIENT_SECRET!,
  });

  const types: SpendType[] = opts?.types ?? ["card", "bill", "reimbursement"];
  const results: SyncResult[] = [];
  const cardCache: CardDetailCache = new Map();

  for (const type of types) {
    try {
      const since = opts?.sinceOverride ?? (await getLastCursor(type));
      const rows = await syncOne(client, type, since, cardCache);
      await setSyncState(type, new Date().toISOString(), "success", null);
      results.push({ spend_type: type, status: "success", rows_upserted: rows });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await setSyncState(type, new Date().toISOString(), "error", msg);
      await alertSyncFailure(`${type} sync: ${msg}`);
      results.push({ spend_type: type, status: "error", rows_upserted: 0, error: msg });
    }
  }
  return results;
}

// Resolve a card_id to {card_name: "•••• 1234", card_display_name}. Uses the
// per-run cache so each card_id triggers at most one /cards/{id} call per sync.
// On any error (HTTP failure, missing last_four), caches null and returns null —
// the row still gets inserted with card_name unresolved, and the daily
// backfillNewCardDetails safety net will pick it up.
async function resolveCardDetails(
  client: RampClient,
  cardId: string,
  cache: CardDetailCache
): Promise<{ card_name: string; card_display_name: string | null } | null> {
  if (cache.has(cardId)) return cache.get(cardId) ?? null;
  try {
    const token = await client.getAccessToken();
    const res = await fetch(`https://api.ramp.com/developer/v1/cards/${cardId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.warn(`[sync card ${cardId}] HTTP ${res.status}`);
      cache.set(cardId, null);
      return null;
    }
    const c = (await res.json()) as { last_four?: string; display_name?: string };
    if (!c.last_four) {
      cache.set(cardId, null);
      return null;
    }
    const resolved = {
      card_name: `•••• ${c.last_four}`,
      card_display_name: c.display_name ?? null,
    };
    cache.set(cardId, resolved);
    return resolved;
  } catch (err) {
    console.warn(`[sync card ${cardId}] failed:`, err instanceof Error ? err.message : err);
    cache.set(cardId, null);
    return null;
  }
}

async function getLastCursor(type: SpendType): Promise<string | null> {
  const { rows } = await pool.query<{ last_cursor: string | null }>(
    `SELECT last_cursor FROM sync_state WHERE spend_type = $1`,
    [type]
  );
  return rows[0]?.last_cursor ?? null;
}

async function setSyncState(
  type: SpendType,
  runAt: string,
  status: string,
  error: string | null
): Promise<void> {
  await pool.query(
    `INSERT INTO sync_state (spend_type, last_cursor, last_run_at, last_status, last_error)
     VALUES ($1, $2::text, $3::timestamptz, $4, $5)
     ON CONFLICT (spend_type) DO UPDATE SET
       last_cursor = EXCLUDED.last_cursor,
       last_run_at = EXCLUDED.last_run_at,
       last_status = EXCLUDED.last_status,
       last_error = EXCLUDED.last_error`,
    [type, runAt, runAt, status, error]
  );
}

async function syncOne(
  client: RampClient,
  type: SpendType,
  since: string | null,
  cardCache: CardDetailCache
): Promise<number> {
  // Default to trailing 24 months when no cursor (first run / backfill)
  const fromDate =
    since ??
    (() => {
      const d = new Date();
      d.setMonth(d.getMonth() - 24);
      return d.toISOString();
    })();

  let count = 0;
  if (type === "card") {
    for await (const tx of client.listTransactions(fromDate)) {
      await upsertCard(tx, client, cardCache);
      count++;
    }
  } else if (type === "bill") {
    for await (const b of client.listBills(fromDate)) {
      await upsertBill(b);
      count++;
    }
  } else {
    for await (const r of client.listReimbursements(fromDate)) {
      await upsertReimbursement(r);
      count++;
    }
  }
  return count;
}

async function upsertCard(
  tx: RampTransaction,
  client: RampClient,
  cardCache: CardDetailCache
): Promise<void> {
  const vendor_normalized = normalizeVendor(tx.merchant_name);
  const cents = Math.round(tx.amount * 100);
  // Resolve card_name / card_display_name inline so new transactions arrive
  // with masked digits already populated. Falls back to null if Ramp /cards/{id}
  // errors or omits last_four — backfillNewCardDetails covers that case.
  const card = tx.card_id ? await resolveCardDetails(client, tx.card_id, cardCache) : null;
  await pool.query(
    `INSERT INTO ramp_transactions
       (id, spend_type, occurred_at, amount_cents, currency, vendor_raw, vendor_normalized, card_id, card_name, card_display_name, user_email, memo, raw)
     VALUES ($1, 'card', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       amount_cents      = EXCLUDED.amount_cents,
       card_name         = COALESCE(EXCLUDED.card_name, ramp_transactions.card_name),
       card_display_name = COALESCE(EXCLUDED.card_display_name, ramp_transactions.card_display_name),
       memo              = EXCLUDED.memo,
       raw               = EXCLUDED.raw,
       synced_at         = now()`,
    [
      tx.id,
      tx.user_transaction_time,
      cents,
      tx.currency_code,
      tx.merchant_name,
      vendor_normalized,
      tx.card_id ?? null,
      card?.card_name ?? null,
      card?.card_display_name ?? null,
      tx.card_holder?.email ?? null,
      tx.memo ?? null,
      JSON.stringify(tx),
    ]
  );
}

async function upsertBill(b: RampBill): Promise<void> {
  const vendor_normalized = normalizeVendor(b.vendor.name);
  const cents = Math.round(b.amount.amount * 100);
  const occurred = b.payment_date ?? b.invoice_date ?? new Date().toISOString();
  await pool.query(
    `INSERT INTO ramp_transactions
       (id, spend_type, occurred_at, amount_cents, currency, vendor_raw, vendor_normalized, memo, raw)
     VALUES ($1, 'bill', $2, $3, $4, $5, $6, $7, $8::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       amount_cents = EXCLUDED.amount_cents,
       raw          = EXCLUDED.raw,
       synced_at    = now()`,
    [
      b.id,
      occurred,
      cents,
      b.amount.currency_code,
      b.vendor.name,
      vendor_normalized,
      b.memo ?? null,
      JSON.stringify(b),
    ]
  );
}

async function upsertReimbursement(r: RampReimbursement): Promise<void> {
  // Ramp reimbursements don't have a top-level amount/merchant — money is on line_items[].
  // For v1: sum USD line items, use combined memos for vendor matching. Non-USD reimbursements
  // and reimbursements with no parseable amount are skipped (logged for later review).
  const raw = r as unknown as {
    line_items?: Array<{
      amount?: { amount?: number; currency_code?: string; minor_unit_conversion_rate?: number };
      memo?: string | null;
    }>;
    user_full_name?: string;
    transaction_date?: string;
    memo?: string | null;
  };

  const usdLines = (raw.line_items ?? []).filter(
    (li) => li.amount?.currency_code === "USD" && typeof li.amount.amount === "number"
  );
  if (usdLines.length === 0) {
    console.warn(`[sync] skip reimbursement ${r.id}: no USD line items`);
    return;
  }
  const cents = usdLines.reduce((sum, li) => sum + (li.amount?.amount ?? 0), 0);
  if (!Number.isFinite(cents) || cents <= 0) {
    console.warn(`[sync] skip reimbursement ${r.id}: non-positive amount (${cents})`);
    return;
  }

  // Build a synthetic vendor name from line item memos for AI keyword matching
  const combinedMemo = [raw.memo, ...usdLines.map((li) => li.memo).filter(Boolean)]
    .filter(Boolean)
    .join(" | ");
  const vendor_raw = combinedMemo || "Reimbursement";
  const vendor_normalized = normalizeVendor(vendor_raw);

  await pool.query(
    `INSERT INTO ramp_transactions
       (id, spend_type, occurred_at, amount_cents, currency, vendor_raw, vendor_normalized, user_email, memo, raw)
     VALUES ($1, 'reimbursement', $2, $3, 'USD', $4, $5, $6, $7, $8::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       amount_cents = EXCLUDED.amount_cents,
       raw          = EXCLUDED.raw,
       synced_at    = now()`,
    [
      r.id,
      raw.transaction_date ?? new Date().toISOString(),
      cents,
      vendor_raw,
      vendor_normalized,
      raw.user_full_name ?? null,
      combinedMemo || null,
      JSON.stringify(r),
    ]
  );
}

// Daily delta: for any card_ids we've seen in ramp_transactions but never
// resolved to a last_four (card_name IS NULL/empty), fetch /cards/{id} once
// and write `•••• {last_four}` into card_name. Idempotent — never re-fetches
// a card that already has a name. Capped at 100 cards/run to fit inside the
// 60s cron maxDuration. Full re-sync remains in scripts/sync-card-details.ts.
export async function backfillNewCardDetails(opts?: {
  client?: RampClient;
  limit?: number;
}): Promise<{ updated: number; skipped: number }> {
  const limit = opts?.limit ?? 100;
  const client =
    opts?.client ??
    new RampClient({
      clientId: process.env.RAMP_CLIENT_ID!,
      clientSecret: process.env.RAMP_CLIENT_SECRET!,
    });

  const { rows: cardIds } = await pool.query<{ card_id: string }>(
    `SELECT DISTINCT card_id
     FROM ramp_transactions
     WHERE card_id IS NOT NULL
       AND (
         (card_name IS NULL OR card_name = '')
         OR card_display_name IS NULL
       )
     ORDER BY card_id
     LIMIT $1`,
    [limit]
  );
  if (cardIds.length === 0) return { updated: 0, skipped: 0 };

  let updated = 0;
  let skipped = 0;
  for (const { card_id } of cardIds) {
    try {
      const token = await client.getAccessToken();
      const res = await fetch(`https://api.ramp.com/developer/v1/cards/${card_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        console.warn(`[sync card ${card_id}] HTTP ${res.status}`);
        skipped++;
        continue;
      }
      const c = (await res.json()) as { last_four?: string; display_name?: string };
      if (!c.last_four) {
        skipped++;
        continue;
      }
      await pool.query(
        `UPDATE ramp_transactions SET card_name = $1, card_display_name = $2 WHERE card_id = $3`,
        [`•••• ${c.last_four}`, c.display_name ?? null, card_id]
      );
      updated++;
    } catch (err) {
      console.warn(`[sync card ${card_id}] failed:`, err instanceof Error ? err.message : err);
      skipped++;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return { updated, skipped };
}

// Pull Cursor billed usage for a window and upsert into cursor_usage_daily by
// Pacific day. Default window: trailing 7 days (idempotent re-write — safe to
// run daily). For backfill, pass explicit startMs/endMs. No-ops (returns zeros)
// if CURSOR_ADMIN_KEY is unset, so the dashboard degrades to all-license Cursor.
export async function syncCursorUsage(opts?: {
  client?: CursorClient;
  days?: number;
  startMs?: number;
  endMs?: number;
}): Promise<{ days_upserted: number; charged_cents: number }> {
  const apiKey = process.env.CURSOR_ADMIN_KEY;
  if (!apiKey && !opts?.client) {
    console.warn("[sync cursor] CURSOR_ADMIN_KEY not set; skipping Cursor usage sync");
    return { days_upserted: 0, charged_cents: 0 };
  }
  const client = opts?.client ?? new CursorClient({ apiKey: apiKey! });
  const now = Date.now();
  const startMs = opts?.startMs ?? now - (opts?.days ?? 7) * 86_400_000;
  const endMs = opts?.endMs ?? now;

  const { byDay, chargedCents } = await client.usageForRange(startMs, endMs);
  for (const [day, { cents, count }] of byDay) {
    await pool.query(
      `INSERT INTO cursor_usage_daily (day, charged_cents, event_count, synced_at)
       VALUES ($1::date, $2, $3, now())
       ON CONFLICT (day) DO UPDATE SET
         charged_cents = EXCLUDED.charged_cents,
         event_count   = EXCLUDED.event_count,
         synced_at     = now()`,
      [day, cents, count]
    );
  }
  return { days_upserted: byDay.size, charged_cents: chargedCents };
}

