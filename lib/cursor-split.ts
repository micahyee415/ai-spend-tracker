// lib/cursor-split.ts
// Plain English: Pure transform. Takes the dashboard's daily rows plus Cursor's
// authoritative billed usage, and rewrites the Cursor lines so that:
//   - License "Cursor seats" = card charge - usage, netted PER CALENDAR MONTH
//   - API "Cursor (token usage)" = the billed usage
// Card-vs-usage netting is done per month (not per day, which would go negative,
// and not globally, which would let one month cancel another). Seats are floored
// at 0; any month where usage > card is flagged in residualMonths.
import type { DailyRow, CursorUsageDay } from "@/lib/db";

const CURSOR = "cursor";
const SEATS_LABEL = "Cursor seats";
const USAGE_LABEL = "Cursor (token usage)";

export interface CursorSplitResult {
  rows: DailyRow[];
  residualMonths: string[]; // YYYY-MM where usage exceeded card charges
}

function month(ymd: string): string {
  return ymd.slice(0, 7);
}

export function applyCursorSplit(rows: DailyRow[], usage: CursorUsageDay[]): CursorSplitResult {
  const cursorLicense = rows.filter((r) => r.vendor_normalized === CURSOR && r.bucket === "license");
  const rest = rows.filter((r) => !(r.vendor_normalized === CURSOR && r.bucket === "license"));

  // Aggregate Cursor card charges per month + remember the latest charge day & txn count.
  const cardByMonth = new Map<string, { cents: number; lastDay: string; txns: number }>();
  for (const r of cursorLicense) {
    const m = month(r.day);
    const cur = cardByMonth.get(m) ?? { cents: 0, lastDay: r.day, txns: 0 };
    cur.cents += r.amount_cents;
    cur.txns += r.txn_count;
    if (r.day > cur.lastDay) cur.lastDay = r.day;
    cardByMonth.set(m, cur);
  }

  // Aggregate usage per month.
  const usageByMonth = new Map<string, number>();
  for (const u of usage) {
    const m = month(u.day);
    usageByMonth.set(m, (usageByMonth.get(m) ?? 0) + u.charged_cents);
  }

  // One seat row per month with charges: seats = max(0, card - usage).
  const residualMonths: string[] = [];
  const seatRows: DailyRow[] = [];
  for (const [m, card] of cardByMonth) {
    const used = usageByMonth.get(m) ?? 0;
    if (used > card.cents) residualMonths.push(m);
    const seats = Math.max(0, card.cents - used);
    seatRows.push({
      day: card.lastDay,
      vendor_label: SEATS_LABEL,
      vendor_normalized: CURSOR,
      bucket: "license",
      spend_type: "card",
      amount_cents: seats,
      txn_count: card.txns,
    });
  }

  // Usage rows (API bucket) — one per usage day with non-zero billed cents.
  const usageRows: DailyRow[] = usage
    .filter((u) => u.charged_cents !== 0)
    .map((u) => ({
      day: u.day,
      vendor_label: USAGE_LABEL,
      vendor_normalized: CURSOR,
      bucket: "api" as const,
      spend_type: "card" as const,
      amount_cents: u.charged_cents,
      txn_count: 1,
    }));

  return { rows: [...rest, ...seatRows, ...usageRows], residualMonths };
}
