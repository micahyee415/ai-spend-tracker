import { pool } from "@/lib/db";
import { OverridesTable, type OverrideRow } from "@/components/admin/OverridesTable";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

async function loadOverrides(): Promise<OverrideRow[]> {
  await requireAdmin();
  const { rows } = await pool.query<OverrideRow>(
    `SELECT key, label, bucket, to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
     FROM classifications
     WHERE scope = 'vendor_override'
     ORDER BY key`
  );
  return rows;
}

export default async function OverridesPage() {
  const rows = await loadOverrides();
  return (
    <>
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Vendor Overrides</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Override the card-based bucket for a vendor — e.g., a license card running an API charge.
        Overrides beat card map in classification.
      </p>
      <OverridesTable initialRows={rows} />
    </>
  );
}
