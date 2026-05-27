import { pool } from "@/lib/db";
import { requireAdmin, adminErrorResponse } from "@/lib/admin-auth";
import { suggestionRegex, SUGGESTION_MIN_LIFETIME_CENTS, SUGGESTION_WINDOW_DAYS } from "@/lib/suggestions";

export async function GET() {
  try {
    await requireAdmin();
    const re = suggestionRegex();
    const { rows } = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM (
        SELECT v.vendor_normalized
        FROM (
          SELECT vendor_normalized, SUM(amount_cents) AS s
          FROM ramp_transactions
          WHERE occurred_at >= NOW() - ($1 || ' days')::interval
            AND vendor_normalized IS NOT NULL
          GROUP BY vendor_normalized
        ) v
        LEFT JOIN classifications c ON c.scope = 'allowlist' AND c.key = v.vendor_normalized
        LEFT JOIN suggestion_dismissals d ON d.vendor_normalized = v.vendor_normalized
        WHERE c.key IS NULL AND d.vendor_normalized IS NULL
          AND v.s >= $2
          AND v.vendor_normalized ~* $3
      ) x`,
      [SUGGESTION_WINDOW_DAYS, SUGGESTION_MIN_LIFETIME_CENTS, re]
    );
    return Response.json({ ok: true, count: rows[0]?.count ?? 0 });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
