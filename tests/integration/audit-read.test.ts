import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { Pool } from "pg";

vi.mock("@/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: "user@example.com" } }),
}));

import { GET } from "@/app/api/admin/audit/route";

const pool = new Pool({ connectionString: process.env.POSTGRES_URL, ssl: false });
const TEST_PREFIX = "tar_";  // test-audit-read prefix

beforeEach(async () => {
  process.env.ADMIN_EMAILS = "user@example.com";
  await pool.query(`DELETE FROM audit_log WHERE actor_email = 'user@example.com'`);
});

afterAll(async () => {
  await pool.query(`DELETE FROM audit_log WHERE actor_email = 'user@example.com'`);
  await pool.end();
});

async function seedAudit(scope: string, key: string, action: string, after: any = { label: "X" }) {
  await pool.query(
    `INSERT INTO audit_log (actor_email, action, scope, key, after) VALUES ('user@example.com', $1, $2, $3, $4::jsonb)`,
    [action, scope, key, after ? JSON.stringify(after) : null]
  );
}

function req(path: string) {
  return new Request(`http://localhost${path}`) as any;
}

describe("GET /api/admin/audit", () => {
  it("returns paginated rows newest first", async () => {
    for (let i = 0; i < 3; i++) {
      await seedAudit("allowlist", `${TEST_PREFIX}v${i}`, "create");
    }
    const res = await GET(req("/api/admin/audit"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows.length).toBeGreaterThanOrEqual(3);
    // newest first by ts
    const tsValues = body.rows.map((r: any) => new Date(r.ts).getTime());
    expect(tsValues).toEqual([...tsValues].sort((a, b) => b - a));
  });

  it("filters by scope", async () => {
    await seedAudit("allowlist", `${TEST_PREFIX}al`, "create");
    await seedAudit("card", `${TEST_PREFIX}cd`, "create");
    const res = await GET(req("/api/admin/audit?scope=card"));
    const body = await res.json();
    const testRows = body.rows.filter((r: any) => r.key.startsWith(TEST_PREFIX));
    expect(testRows.every((r: any) => r.scope === "card")).toBe(true);
  });

  it("filters by key", async () => {
    await seedAudit("allowlist", `${TEST_PREFIX}target`, "create");
    await seedAudit("allowlist", `${TEST_PREFIX}other`, "create");
    const res = await GET(req(`/api/admin/audit?key=${TEST_PREFIX}target`));
    const body = await res.json();
    const testRows = body.rows.filter((r: any) => r.actor_email === "user@example.com");
    expect(testRows).toHaveLength(1);
    expect(testRows[0].key).toBe(`${TEST_PREFIX}target`);
  });

  it("rejects invalid scope value", async () => {
    const res = await GET(req("/api/admin/audit?scope=bogus"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION");
  });

  it("returns total count for pagination", async () => {
    for (let i = 0; i < 5; i++) {
      await seedAudit("allowlist", `${TEST_PREFIX}page${i}`, "create");
    }
    const res = await GET(req("/api/admin/audit"));
    const body = await res.json();
    expect(body.total).toBeGreaterThanOrEqual(5);
    expect(body.pageSize).toBe(50);
    expect(body.page).toBe(0);
  });
});
