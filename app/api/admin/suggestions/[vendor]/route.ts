// app/api/admin/suggestions/[vendor]/route.ts
// Plain English: POST promotes a suggestion vendor → inserts into allowlist + audit log.
// DELETE dismisses a vendor → upserts into suggestion_dismissals (idempotent).
// Both are admin-gated; forbidden if session is missing or non-admin.

import { NextRequest } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { requireAdmin, adminErrorResponse } from "@/lib/admin-auth";
import { writeAudit } from "@/lib/audit";

const PromoteBody = z.object({ label: z.string().min(1).max(200) });

type Params = { vendor: string };

export async function POST(req: NextRequest, ctx: { params: Promise<Params> }) {
  try {
    const { email } = await requireAdmin();
    const { vendor } = await ctx.params;
    // Next.js 16 already URL-decodes dynamic params before they reach the handler
    const key = vendor;
    const parsed = PromoteBody.safeParse(await req.json());
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return Response.json(
        { ok: false, error: { code: "VALIDATION", message: `${issue.path.join(".")}: ${issue.message}` } },
        { status: 400 }
      );
    }
    const { label } = parsed.data;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Capture before-state so we can detect idempotent re-promotes
      const beforeRes = await client.query(
        `SELECT scope, key, bucket, label, notes, min_amount_cents FROM classifications WHERE scope = 'allowlist' AND key = $1`,
        [key]
      );
      const before = beforeRes.rows[0] ?? null;

      await client.query(
        `INSERT INTO classifications (scope, key, label, updated_at)
         VALUES ('allowlist', $1, $2, now())
         ON CONFLICT (scope, key) DO NOTHING`,
        [key, label]
      );

      const afterRes = await client.query(
        `SELECT scope, key, bucket, label, notes, min_amount_cents FROM classifications WHERE scope = 'allowlist' AND key = $1`,
        [key]
      );
      const after = afterRes.rows[0];

      // Only write audit row when we actually created a new entry
      if (!before) {
        await writeAudit(client, {
          actor_email: email,
          action: "create",
          scope: "allowlist",
          key,
          before: null,
          after,
        });
      }

      await client.query("COMMIT");
      return Response.json({ ok: true, row: after, alreadyExisted: !!before });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    return adminErrorResponse(err);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<Params> }) {
  try {
    const { email } = await requireAdmin();
    const { vendor } = await ctx.params;
    // Next.js 16 already URL-decodes dynamic params before they reach the handler
    const key = vendor;
    await pool.query(
      `INSERT INTO suggestion_dismissals (vendor_normalized, actor_email)
       VALUES ($1, $2)
       ON CONFLICT (vendor_normalized) DO UPDATE SET dismissed_at = now(), actor_email = $2`,
      [key, email]
    );
    return Response.json({ ok: true });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
