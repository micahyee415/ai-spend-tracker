// app/admin/suggestions/page.tsx
// Plain English: Server Component — queries the suggestion queue (vendors matching AI keywords,
// not yet on the allowlist, above $50 lifetime spend in the last 180 days) and passes rows
// to the client-side SuggestionsTable for display + interaction.

import { pool } from "@/lib/db";
import {
  suggestionRegex,
  SUGGESTION_MIN_LIFETIME_CENTS,
  SUGGESTION_WINDOW_DAYS,
  SUGGESTION_LIMIT,
} from "@/lib/suggestions";
import { SuggestionsTable } from "@/components/admin/SuggestionsTable";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

interface QueueRow {
  vendor_normalized: string;
  lifetime_total_cents: string;
  txn_count: number;
  last_seen: string;
}

async function loadQueue(): Promise<QueueRow[]> {
  await requireAdmin();
  const re = suggestionRegex();
  const { rows } = await pool.query<QueueRow>(
    `WITH vendor_agg AS (
      SELECT vendor_normalized,
             SUM(amount_cents)::BIGINT AS lifetime_total_cents,
             COUNT(*)::INT             AS txn_count,
             MAX(occurred_at)          AS last_seen
      FROM ramp_transactions
      WHERE occurred_at >= NOW() - ($1 || ' days')::interval
        AND vendor_normalized IS NOT NULL
      GROUP BY vendor_normalized
    )
    SELECT v.* FROM vendor_agg v
    LEFT JOIN classifications c ON c.scope = 'allowlist' AND c.key = v.vendor_normalized
    LEFT JOIN suggestion_dismissals d ON d.vendor_normalized = v.vendor_normalized
    WHERE c.key IS NULL AND d.vendor_normalized IS NULL
      AND v.lifetime_total_cents >= $2
      AND v.vendor_normalized ~* $3
    ORDER BY v.lifetime_total_cents DESC
    LIMIT $4`,
    [SUGGESTION_WINDOW_DAYS, SUGGESTION_MIN_LIFETIME_CENTS, re, SUGGESTION_LIMIT]
  );
  return rows;
}

export default async function SuggestionsPage() {
  const rows = await loadQueue();
  return (
    <>
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
        Suggestions
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Vendors matching AI keywords, last 180 days, ≥ $50 lifetime. Not yet on the
        allowlist.
      </p>
      <SuggestionsTable initialRows={rows} />
    </>
  );
}
