// app/api/data/transactions/route.ts
// Plain English: Drill-down endpoint for the per-vendor table. Returns the individual
// Ramp transactions for one vendor over the active range. Hardened with the same
// @example.com domain check, dynamic export, date-format validation, and try/catch as
// /api/data/route.ts.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { transactionsForVendor } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email?.endsWith("@example.com")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const vendor = req.nextUrl.searchParams.get("vendor");
  const startDate = req.nextUrl.searchParams.get("startDate");
  const endDate = req.nextUrl.searchParams.get("endDate");
  const bucketParam = req.nextUrl.searchParams.get("bucket");
  if (!vendor || !startDate || !endDate) {
    return NextResponse.json({ error: "missing params" }, { status: 400 });
  }

  // Validate date format (YYYY-MM-DD) to prevent SQL surprises.
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(startDate) || !dateRe.test(endDate)) {
    return NextResponse.json({ error: "invalid date format" }, { status: 400 });
  }

  // Bucket is optional; when provided it must be license or api.
  const bucket: "license" | "api" | undefined =
    bucketParam === "license" || bucketParam === "api" ? bucketParam : undefined;

  try {
    const rows = await transactionsForVendor({ vendor_normalized: vendor, startDate, endDate, bucket });
    return NextResponse.json({ rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/data/transactions] failed:", msg);
    return NextResponse.json({ error: "data_unavailable" }, { status: 503 });
  }
}
