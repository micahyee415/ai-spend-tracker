import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from "vitest";
import { Pool } from "pg";

vi.mock("@/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: "user@example.com" } }),
}));

import { PUT, DELETE } from "@/app/api/admin/classifications/[scope]/[key]/route";

const TEST_ACTOR = "user@example.com";
const TEST_KEY_PREFIX = "test_cw_";
const pool = new Pool({ connectionString: process.env.POSTGRES_URL, ssl: false });

beforeEach(async () => {
  process.env.ADMIN_EMAILS = TEST_ACTOR;
  await pool.query(`DELETE FROM classifications WHERE key LIKE '${TEST_KEY_PREFIX}%'`);
  await pool.query(`DELETE FROM audit_log WHERE actor_email = $1`, [TEST_ACTOR]);
});

afterAll(async () => {
  await pool.query(`DELETE FROM classifications WHERE key LIKE '${TEST_KEY_PREFIX}%'`);
  await pool.query(`DELETE FROM audit_log WHERE actor_email = $1`, [TEST_ACTOR]);
  await pool.end();
});

function makeReq(body: unknown) {
  return new Request("http://localhost", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

describe("PUT /api/admin/classifications/[scope]/[key]", () => {
  it("creates a new allowlist entry and writes audit row", async () => {
    const ctx = { params: Promise.resolve({ scope: "allowlist", key: TEST_KEY_PREFIX + "vendor" }) };
    const res = await PUT(makeReq({ label: "Test AI" }), ctx as any);
    expect(res.status).toBe(200);

    const rows = await pool.query(`SELECT * FROM classifications WHERE key = $1`, [TEST_KEY_PREFIX + "vendor"]);
    expect(rows.rows[0].label).toBe("Test AI");

    const audit = await pool.query(`SELECT * FROM audit_log WHERE key = $1`, [TEST_KEY_PREFIX + "vendor"]);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].action).toBe("create");
    expect(audit.rows[0].actor_email).toBe(TEST_ACTOR);
  });

  it("updates an existing entry — writes update audit row", async () => {
    const key = TEST_KEY_PREFIX + "v2";
    await pool.query(`INSERT INTO classifications (scope, key, label) VALUES ('allowlist', $1, 'Old Label')`, [key]);
    const ctx = { params: Promise.resolve({ scope: "allowlist", key }) };
    const res = await PUT(makeReq({ label: "New Label" }), ctx as any);
    expect(res.status).toBe(200);

    const audit = await pool.query(`SELECT * FROM audit_log WHERE key = $1 ORDER BY id DESC LIMIT 1`, [key]);
    expect(audit.rows[0].action).toBe("update");
    expect(audit.rows[0].before).toMatchObject({ label: "Old Label" });
    expect(audit.rows[0].after).toMatchObject({ label: "New Label" });
  });

  it("requires bucket for scope=card", async () => {
    const ctx = { params: Promise.resolve({ scope: "card", key: TEST_KEY_PREFIX + "card" }) };
    const res = await PUT(makeReq({ label: "X" }), ctx as any);
    expect(res.status).toBe(400);
  });

  it("rejects invalid bucket value", async () => {
    const ctx = { params: Promise.resolve({ scope: "card", key: TEST_KEY_PREFIX + "card2" }) };
    const res = await PUT(makeReq({ label: "X", bucket: "bogus" }), ctx as any);
    expect(res.status).toBe(400);
  });

  it("accepts bucket='exclude' on card scope", async () => {
    const key = TEST_KEY_PREFIX + "card_exc";
    const ctx = { params: Promise.resolve({ scope: "card", key }) };
    const res = await PUT(makeReq({ label: "Excluded card", bucket: "exclude" }), ctx as any);
    expect(res.status).toBe(200);
    const rows = await pool.query(`SELECT bucket FROM classifications WHERE key = $1`, [key]);
    expect(rows.rows[0].bucket).toBe("exclude");
  });

  it("rejects bucket on allowlist scope", async () => {
    const ctx = { params: Promise.resolve({ scope: "allowlist", key: TEST_KEY_PREFIX + "no_bucket" }) };
    const res = await PUT(makeReq({ label: "X", bucket: "license" }), ctx as any);
    expect(res.status).toBe(400);
  });

  it("sets and updates min_amount_cents on allowlist scope", async () => {
    const key = TEST_KEY_PREFIX + "threshold";
    const ctx = { params: Promise.resolve({ scope: "allowlist", key }) };

    let res = await PUT(makeReq({ label: "Threshold AI", min_amount_cents: 50000 }), ctx as any);
    expect(res.status).toBe(200);

    let rows = await pool.query(`SELECT min_amount_cents FROM classifications WHERE key = $1`, [key]);
    // pg returns BIGINT as string; accept either string or number form
    expect(String(rows.rows[0].min_amount_cents)).toBe("50000");

    res = await PUT(makeReq({ label: "Threshold AI", min_amount_cents: 100000 }), ctx as any);
    expect(res.status).toBe(200);
    rows = await pool.query(`SELECT min_amount_cents FROM classifications WHERE key = $1`, [key]);
    expect(String(rows.rows[0].min_amount_cents)).toBe("100000");
  });
});

describe("DELETE /api/admin/classifications/[scope]/[key]", () => {
  it("removes row and writes delete audit", async () => {
    const key = TEST_KEY_PREFIX + "del";
    await pool.query(`INSERT INTO classifications (scope, key, bucket, label) VALUES ('card', $1, 'license', 'X')`, [key]);
    const ctx = { params: Promise.resolve({ scope: "card", key }) };
    const res = await DELETE(new Request("http://x") as any, ctx as any);
    expect(res.status).toBe(200);

    const rows = await pool.query(`SELECT * FROM classifications WHERE key = $1`, [key]);
    expect(rows.rows).toHaveLength(0);

    const audit = await pool.query(`SELECT * FROM audit_log WHERE key = $1`, [key]);
    expect(audit.rows[0].action).toBe("delete");
    expect(audit.rows[0].after).toBeNull();
  });

  it("returns 404 on missing row", async () => {
    const ctx = { params: Promise.resolve({ scope: "allowlist", key: TEST_KEY_PREFIX + "missing" }) };
    const res = await DELETE(new Request("http://x") as any, ctx as any);
    expect(res.status).toBe(404);
  });
});
