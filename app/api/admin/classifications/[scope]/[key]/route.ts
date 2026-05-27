// app/api/admin/classifications/[scope]/[key]/route.ts
// Plain English: PUT upserts a classification row and DELETE removes one.
// Both operations run inside a single transaction so the audit row commits
// or rolls back atomically with the data change.

import { NextRequest } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { requireAdmin, adminErrorResponse } from "@/lib/admin-auth";
import { writeAudit, diffAction, type AuditScope } from "@/lib/audit";

const SCOPES = ["allowlist", "card", "vendor_override"] as const;
const BUCKETS = ["license", "api", "exclude"] as const;

const PutBody = z.object({
  label: z.string().min(1),
  bucket: z.enum(BUCKETS).optional(),
  notes: z.string().max(2000).optional(),
  min_amount_cents: z.number().int().nonnegative().optional(),
});

type RouteParams = { scope: string; key: string };

class ValidationError extends Error {}

function validationResponse(msg: string): Response {
  return Response.json(
    { ok: false, error: { code: "VALIDATION", message: msg } },
    { status: 400 }
  );
}

function validateScope(s: string): AuditScope {
  if (!(SCOPES as readonly string[]).includes(s)) {
    throw new ValidationError(`Invalid scope: ${s}`);
  }
  return s as AuditScope;
}

export async function PUT(req: NextRequest, ctx: { params: Promise<RouteParams> }) {
  try {
    const { email } = await requireAdmin();
    const { scope: rawScope, key } = await ctx.params;
    const scope = validateScope(rawScope);
    // Next.js 16 already URL-decodes dynamic params before they reach the handler
    const decodedKey = key;

    const parsed = PutBody.safeParse(await req.json());
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return validationResponse(`${issue.path.join(".")}: ${issue.message}`);
    }
    const { label, bucket, notes, min_amount_cents } = parsed.data;

    if (scope === "allowlist" && bucket !== undefined) {
      return validationResponse("bucket is not allowed for scope=allowlist");
    }
    if ((scope === "card" || scope === "vendor_override") && !bucket) {
      return validationResponse(`bucket is required for scope=${scope}`);
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const beforeRes = await client.query(
        `SELECT scope, key, bucket, label, notes, min_amount_cents FROM classifications WHERE scope = $1 AND key = $2`,
        [scope, decodedKey]
      );
      const before = beforeRes.rows[0] ?? null;

      await client.query(
        `INSERT INTO classifications (scope, key, bucket, label, notes, min_amount_cents, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())
         ON CONFLICT (scope, key) DO UPDATE
         SET bucket = EXCLUDED.bucket,
             label = EXCLUDED.label,
             notes = EXCLUDED.notes,
             min_amount_cents = EXCLUDED.min_amount_cents,
             updated_at = now()`,
        [scope, decodedKey, scope === "allowlist" ? null : bucket, label, notes ?? null, min_amount_cents ?? null]
      );

      const afterRes = await client.query(
        `SELECT scope, key, bucket, label, notes, min_amount_cents FROM classifications WHERE scope = $1 AND key = $2`,
        [scope, decodedKey]
      );
      const after = afterRes.rows[0];

      await writeAudit(client, {
        actor_email: email,
        action: diffAction(before, after),
        scope,
        key: decodedKey,
        before,
        after,
      });

      await client.query("COMMIT");
      return Response.json({ ok: true, row: after });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    if (err instanceof ValidationError) return validationResponse(err.message);
    return adminErrorResponse(err);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<RouteParams> }) {
  try {
    const { email } = await requireAdmin();
    const { scope: rawScope, key } = await ctx.params;
    const scope = validateScope(rawScope);
    // Next.js 16 already URL-decodes dynamic params before they reach the handler
    const decodedKey = key;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const beforeRes = await client.query(
        `SELECT scope, key, bucket, label, notes, min_amount_cents FROM classifications WHERE scope = $1 AND key = $2`,
        [scope, decodedKey]
      );
      const before = beforeRes.rows[0] ?? null;

      if (!before) {
        await client.query("ROLLBACK");
        return Response.json(
          { ok: false, error: { code: "NOT_FOUND", message: "No such classification" } },
          { status: 404 }
        );
      }

      await client.query(`DELETE FROM classifications WHERE scope = $1 AND key = $2`, [scope, decodedKey]);

      await writeAudit(client, {
        actor_email: email,
        action: "delete",
        scope,
        key: decodedKey,
        before,
        after: null,
      });

      await client.query("COMMIT");
      return Response.json({ ok: true });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    if (err instanceof ValidationError) return validationResponse(err.message);
    return adminErrorResponse(err);
  }
}
