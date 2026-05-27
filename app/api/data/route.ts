// app/api/data/route.ts
// Plain English: Single endpoint the dashboard calls to fetch its data.
// Returns daily rows + last-refresh timestamp + needs-classification summary.
// Behind Auth.js — user@example.com gets a 403 via the defensive domain check below.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dailySpend, lastSuccessfulSyncAt } from "@/lib/db";
import { rangeFor, parseRangeLabel } from "@/lib/ranges";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email?.endsWith("@example.com")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const rangeParam = parseRangeLabel(req.nextUrl.searchParams.get("range"));
  const range = rangeFor(rangeParam);

  try {
    const rows = await dailySpend({ startDate: range.startDate, endDate: range.endDate });
    const lastSync = await lastSuccessfulSyncAt();
    return NextResponse.json({
      range,
      rows,
      lastSuccessfulSyncAt: lastSync?.toISOString() ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/data] fetch failed:", msg);
    return NextResponse.json({ error: "data_unavailable" }, { status: 503 });
  }
}
