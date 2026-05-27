// app/api/cron/sync/route.ts
// Plain English: The endpoint Vercel Cron hits daily at 5:00 AM PT.
// Gated by CRON_SECRET Bearer token (not Auth.js — cron has no session).
// Runs the same sync logic as the manual "Refresh now" button.

import { NextRequest, NextResponse } from "next/server";
import { runSync, backfillNewCardDetails, syncCursorUsage } from "@/lib/sync";
import { alertSyncFailure } from "@/lib/slack";

// Sync runs 3 spend types sequentially. Daily incremental syncs complete in 1-3s.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("[api/cron/sync] CRON_SECRET not set in env");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    // Interleaved order: card sync → card-detail backfill → bill+reimbursement sync.
    // Reason: bill sync can blow past the 60s Vercel maxDuration, leaving any
    // post-sync work unrun. Resolving card_name/card_display_name immediately after
    // card sync guarantees the dashboard's "CARD" column populates even when the
    // function times out before bills/reimbursements finish.
    // Defense in depth: lib/sync.ts also resolves card details inline during
    // upsertCard. This backfill catches anything that errored during that path.
    const cardResults = await runSync({ types: ["card"] });

    let cardDetails: { updated: number; skipped: number } | { error: string } = {
      updated: 0,
      skipped: 0,
    };
    try {
      cardDetails = await backfillNewCardDetails();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[api/cron/sync] card-details backfill failed:", msg);
      cardDetails = { error: msg };
    }

    const billReimbResults = await runSync({ types: ["bill", "reimbursement"] });
    const results = [...cardResults, ...billReimbResults];

    // Best-effort: pull trailing-7-day Cursor usage. A Cursor outage must never
    // break the Ramp sync, mirroring backfillNewCardDetails above.
    let cursorUsage: { days_upserted: number; charged_cents: number } | { error: string };
    try {
      cursorUsage = await syncCursorUsage();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[api/cron/sync] cursor usage sync failed:", msg);
      await alertSyncFailure(`cursor usage sync: ${msg}`);
      cursorUsage = { error: msg };
    }

    return NextResponse.json({ results, cardDetails, cursorUsage });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/cron/sync] failed:", msg);
    return NextResponse.json({ error: "sync_failed" }, { status: 500 });
  }
}
