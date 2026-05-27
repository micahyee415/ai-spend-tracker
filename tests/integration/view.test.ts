// tests/integration/view.test.ts
// Integration tests for the ai_spend_daily view and query helpers.
// Uses pg directly for setup/teardown (since @vercel/postgres requires Neon's HTTP driver).
// The dailySpend() helper under test uses the same pg Pool via lib/db.ts.
import { describe, it, expect, afterEach, afterAll } from "vitest";
import { Pool } from "pg";
import { dailySpend } from "@/lib/db";

const testPool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: false,
});

const TEST_TXN_IDS = ["test_tx_1", "test_tx_2", "test_tx_3"];
const TEST_VENDORS = ["fakevendor", "fakeazure"];

describe("ai_spend_daily view", () => {
  afterAll(async () => {
    await testPool.end();
    // Also close the lib/db.ts pool if it was used by query helpers
    try { await (await import("@/lib/db")).pool.end(); } catch {}
  });

  afterEach(async () => {
    for (const id of TEST_TXN_IDS) {
      await testPool.query("DELETE FROM ramp_transactions WHERE id = $1", [id]);
    }
    for (const v of TEST_VENDORS) {
      await testPool.query("DELETE FROM classifications WHERE key = $1", [v]);
    }
    await testPool.query("DELETE FROM classifications WHERE key = $1", ["test_card_1"]);
  });

  it("vendor override beats card map", async () => {
    await testPool.query(
      "INSERT INTO classifications (scope, key, label) VALUES ('allowlist', 'fakevendor', 'Fake AI')"
    );
    await testPool.query(
      "INSERT INTO classifications (scope, key, bucket, label) VALUES ('card', 'test_card_1', 'license', 'Fake License Card')"
    );
    await testPool.query(
      "INSERT INTO classifications (scope, key, bucket, label) VALUES ('vendor_override', 'fakevendor', 'api', 'Fake Override')"
    );
    await testPool.query(
      `INSERT INTO ramp_transactions (id, spend_type, occurred_at, amount_cents, vendor_normalized, card_id, raw)
       VALUES ('test_tx_1', 'card', '2026-05-15T12:00:00Z', 1000, 'fakevendor', 'test_card_1', '{}')`
    );
    const rows = await dailySpend({ startDate: "2026-05-14", endDate: "2026-05-16" });
    const row = rows.find((r) => r.vendor_normalized === "fakevendor");
    expect(row?.bucket).toBe("api");
    expect(row?.vendor_label).toBe("Fake Override");
  });

  it("min_amount_cents filter excludes small transactions on allowlisted vendor", async () => {
    // Allowlist 'fakeazure' with a $50 minimum (5000 cents)
    await testPool.query(
      "INSERT INTO classifications (scope, key, label, min_amount_cents) VALUES ('allowlist', 'fakeazure', 'Fake Azure', 5000)"
    );
    // Small transaction — should be excluded by the view's JOIN condition
    await testPool.query(
      `INSERT INTO ramp_transactions (id, spend_type, occurred_at, amount_cents, vendor_normalized, raw)
       VALUES ('test_tx_2', 'bill', '2026-05-15T12:00:00Z', 4900, 'fakeazure', '{}')`
    );
    // Large transaction — should be included
    await testPool.query(
      `INSERT INTO ramp_transactions (id, spend_type, occurred_at, amount_cents, vendor_normalized, raw)
       VALUES ('test_tx_3', 'bill', '2026-05-15T12:00:00Z', 7500, 'fakeazure', '{}')`
    );
    const rows = await dailySpend({ startDate: "2026-05-14", endDate: "2026-05-16" });
    const fakeAzureRows = rows.filter((r) => r.vendor_normalized === "fakeazure");
    // Only the large transaction should appear
    expect(fakeAzureRows.length).toBe(1);
    expect(fakeAzureRows[0].amount_cents).toBe(7500);
    expect(fakeAzureRows[0].txn_count).toBe(1);
  });
});
