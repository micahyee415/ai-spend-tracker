// lib/audit.ts
// Plain English: writeAudit() is called inside every classifications mutation
// transaction so the audit row commits or rolls back with the data change.

import type { PoolClient } from "pg";

export type AuditAction = "create" | "update" | "delete";
export type AuditScope = "allowlist" | "card" | "vendor_override";

export interface AuditRow {
  actor_email: string;
  action: AuditAction;
  scope: AuditScope;
  key: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export async function writeAudit(client: PoolClient, row: AuditRow): Promise<void> {
  await client.query(
    `INSERT INTO audit_log (actor_email, action, scope, key, before, after)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
    [
      row.actor_email,
      row.action,
      row.scope,
      row.key,
      row.before ? JSON.stringify(row.before) : null,
      row.after ? JSON.stringify(row.after) : null,
    ]
  );
}

export function diffAction(before: unknown, after: unknown): AuditAction {
  if (before === null && after !== null) return "create";
  if (before !== null && after === null) return "delete";
  return "update";
}
