// tests/integration/migration-005.test.ts
// Integration test for migration 005: cursor_usage_daily table.
import { describe, it, expect, afterAll, afterEach } from "vitest";
import { Pool } from "pg";

const testPool = new Pool({ connectionString: process.env.POSTGRES_URL, ssl: false });
const TEST_DAY = "2099-01-01"; // far-future sentinel, never collides with real data

describe("migration-005: cursor_usage_daily", () => {
  afterAll(async () => { await testPool.end(); });
  afterEach(async () => {
    await testPool.query("DELETE FROM cursor_usage_daily WHERE day = $1", [TEST_DAY]);
  });

  it("has columns day, charged_cents, event_count, synced_at", async () => {
    await testPool.query(
      `INSERT INTO cursor_usage_daily (day, charged_cents, event_count) VALUES ($1, 12345, 7)`,
      [TEST_DAY]
    );
    const { rows } = await testPool.query<{ charged_cents: string; event_count: number }>(
      `SELECT charged_cents, event_count, synced_at FROM cursor_usage_daily WHERE day = $1`,
      [TEST_DAY]
    );
    expect(rows.length).toBe(1);
    expect(Number(rows[0].charged_cents)).toBe(12345);
    expect(rows[0].event_count).toBe(7);
  });

  it("day is the primary key — upsert overwrites", async () => {
    await testPool.query(`INSERT INTO cursor_usage_daily (day, charged_cents, event_count) VALUES ($1, 100, 1)`, [TEST_DAY]);
    await testPool.query(
      `INSERT INTO cursor_usage_daily (day, charged_cents, event_count) VALUES ($1, 200, 2)
       ON CONFLICT (day) DO UPDATE SET charged_cents = EXCLUDED.charged_cents, event_count = EXCLUDED.event_count`,
      [TEST_DAY]
    );
    const { rows } = await testPool.query<{ charged_cents: string }>(
      `SELECT charged_cents FROM cursor_usage_daily WHERE day = $1`, [TEST_DAY]
    );
    expect(rows.length).toBe(1);
    expect(Number(rows[0].charged_cents)).toBe(200);
  });
});
