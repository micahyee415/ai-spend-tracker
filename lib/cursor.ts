// lib/cursor.ts
// Cursor Admin API client. Auth is Basic with the API key as the username
// (header: "Basic base64(API_KEY + ':')"). Pulls billed usage events and sums
// chargedCents (the billable overage that ties to the invoice — NOT
// overallSpendCents, which includes the seat-bundled allotment).
// Mirrors lib/ramp.ts: 429 backoff with three retries.

const CURSOR_BASE = "https://api.cursor.com";

export interface CursorClientOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
}

interface CursorUsageEvent {
  timestamp: string | number; // epoch ms
  chargedCents?: number;
}
interface FilteredUsageResponse {
  usageEvents?: CursorUsageEvent[];
  totalUsageEventsCount?: number;
}

export interface UsageForRange {
  chargedCents: number;
  eventCount: number;
  byDay: Map<string, { cents: number; count: number }>;
}

function pacificDay(ms: number): string {
  // YYYY-MM-DD in America/Los_Angeles (matches lib/ranges.ts day bucketing).
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

export class CursorClient {
  private readonly authHeader: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: CursorClientOptions) {
    this.authHeader = "Basic " + Buffer.from(`${opts.apiKey}:`).toString("base64");
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const delays = [5_000, 30_000, 120_000];
    let attempt = 0;
    while (true) {
      const res = await this.fetchImpl(`${CURSOR_BASE}${path}`, {
        method: "POST",
        headers: { Authorization: this.authHeader, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 429 && attempt < delays.length) {
        await new Promise((r) => setTimeout(r, delays[attempt++]));
        continue;
      }
      if (!res.ok) {
        const errBody = (await res.text()).slice(0, 200);
        throw new Error(`Cursor ${path} failed: ${res.status} ${errBody}`);
      }
      return (await res.json()) as T;
    }
  }

  // Pull all billed usage events in [startMs, endMs], summing chargedCents and
  // bucketing by Pacific day. Pages until collected >= total or a page is empty.
  async usageForRange(startMs: number, endMs: number): Promise<UsageForRange> {
    const pageSize = 1000;
    let page = 1;
    let collected = 0;
    let total = Infinity;
    const byDay = new Map<string, { cents: number; count: number }>();
    let chargedCents = 0;
    let eventCount = 0;

    while (collected < total) {
      const body: FilteredUsageResponse = await this.post("/teams/filtered-usage-events", {
        startDate: startMs,
        endDate: endMs,
        page,
        pageSize,
      });
      const events = body.usageEvents ?? [];
      if (typeof body.totalUsageEventsCount === "number") total = body.totalUsageEventsCount;
      if (events.length === 0) break;

      for (const e of events) {
        const cents = typeof e.chargedCents === "number" ? e.chargedCents : 0;
        const day = pacificDay(Number(e.timestamp));
        const cur = byDay.get(day) ?? { cents: 0, count: 0 };
        cur.cents += cents;
        cur.count += 1;
        byDay.set(day, cur);
        eventCount += 1;
      }

      collected += events.length;
      page++;
      // If the API doesn't report a total, stop on a short (last) page.
      if (total === Infinity && events.length < pageSize) break;
    }

    // Cursor returns chargedCents as fractional cents (sub-cent per token event).
    // Round each day's total to integer cents for BIGINT storage; the grand total
    // is the sum of the rounded days so it matches what gets persisted.
    for (const [, v] of byDay) {
      v.cents = Math.round(v.cents);
      chargedCents += v.cents;
    }

    return { chargedCents, eventCount, byDay };
  }
}
