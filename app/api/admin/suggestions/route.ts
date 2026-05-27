// app/api/admin/suggestions/route.ts
// Plain English: Returns the filtered suggestion queue — unclassified vendors that
// match AI keywords, meet the minimum lifetime spend threshold, appeared within the
// rolling window, and have not been allowlisted or dismissed.
import { pool } from "@/lib/db";
import { requireAdmin, adminErrorResponse } from "@/lib/admin-auth";
import {
  suggestionRegex,
  SUGGESTION_MIN_LIFETIME_CENTS,
  SUGGESTION_WINDOW_DAYS,
  SUGGESTION_LIMIT,
} from "@/lib/suggestions";

export async function GET() {
  try {
    await requireAdmin();
    const re = suggestionRegex();
    const { rows } = await pool.query(
      `WITH vendor_agg AS (
        SELECT
          vendor_normalized,
          SUM(amount_cents)::BIGINT  AS lifetime_total_cents,
          COUNT(*)::INT              AS txn_count,
          MAX(occurred_at)           AS last_seen,
          MIN(occurred_at)           AS first_seen
        FROM ramp_transactions
        WHERE occurred_at >= NOW() - ($1 || ' days')::interval
          AND vendor_normalized IS NOT NULL
        GROUP BY vendor_normalized
      )
      SELECT v.*
      FROM vendor_agg v
      LEFT JOIN classifications c
        ON c.scope = 'allowlist' AND c.key = v.vendor_normalized
      LEFT JOIN suggestion_dismissals d
        ON d.vendor_normalized = v.vendor_normalized
      WHERE c.key IS NULL
        AND d.vendor_normalized IS NULL
        AND v.lifetime_total_cents >= $2
        AND v.vendor_normalized ~* $3
      ORDER BY v.lifetime_total_cents DESC
      LIMIT $4`,
      [SUGGESTION_WINDOW_DAYS, SUGGESTION_MIN_LIFETIME_CENTS, re, SUGGESTION_LIMIT]
    );
    return Response.json({ ok: true, rows });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
