// scripts/sync-card-details.ts
// One-time backfill: for every distinct card_id in ramp_transactions, fetch
// /developer/v1/cards/{id} and write `•••• {last_four}` into ramp_transactions.card_name
// (and `{last_four}` into card_id of the raw payload is unchanged — we only touch the
// dedicated card_name column).
//
// Run: POSTGRES_URL=<target> npx tsx --env-file=.env.local scripts/sync-card-details.ts
//
// Idempotent: re-runs overwrite card_name with the freshly-fetched last_four.

import { pool } from "@/lib/db";
import { RampClient } from "@/lib/ramp";

interface CardDetails {
  id: string;
  last_four?: string;
  display_name?: string;
  state?: string;
}

async function fetchCard(client: RampClient, cardId: string): Promise<CardDetails | null> {
  const token = await client.getAccessToken();
  const res = await fetch(`https://api.ramp.com/developer/v1/cards/${cardId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.warn(`[card ${cardId}] HTTP ${res.status}`);
    return null;
  }
  return (await res.json()) as CardDetails;
}

async function main() {
  const clientId = process.env.RAMP_CLIENT_ID;
  const clientSecret = process.env.RAMP_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("RAMP_CLIENT_ID / RAMP_CLIENT_SECRET must be set");

  const client = new RampClient({ clientId, clientSecret });

  // Distinct card_ids — only card-spend rows have one
  const { rows: cardIds } = await pool.query<{ card_id: string }>(
    `SELECT DISTINCT card_id FROM ramp_transactions WHERE card_id IS NOT NULL ORDER BY card_id`
  );
  console.log(`Found ${cardIds.length} unique card_ids. Fetching details…`);

  let updated = 0;
  let skipped = 0;
  for (const { card_id } of cardIds) {
    const c = await fetchCard(client, card_id);
    if (!c?.last_four) {
      console.warn(`  ${card_id}: no last_four — skipped`);
      skipped++;
      continue;
    }
    const cardName = `•••• ${c.last_four}`;
    await pool.query(
      `UPDATE ramp_transactions SET card_name = $1, card_display_name = $2 WHERE card_id = $3`,
      [cardName, c.display_name ?? null, card_id]
    );
    console.log(`  ${card_id.slice(0, 8)}…  ${cardName}  ${c.display_name ?? ""}`);
    updated++;
    // Throttle politely
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`\nDone. Updated ${updated} cards (${skipped} skipped).`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
