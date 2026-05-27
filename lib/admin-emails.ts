// lib/admin-emails.ts
// Pure function — no imports. Safe to use in both edge-runtime (auth.config.ts / proxy.ts)
// and Node.js runtime (lib/admin-auth.ts).
// Single source of truth for ADMIN_EMAILS parsing; both gates call this to avoid drift.

export function parseAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}
