// scripts/backfill.ts
// One-time, manual backfill. Pulls the trailing 24 months of transactions,
// bills, and reimbursements from Ramp into Postgres. Idempotent — re-running
// is safe (ON CONFLICT DO UPDATE).
//
// Run from project root:
//   npx tsx --env-file=.env.local scripts/backfill.ts

import { runSync } from "@/lib/sync";

async function main() {
  const since = new Date();
  since.setMonth(since.getMonth() - 24);
  const sinceIso = since.toISOString();
  console.log(`Backfilling from ${sinceIso}...`);

  console.log("Pulling 24 months of transactions from Ramp...");
  const results = await runSync({ sinceOverride: sinceIso });

  console.log("\nBackfill complete:");
  console.table(results);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
