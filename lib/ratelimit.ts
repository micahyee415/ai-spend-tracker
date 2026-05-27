// lib/ratelimit.ts
// Plain English: Per-user, in-memory throttle for the manual refresh button.
// Keyed by email. 1 invocation per 5 minutes.

// V1 limitation: this Map is in-memory per Vercel instance. Multiple cold instances
// could each allow one refresh within the cooldown window. Acceptable for a 2-user
// dashboard in a single region. Move to Redis or upstash if user count grows.
const lastRunByUser = new Map<string, number>();
const COOLDOWN_MS = 5 * 60 * 1000;

export function canRefresh(userEmail: string): { ok: boolean; retryAfterMs?: number } {
  const last = lastRunByUser.get(userEmail) ?? 0;
  const elapsed = Date.now() - last;
  if (elapsed < COOLDOWN_MS) return { ok: false, retryAfterMs: COOLDOWN_MS - elapsed };
  return { ok: true };
}

export function recordRefresh(userEmail: string): void {
  lastRunByUser.set(userEmail, Date.now());
}
