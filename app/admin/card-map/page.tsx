// app/admin/card-map/page.tsx
// Plain English: Server Component — loads all classified cards (scope=card) UNION
// any card_ids seen in ramp_transactions that have no classification row yet.
// Unmapped cards sort to the top so they get attention first.

import { pool } from "@/lib/db";
import { CardMapTable, type CardRow } from "@/components/admin/CardMapTable";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

async function loadCards(): Promise<CardRow[]> {
  await requireAdmin();
  // Union of: (1) classifications scope=card rows joined with optional txn count,
  // and (2) card_ids seen in ramp_transactions but NOT in classifications.
  // Unmapped cards float to the top.
  const { rows } = await pool.query<CardRow>(
    `WITH txn_counts AS (
      SELECT
        card_id,
        COUNT(*)::int AS txn_count,
        MAX(card_name) AS card_name_sample,
        MAX(card_display_name) AS card_display_name_sample,
        MAX(raw->'card_holder'->>'first_name') AS holder_first,
        MAX(raw->'card_holder'->>'last_name') AS holder_last,
        MAX(raw->'card_holder'->>'department_name') AS holder_dept
      FROM ramp_transactions
      WHERE card_id IS NOT NULL
      GROUP BY card_id
    )
    SELECT
      c.key                                        AS card_id,
      c.label                                      AS label,
      c.bucket                                     AS bucket,
      to_char(c.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
      COALESCE(t.txn_count, 0)                     AS txn_count,
      COALESCE(NULLIF(REGEXP_REPLACE(t.card_name_sample, '[^0-9]', '', 'g'), ''), '????') AS last_four,
      false                                        AS unmapped,
      COALESCE(t.holder_first || ' ' || t.holder_last, '') AS cardholder,
      COALESCE(t.holder_dept, '') AS department,
      COALESCE(t.card_display_name_sample, '') AS ramp_display_name
    FROM classifications c
    LEFT JOIN txn_counts t ON t.card_id = c.key
    WHERE c.scope = 'card'

    UNION ALL

    SELECT
      t.card_id                                    AS card_id,
      '(unmapped)'                                 AS label,
      NULL                                         AS bucket,
      NULL                                         AS updated_at,
      t.txn_count,
      COALESCE(NULLIF(REGEXP_REPLACE(t.card_name_sample, '[^0-9]', '', 'g'), ''), '????') AS last_four,
      true                                         AS unmapped,
      COALESCE(t.holder_first || ' ' || t.holder_last, '') AS cardholder,
      COALESCE(t.holder_dept, '') AS department,
      COALESCE(t.card_display_name_sample, '') AS ramp_display_name
    FROM txn_counts t
    LEFT JOIN classifications c
      ON c.scope = 'card' AND c.key = t.card_id
    WHERE c.key IS NULL

    ORDER BY unmapped DESC, txn_count DESC, card_id`
  );
  return rows;
}

export default async function CardMapPage() {
  const rows = await loadCards();
  return (
    <>
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Card Map</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Cards seen in transactions but not yet mapped appear at the top with an &quot;(unmapped)&quot; tag.
      </p>
      <CardMapTable initialRows={rows} />
    </>
  );
}
