// lib/ranges.ts
// Plain English: Translates a UI range label (1d, 7d, 30d, 90d, YTD, 12mo, 24mo) into
// a concrete startDate / endDate pair (YYYY-MM-DD), both in Pacific time.
//
// DST-safety: All arithmetic is performed on the already-formatted Pacific
// YYYY-MM-DD string using UTC date math. Date-only values in UTC are DST-immune
// because UTC has no DST, so subtracting N days never silently drifts by 1 day
// when the source range crosses a US daylight-saving boundary.

export type RangeLabel = "1d" | "7d" | "30d" | "90d" | "YTD" | "12mo" | "24mo";

export interface Range {
  startDate: string;  // YYYY-MM-DD
  endDate: string;    // YYYY-MM-DD inclusive
  days: number;
  label: RangeLabel;
}

function fmt(d: Date): string {
  // Convert to Pacific and format as YYYY-MM-DD
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(d);
}

export function subtractDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  // Build a UTC date at midnight, then let UTC handle the subtraction.
  // UTC has no DST, so this is drift-free for date-only arithmetic.
  const dt = new Date(Date.UTC(y, m - 1, d - days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

const ALL_RANGES: readonly RangeLabel[] = ["1d", "7d", "30d", "90d", "YTD", "12mo", "24mo"] as const;

export function parseRangeLabel(input: string | null | undefined): RangeLabel {
  return (ALL_RANGES as readonly string[]).includes(input ?? "") ? (input as RangeLabel) : "30d";
}

export function rangeFor(label: RangeLabel, today: Date = new Date()): Range {
  const end = fmt(today);
  if (label === "YTD") {
    const year = parseInt(end.slice(0, 4), 10);
    const start = `${year}-01-01`;
    // days = inclusive day count from start to end (both Pacific date-only)
    const days = Math.floor((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
    return { startDate: start, endDate: end, days, label };
  }
  const daysBack = { "1d": 0, "7d": 6, "30d": 29, "90d": 89, "12mo": 365, "24mo": 730 }[label];
  const startDate = subtractDays(end, daysBack);
  return { startDate, endDate: end, days: daysBack + 1, label };
}

export function displayLabel(label: RangeLabel): string {
  switch (label) {
    case "1d": return "1 day";
    case "7d": return "7 days";
    case "30d": return "30 days";
    case "90d": return "90 days";
    case "YTD": return "YTD";
    case "12mo": return "1 year";
    case "24mo": return "2 years";
  }
}
