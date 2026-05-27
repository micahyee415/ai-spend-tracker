// scripts/backfill-cursor-usage.ts
// One-time, manual backfill of Cursor billed usage into cursor_usage_daily.
// Idempotent (ON CONFLICT (day) DO UPDATE). Reads CURSOR_ADMIN_KEY from env.
//
// Run from project root:
//   npx tsx --env-file=.env.local scripts/backfill-cursor-usage.ts
//
// Validation: the printed YTD total should match Ramp's reported Cursor spend
// (within ~2%). A large mismatch means Ramp uses overallSpendCents and the
// netting basis (lib/cursor.ts chargedCents) must be revisited (Spec assumption #2).
import { syncCursorUsage } from "@/lib/sync";

async function main() {
  const start = Date.parse("2026-01-01T00:00:00Z");
  const end = Date.now();
  console.log(`Backfilling Cursor usage ${new Date(start).toISOString()} → ${new Date(end).toISOString()}...`);

  const res = await syncCursorUsage({ startMs: start, endMs: end });

  console.log("\nCursor usage backfill complete:");
  console.table(res);
  console.log(`YTD billed usage: $${(res.charged_cents / 100).toFixed(2)} (reconcile against Ramp's reported Cursor spend)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Cursor usage backfill failed:", err);
    process.exit(1);
  });
