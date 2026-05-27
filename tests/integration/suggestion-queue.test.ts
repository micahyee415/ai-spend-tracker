import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { Pool } from "pg";

vi.mock("@/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: "user@example.com" } }),
}));

import { GET } from "@/app/api/admin/suggestions/route";
import { POST as Promote, DELETE as Dismiss } from "@/app/api/admin/suggestions/[vendor]/route";
import { GET as Drawer } from "@/app/api/admin/suggestions/[vendor]/transactions/route";

const pool = new Pool({ connectionString: process.env.POSTGRES_URL, ssl: false });
const TEST_PREFIX = "test_sq_";
// WB_PREFIX: used for word-boundary tests — ends with a space so "ai" has a
// clean left boundary (space is not a word char in Postgres POSIX regex).
const WB_PREFIX = "sqyx ";

beforeEach(async () => {
  process.env.ADMIN_EMAILS = "user@example.com";
  await pool.query(`DELETE FROM ramp_transactions WHERE id LIKE '${TEST_PREFIX}%'`);
  await pool.query(`DELETE FROM classifications WHERE key LIKE '${TEST_PREFIX}%'`);
  await pool.query(`DELETE FROM suggestion_dismissals WHERE vendor_normalized LIKE '${TEST_PREFIX}%'`);
  // word-boundary test fixtures use the sqyx_ id prefix
  await pool.query(`DELETE FROM ramp_transactions WHERE id LIKE 'sqyx_%'`);
});

afterAll(async () => {
  await pool.query(`DELETE FROM ramp_transactions WHERE id LIKE '${TEST_PREFIX}%'`);
  await pool.query(`DELETE FROM classifications WHERE key LIKE '${TEST_PREFIX}%'`);
  await pool.query(`DELETE FROM suggestion_dismissals WHERE vendor_normalized LIKE '${TEST_PREFIX}%'`);
  await pool.query(`DELETE FROM ramp_transactions WHERE id LIKE 'sqyx_%'`);
  await pool.end();
});

async function seedTxn(id: string, vendor: string, cents: number, daysAgo: number) {
  await pool.query(
    `INSERT INTO ramp_transactions (id, spend_type, occurred_at, amount_cents, vendor_normalized, raw)
     VALUES ($1, 'card', NOW() - ($2 || ' days')::interval, $3, $4, '{}'::jsonb)`,
    [id, daysAgo, cents, vendor]
  );
}

