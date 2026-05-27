// app/api/admin/audit/route.ts
// Plain English: Returns paginated audit log history. Supports optional scope and key
// filters, plus page-based pagination (50 rows/page). Returns total count so the client
// can compute page counts without a separate request.

import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { requireAdmin, adminErrorResponse } from "@/lib/admin-auth";

const PAGE_SIZE = 50;
const VALID_SCOPES = ["allowlist", "card", "vendor_override"] as const;

export interface AuditRowResponse {
  id: number;
  ts: string;
  actor_email: string;
  action: "create" | "update" | "delete";
  scope: string;
  key: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const scope = url.searchParams.get("scope");
    const key = url.searchParams.get("key");
    const page = Math.max(0, parseInt(url.searchParams.get("page") ?? "0", 10) || 0);
    const offset = page * PAGE_SIZE;

    if (scope !== null && !(VALID_SCOPES as readonly string[]).includes(scope)) {
      return Response.json(
        { ok: false, error: { code: "VALIDATION", message: `Invalid scope: ${scope}` } },
        { status: 400 }
      );
    }

    const { rows } = await pool.query(
      `SELECT id, ts, actor_email, action, scope, key, before, after
       FROM audit_log
       WHERE ($1::text IS NULL OR scope = $1)
         AND ($2::text IS NULL OR key = $2)
       ORDER BY ts DESC
       LIMIT $3 OFFSET $4`,
      [scope, key, PAGE_SIZE, offset]
    );

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM audit_log
       WHERE ($1::text IS NULL OR scope = $1)
         AND ($2::text IS NULL OR key = $2)`,
      [scope, key]
    );

    return Response.json({
      ok: true,
      rows,
      page,
      pageSize: PAGE_SIZE,
      total: countRows[0]?.total ?? 0,
    });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
