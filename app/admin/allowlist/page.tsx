// app/admin/allowlist/page.tsx
// Plain English: Server Component — fetches every allowlisted vendor from the DB
// (with their optional vendor_override bucket) and passes the rows to AllowlistTable
// for client-side search, inline edit, delete, and add-new.

import { pool } from "@/lib/db";
import { AllowlistTable, type AllowlistRow } from "@/components/admin/AllowlistTable";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

async function loadAllowlist(): Promise<AllowlistRow[]> {
  await requireAdmin();
  const { rows } = await pool.query<AllowlistRow>(
    `SELECT
      a.key,
      a.label,
      vo.bucket           AS override_bucket,
      a.min_amount_cents::text  AS min_amount_cents,
      a.updated_at,
      CASE
        WHEN vo.key IS NOT NULL THEN false
        WHEN EXISTS (
          SELECT 1 FROM ramp_transactions rt
          LEFT JOIN classifications c
            ON c.scope = 'card' AND c.key = rt.card_id
          WHERE rt.vendor_normalized = a.key
            AND c.bucket IS NULL
        ) THEN true
        ELSE false
      END AS needs_classification
    FROM classifications a
    LEFT JOIN classifications vo
      ON vo.scope = 'vendor_override' AND vo.key = a.key
    WHERE a.scope = 'allowlist'
    ORDER BY a.key`
  );
  return rows;
}

export default async function AllowlistPage() {
  const rows = await loadAllowlist();
  const unclassifiedCount = rows.filter(r => r.needs_classification).length;
  return (
    <>
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">Allowlist</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Vendors that count toward AI spend. Bucket (license vs api) is resolved via card map or vendor override.
      </p>
      <AllowlistTable initialRows={rows} unclassifiedCount={unclassifiedCount} />
    </>
  );
}