describe("suggestion queue", () => {
  it("returns AI-keyword vendor above threshold within window", async () => {
    await seedTxn(TEST_PREFIX + "1", TEST_PREFIX + "replicate", 12000, 30);
    const res = await GET();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.rows.find((r: any) => r.vendor_normalized === TEST_PREFIX + "replicate")).toBeTruthy();
  });

  it("excludes vendors below $50 lifetime", async () => {
    await seedTxn(TEST_PREFIX + "2", TEST_PREFIX + "openai_tiny", 2500, 30);
    const res = await GET();
    const body = await res.json();
    expect(body.rows.find((r: any) => r.vendor_normalized === TEST_PREFIX + "openai_tiny")).toBeFalsy();
  });

  it("excludes vendors older than 180 days", async () => {
    await seedTxn(TEST_PREFIX + "3", TEST_PREFIX + "anthropic_old", 99999, 200);
    const res = await GET();
    const body = await res.json();
    expect(body.rows.find((r: any) => r.vendor_normalized === TEST_PREFIX + "anthropic_old")).toBeFalsy();
  });

  it("excludes allowlisted vendors", async () => {
    await seedTxn(TEST_PREFIX + "4", TEST_PREFIX + "cursor", 50000, 30);
    await pool.query(`INSERT INTO classifications (scope, key, label) VALUES ('allowlist', $1, 'Cursor')`, [TEST_PREFIX + "cursor"]);
    const res = await GET();
    const body = await res.json();
    expect(body.rows.find((r: any) => r.vendor_normalized === TEST_PREFIX + "cursor")).toBeFalsy();
  });

  it("excludes dismissed vendors", async () => {
    await seedTxn(TEST_PREFIX + "5", TEST_PREFIX + "huggingface", 50000, 30);
    await pool.query(
      `INSERT INTO suggestion_dismissals (vendor_normalized, actor_email) VALUES ($1, 'user@example.com')`,
      [TEST_PREFIX + "huggingface"]
    );
    const res = await GET();
    const body = await res.json();
    expect(body.rows.find((r: any) => r.vendor_normalized === TEST_PREFIX + "huggingface")).toBeFalsy();
  });

  it("excludes non-AI-keyword vendors regardless of spend", async () => {
    await seedTxn(TEST_PREFIX + "6", TEST_PREFIX + "starbucks", 99999, 30);
    const res = await GET();
    const body = await res.json();
    expect(body.rows.find((r: any) => r.vendor_normalized === TEST_PREFIX + "starbucks")).toBeFalsy();
  });

  it("orders by lifetime_total_cents descending", async () => {
    await seedTxn(TEST_PREFIX + "7a", TEST_PREFIX + "openai_a", 10000, 30);
    await seedTxn(TEST_PREFIX + "7b", TEST_PREFIX + "openai_b", 99999, 30);
    const res = await GET();
    const body = await res.json();
    const testRows = body.rows.filter((r: any) => r.vendor_normalized.startsWith(TEST_PREFIX + "openai_"));
    expect(testRows[0].vendor_normalized).toBe(TEST_PREFIX + "openai_b");
  });

  // Regression tests: Postgres POSIX regex uses \y for word boundary, not \b.
  // WB_PREFIX ends with a space so "ai" has a clean left word boundary.
  it("matches vendors with standalone 'ai' (word boundary) — Postgres \\y test", async () => {
    const vendor = WB_PREFIX + "ai studio";
    await seedTxn("sqyx_9", vendor, 50000, 30);
    const res = await GET();
    const body = await res.json();
    expect(body.rows.find((r: any) => r.vendor_normalized === vendor)).toBeTruthy();
  });

  it("does NOT match 'ai' inside other words — Postgres \\y test", async () => {
    const vendor = WB_PREFIX + "aimed studio";
    await seedTxn("sqyx_10", vendor, 50000, 30);
    const res = await GET();
    const body = await res.json();
    expect(body.rows.find((r: any) => r.vendor_normalized === vendor)).toBeFalsy();
  });

  it("matches vendor literally named 'ai' — Postgres \\y test", async () => {
    const vendor = WB_PREFIX + "ai";
    await seedTxn("sqyx_11", vendor, 50000, 30);
    const res = await GET();
    const body = await res.json();
    expect(body.rows.find((r: any) => r.vendor_normalized === vendor)).toBeTruthy();
  });
});

