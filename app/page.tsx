// app/page.tsx
import { auth } from "@/auth";
import {
  dailySpend,
  lastSuccessfulSyncAt,
  allowlistCount,
  allowlistLabels,
  unclassifiedTotalFor,
  cursorUsageDaily,
} from "@/lib/db";
import type { DailyRow, CursorUsageDay } from "@/lib/db";
import { applyCursorSplit } from "@/lib/cursor-split";
import { rangeFor, parseRangeLabel, subtractDays } from "@/lib/ranges";
import { redirect } from "next/navigation";
import DashboardClient from "@/components/DashboardClient";
import { parseAdminEmails } from "@/lib/admin-emails";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ range?: string }>;
}

export default async function Home({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.email?.endsWith("@example.com")) redirect("/login");
  const sp = await searchParams;
  const rangeLabel = parseRangeLabel(sp.range);
  const range = rangeFor(rangeLabel);

  // Previous-period window: same length, immediately preceding range.startDate.
  const prevEnd = subtractDays(range.startDate, 1);
  const prevStart = subtractDays(prevEnd, range.days - 1);

  // Year-ago window: same calendar window shifted back 365 days.
  const yoyStart = subtractDays(range.startDate, 365);
  const yoyEnd = subtractDays(range.endDate, 365);

  // YTD window for the per-vendor table's YTD column. Computed up-front so it
  // joins the same Promise.all for parallel fetch instead of a serial round-trip.
  const ytdRange = rangeFor("YTD");

  let rows: DailyRow[] = [];
  let previousRows: DailyRow[] = [];
  let yearAgoRows: DailyRow[] = [];
  let ytdRows: DailyRow[] = [];
  let allowlist = 0;
  let allowlistNames: string[] = [];
  let unclassified: { cents: number; txns: number } = { cents: 0, txns: 0 };
  let lastSync: Date | null = null;
  let dataError: string | null = null;
  let cursorResidual = false;
  try {
    const [
      rowsRes, prevRes, yoyRes, lastSyncRes, allowlistRes, allowlistNamesRes, unclassifiedRes, ytdRes,
      cuRange, cuPrev, cuYoy, cuYtd,
    ] = await Promise.all([
      dailySpend({ startDate: range.startDate, endDate: range.endDate }),
      dailySpend({ startDate: prevStart, endDate: prevEnd }),
      dailySpend({ startDate: yoyStart, endDate: yoyEnd }),
      lastSuccessfulSyncAt(),
      allowlistCount(),
      allowlistLabels(),
      unclassifiedTotalFor({ startDate: range.startDate, endDate: range.endDate }),
      dailySpend({ startDate: ytdRange.startDate, endDate: ytdRange.endDate }),
      cursorUsageDaily({ startDate: range.startDate, endDate: range.endDate }),
      cursorUsageDaily({ startDate: prevStart, endDate: prevEnd }),
      cursorUsageDaily({ startDate: yoyStart, endDate: yoyEnd }),
      cursorUsageDaily({ startDate: ytdRange.startDate, endDate: ytdRange.endDate }),
    ]);

    const split = (r: DailyRow[], u: CursorUsageDay[]) => applyCursorSplit(r, u);
    const main = split(rowsRes, cuRange);
    rows = main.rows;
    previousRows = split(prevRes, cuPrev).rows;
    yearAgoRows = split(yoyRes, cuYoy).rows;
    ytdRows = split(ytdRes, cuYtd).rows;
    cursorResidual = main.residualMonths.length > 0;
    if (cursorResidual) {
      console.warn("[app/page] Cursor residual months (usage > card):", main.residualMonths.join(", "));
    }

    lastSync = lastSyncRes;
    allowlist = allowlistRes;
    allowlistNames = allowlistNamesRes;
    unclassified = unclassifiedRes;
  } catch (err) {
    dataError = err instanceof Error ? err.message : "unknown";
    console.error("[app/page] data fetch failed:", dataError);
  }

  return (
    <DashboardClient
      rows={rows}
      previousRows={previousRows}
      yearAgoRows={yearAgoRows}
      ytdRows={ytdRows}
      allowlistCount={allowlist}
      allowlistNames={allowlistNames}
      unclassifiedTotal={unclassified}
      range={range}
      lastSync={lastSync?.toISOString() ?? null}
      userEmail={session.user.email ?? ""}
      isAdmin={parseAdminEmails().includes(session.user.email ?? "")}
      dataError={dataError}
      cursorResidual={cursorResidual}
    />
  );
}
