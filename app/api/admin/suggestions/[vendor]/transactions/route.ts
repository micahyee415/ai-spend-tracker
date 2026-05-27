// app/api/admin/suggestions/[vendor]/transactions/route.ts
// Plain English: Returns the last 10 transactions for a given vendor_normalized,
// joining to classifications (scope='card') to resolve card label and last-four digits.
// Used by the suggestion drawer to show recent spend context before promoting/dismissing.

import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { requireAdmin, adminErrorResponse } from "@/lib/admin-auth";

type Params = { vendor: string };

// card_last_four: strip all non-digit chars from card_name (format: "•••• 1234")
// card_label: classification label → raw card_name → fallback "(unmapped)"
export interface DrawerRow {
  id: string;                // ramp_transactions.id — used as React key in drawer
  occurred_at: string;       // ISO from JSON serialization
  amount_cents: string;      // BIGINT comes as string
  memo: string | null;
  card_id: string | null;
  card_label: string;
  card_last_four: string;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<Params> }) {
  try {
    await requireAdmin();
    const { vendor } = await ctx.params;
    // Next.js 16 already URL-decodes dynamic params before they reach the handler
    const key = vendor;
    const { rows } = await pool.query(
      `SELECT
        rt.id,
        rt.occurred_at,
        rt.amount_cents,
        rt.memo,
        rt.card_id,
        COALESCE(c.label, rt.card_name, '(unmapped)')                                    AS card_label,
        COALESCE(NULLIF(REGEXP_REPLACE(rt.card_name, '[^0-9]', '', 'g'), ''), '????')   AS card_last_four
      FROM ramp_transactions rt
      LEFT JOIN classifications c
        ON c.scope = 'card' AND c.key = rt.card_id
      WHERE rt.vendor_normalized = $1
      ORDER BY rt.occurred_at DESC
      LIMIT 10`,
      [key]
    );
    return Response.json({ ok: true, rows });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
