import { describe, it, expect, afterAll, afterEach } from "vitest";
import { Pool } from "pg";
import { writeAudit } from "@/lib/audit";

const pool = new Pool({ connectionString: process.env.POSTGRES_URL, ssl: false });

afterEach(async () => {
  await pool.query(`DELETE FROM audit_log WHERE actor_email = 'user@example.com'`);
});

afterAll(async () => {
  await pool.end();
});

describe("writeAudit", () => {
  it("round-trips create payload (before=null)", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await writeAudit(client, {
        actor_email: "user@example.com",
        action: "create",
        scope: "allowlist",
        key: "test-vendor",
        before: null,
        after: { scope: "allowlist", key: "test-vendor", label: "Test" },
      });
      await client.query("COMMIT");
    } finally {
      client.release();
    }
    const { rows } = await pool.query(
      `SELECT * FROM audit_log WHERE actor_email = 'user@example.com' AND key = 'test-vendor'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("create");
    expect(rows[0].before).toBeNull();
    expect(rows[0].after).toMatchObject({ label: "Test" });
  });

  it("round-trips delete payload (after=null)", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await writeAudit(client, {
        actor_email: "user@example.com",
        action: "delete",
        scope: "card",
        key: "card-del",
        before: { scope: "card", key: "card-del", bucket: "license", label: "X" },
        after: null,
      });
      await client.query("COMMIT");
    } finally {
      client.release();
    }
    const { rows } = await pool.query(
      `SELECT * FROM audit_log WHERE actor_email = 'user@example.com' AND key = 'card-del'`
    );
    expect(rows[0].after).toBeNull();
    expect(rows[0].before).toMatchObject({ bucket: "license" });
  });

  it("rolls back audit row when transaction aborts", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await writeAudit(client, {
        actor_email: "user@example.com",
        action: "update",
        scope: "vendor_override",
        key: "rollback-test",
        before: { label: "old" },
        after: { label: "new" },
      });
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    const { rows } = await pool.query(
      `SELECT * FROM audit_log WHERE actor_email = 'user@example.com' AND key = 'rollback-test'`
    );
    expect(rows).toHaveLength(0);
  });
});