describe("promote / dismiss / drawer", () => {
  const PR_PREFIX = "test_pr_";
  beforeEach(async () => {
    process.env.ADMIN_EMAILS = "user@example.com";
    await pool.query(`DELETE FROM classifications WHERE key LIKE '${PR_PREFIX}%'`);
    await pool.query(`DELETE FROM suggestion_dismissals WHERE vendor_normalized LIKE '${PR_PREFIX}%'`);
    await pool.query(`DELETE FROM ramp_transactions WHERE id LIKE '${PR_PREFIX}%'`);
    await pool.query(`DELETE FROM audit_log WHERE key LIKE '${PR_PREFIX}%'`);
  });

  it("promote inserts allowlist row + audit", async () => {
    const req = new Request("http://x", { method: "POST", body: JSON.stringify({ label: "TestVendor" }) });
    const res = await Promote(req as any, { params: Promise.resolve({ vendor: PR_PREFIX + "vendor" }) } as any);
    expect(res.status).toBe(200);
    const rows = await pool.query(`SELECT * FROM classifications WHERE key = $1`, [PR_PREFIX + "vendor"]);
    expect(rows.rows[0].label).toBe("TestVendor");
    const audit = await pool.query(`SELECT * FROM audit_log WHERE key = $1`, [PR_PREFIX + "vendor"]);
    expect(audit.rows[0].action).toBe("create");
  });

  it("promote rejects empty label", async () => {
    const req = new Request("http://x", { method: "POST", body: JSON.stringify({ label: "" }) });
    const res = await Promote(req as any, { params: Promise.resolve({ vendor: PR_PREFIX + "v2" }) } as any);
    expect(res.status).toBe(400);
  });

  it("dismiss adds row to suggestion_dismissals", async () => {
    const res = await Dismiss(new Request("http://x") as any, { params: Promise.resolve({ vendor: PR_PREFIX + "dismiss" }) } as any);
    expect(res.status).toBe(200);
    const rows = await pool.query(`SELECT * FROM suggestion_dismissals WHERE vendor_normalized = $1`, [PR_PREFIX + "dismiss"]);
    expect(rows.rows).toHaveLength(1);
  });

  it("dismiss is idempotent (updates dismissed_at)", async () => {
    const ctx = { params: Promise.resolve({ vendor: PR_PREFIX + "idemp" }) };
    await Dismiss(new Request("http://x") as any, ctx as any);
    const first = await pool.query(`SELECT dismissed_at FROM suggestion_dismissals WHERE vendor_normalized = $1`, [PR_PREFIX + "idemp"]);
    await new Promise(r => setTimeout(r, 50));
    await Dismiss(new Request("http://x") as any, ctx as any);
    const second = await pool.query(`SELECT dismissed_at FROM suggestion_dismissals WHERE vendor_normalized = $1`, [PR_PREFIX + "idemp"]);
    expect(new Date(second.rows[0].dismissed_at).getTime()).toBeGreaterThan(new Date(first.rows[0].dismissed_at).getTime());
  });

  it("drawer returns transactions with card attribution", async () => {
    await pool.query(
      `INSERT INTO classifications (scope, key, bucket, label) VALUES ('card', $1, 'license', 'Test Card')`,
      [PR_PREFIX + "card_1234"]
    );
    await pool.query(
      `INSERT INTO ramp_transactions (id, spend_type, occurred_at, amount_cents, vendor_normalized, card_id, card_name, memo, raw)
       VALUES ($1, 'card', NOW() - INTERVAL '1 day', 12000, $2, $3, '•••• 1234', 'API usage', '{}'::jsonb)`,
      [PR_PREFIX + "t1", PR_PREFIX + "drawer_vendor", PR_PREFIX + "card_1234"]
    );
    const res = await Drawer(new Request("http://x") as any, { params: Promise.resolve({ vendor: PR_PREFIX + "drawer_vendor" }) } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows[0].card_label).toBe("Test Card");
    expect(body.rows[0].card_last_four).toBe("1234");
  });

  it("drawer handles unmapped card", async () => {
    await pool.query(
      `INSERT INTO ramp_transactions (id, spend_type, occurred_at, amount_cents, vendor_normalized, card_id, card_name, raw)
       VALUES ($1, 'card', NOW() - INTERVAL '1 day', 5000, $2, 'unmapped_5678', '•••• 5678', '{}'::jsonb)`,
      [PR_PREFIX + "t2", PR_PREFIX + "unmapped_vendor"]
    );
    const res = await Drawer(new Request("http://x") as any, { params: Promise.resolve({ vendor: PR_PREFIX + "unmapped_vendor" }) } as any);
    const body = await res.json();
    // card_label falls through to raw card_name when no classification exists
    expect(body.rows[0].card_label).toBe("•••• 5678");
    expect(body.rows[0].card_last_four).toBe("5678");
  });

  it("drawer extracts last-four from card_name format", async () => {
    await pool.query(
      `INSERT INTO ramp_transactions (id, spend_type, occurred_at, amount_cents, vendor_normalized, card_id, card_name, raw)
       VALUES ($1, 'card', NOW() - INTERVAL '1 day', 10000, $2, $3, $4, '{}'::jsonb)`,
      [PR_PREFIX + "real_card", PR_PREFIX + "real_vendor", "card_uuid_xyz_8a3f", "•••• 9876"]
    );
    const res = await Drawer(new Request("http://x") as any, { params: Promise.resolve({ vendor: PR_PREFIX + "real_vendor" }) } as any);
    const body = await res.json();
    expect(body.rows[0].card_last_four).toBe("9876");
  });

  it("promote of already-allowlisted vendor does not write a second audit row", async () => {
    const key = PR_PREFIX + "double_promote";
    // First promote
    await Promote(
      new Request("http://x", { method: "POST", body: JSON.stringify({ label: "V1" }) }) as any,
      { params: Promise.resolve({ vendor: key }) } as any
    );
    // Second promote
    const res = await Promote(
      new Request("http://x", { method: "POST", body: JSON.stringify({ label: "V2" }) }) as any,
      { params: Promise.resolve({ vendor: key }) } as any
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alreadyExisted).toBe(true);
    // Original label preserved (ON CONFLICT DO NOTHING)
    expect(body.row.label).toBe("V1");
    // Only ONE audit row
    const audit = await pool.query(`SELECT * FROM audit_log WHERE key = $1`, [key]);
    expect(audit.rows).toHaveLength(1);
  });
});
