// app/api/sync/run/route.ts
import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { runSync } from "@/lib/sync";
import { canRefresh, recordRefresh } from "@/lib/ratelimit";

// V1 cap: sync runs 3 spend types sequentially. Initial 24-month backfills can
// exceed 60s — for those, use scripts/backfill.ts directly. Incremental syncs
// (the common case) complete in 1-3s.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email?.endsWith("@example.com")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const gate = canRefresh(email);
  if (!gate.ok) {
    return NextResponse.json({ error: "rate_limited", retryAfterMs: gate.retryAfterMs }, { status: 429 });
  }

  try {
    const results = await runSync();
    recordRefresh(email);  // only record on success
    return NextResponse.json({ results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/sync/run] failed:", msg);
    return NextResponse.json({ error: "sync_failed" }, { status: 500 });
  }
}
