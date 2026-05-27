// tests/integration/migration-002.test.ts
// Integration tests for migration 002: audit_log and suggestion_dismissals tables.
// Verifies the tables exist with expected columns and that CHECK constraints are enforced.
import { describe, it, expect, afterAll, afterEach } from "vitest";
import { Pool } from "pg";

const testPool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: false,
});

const TEST_AUDIT_ACTOR = "user@example.com";
const TEST_VENDOR = "test-migration-002-vendor";

describe("migration-002: audit_log and suggestion_dismissals", () => {
  afterAll(async () => {
    await testPool.end();
  });

  afterEach(async () => {
    await testPool.query("DELETE FROM audit_log WHERE actor_email = $1", [TEST_AUDIT_ACTOR]);
    await testPool.query("DELETE FROM suggestion_dismissals WHERE vendor_normalized = $1", [TEST_VENDOR]);
  });

  it("audit_log has columns: actor_email, action, scope, before, after", async () => {
    const { rows } = await testPool.query<{ id: string }>(
      `INSERT INTO audit_log (actor_email, action, scope, key, before, after)
       VALUES ($1, 'create', 'allowlist', 'openai', NULL, '{"bucket":"api"}'::jsonb)
       RETURNING id`,
      [TEST_AUDIT_ACTOR]
    );
    expect(rows.length).toBe(1);
    expect(Number(rows[0].id)).toBeGreaterThan(0);

    // Read back and verify all expected columns are present
    const { rows: read } = await testPool.query<{
      actor_email: string;
      action: string;
      scope: string;
      key: string;
      before: unknown;
      after: unknown;
    }>(
      "SELECT actor_email, action, scope, key, before, after FROM audit_log WHERE id = $1",
      [rows[0].id]
    );
    expect(read[0].actor_email).toBe(TEST_AUDIT_ACTOR);
    expect(read[0].action).toBe("create");
    expect(read[0].scope).toBe("allowlist");
    expect(read[0].key).toBe("openai");
    expect(read[0].before).toBeNull();
    expect(read[0].after).toEqual({ bucket: "api" });
  });

  it("suggestion_dismissals has column: vendor_normalized", async () => {
    await testPool.query(
      `INSERT INTO suggestion_dismissals (vendor_normalized, actor_email)
       VALUES ($1, $2)`,
      [TEST_VENDOR, TEST_AUDIT_ACTOR]
    );

    const { rows } = await testPool.query<{
      vendor_normalized: string;
      actor_email: string;
      dismissed_at: string;
    }>(
      "SELECT vendor_normalized, actor_email, dismissed_at FROM suggestion_dismissals WHERE vendor_normalized = $1",
      [TEST_VENDOR]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].vendor_normalized).toBe(TEST_VENDOR);
    expect(rows[0].actor_email).toBe(TEST_AUDIT_ACTOR);
    expect(rows[0].dismissed_at).toBeTruthy();
  });

  it("audit_log.action CHECK constraint rejects invalid action values", async () => {
    await expect(
      testPool.query(
        `INSERT INTO audit_log (actor_email, action, scope, key)
         VALUES ($1, 'badaction', 'allowlist', 'openai')`,
        [TEST_AUDIT_ACTOR]
      )
    ).rejects.toThrow();
  });

  // migration-003: classifications.bucket CHECK expanded to allow 'exclude'
  it("allows bucket='exclude' on classifications after migration 003", async () => {
    await testPool.query(
      `INSERT INTO classifications (scope, key, bucket, label) VALUES ('card', 'test-exclude-card', 'exclude', 'Test')`
    );
    const { rows } = await testPool.query(
      `SELECT bucket FROM classifications WHERE key = 'test-exclude-card'`
    );
    expect(rows[0].bucket).toBe("exclude");
    await testPool.query(`DELETE FROM classifications WHERE key = 'test-exclude-card'`);
  });

  it("rejects bucket='invalid' on classifications", async () => {
    await expect(
      testPool.query(`INSERT INTO classifications (scope, key, bucket, label) VALUES ('card', 'test-bad', 'invalid', 'X')`)
    ).rejects.toThrow();
  });
});
