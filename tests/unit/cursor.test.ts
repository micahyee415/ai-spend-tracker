import { describe, it, expect, vi } from "vitest";
import { CursorClient } from "@/lib/cursor";

// Build a fake fetch that returns paged usage events.
function mockFetch(pages: Array<{ usageEvents: unknown[]; totalUsageEventsCount: number }>) {
  let call = 0;
  return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    const body = pages[Math.min(call, pages.length - 1)];
    call++;
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  });
}

describe("CursorClient.usageForRange", () => {
  it("sends Basic auth with the api key as username", async () => {
    const fetchImpl = mockFetch([{ usageEvents: [], totalUsageEventsCount: 0 }]);
    const c = new CursorClient({ apiKey: "key_abc", fetchImpl });
    await c.usageForRange(0, 1);
    const [, init] = fetchImpl.mock.calls[0];
    const expected = "Basic " + Buffer.from("key_abc:").toString("base64");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: expected });
  });

  it("sums chargedCents and buckets by Pacific day across pages", async () => {
    // 2026-03-02T02:00:00Z = 2026-03-01 18:00 PT  -> day 2026-03-01
    // 2026-03-02T20:00:00Z = 2026-03-02 12:00 PT  -> day 2026-03-02
    const t1 = Date.parse("2026-03-02T02:00:00Z");
    const t2 = Date.parse("2026-03-02T20:00:00Z");
    const fetchImpl = mockFetch([
      { usageEvents: [{ timestamp: t1, chargedCents: 1500 }, { timestamp: t2, chargedCents: 500 }], totalUsageEventsCount: 3 },
      { usageEvents: [{ timestamp: t2, chargedCents: 1000 }], totalUsageEventsCount: 3 },
    ]);
    const c = new CursorClient({ apiKey: "k", fetchImpl });
    const res = await c.usageForRange(0, Date.now());
    expect(res.chargedCents).toBe(3000);
    expect(res.eventCount).toBe(3);
    expect(res.byDay.get("2026-03-01")?.cents).toBe(1500);
    expect(res.byDay.get("2026-03-02")?.cents).toBe(1500);
  });

  it("treats missing chargedCents as 0", async () => {
    const t = Date.parse("2026-03-02T20:00:00Z");
    const fetchImpl = mockFetch([{ usageEvents: [{ timestamp: t }], totalUsageEventsCount: 1 }]);
    const c = new CursorClient({ apiKey: "k", fetchImpl });
    const res = await c.usageForRange(0, Date.now());
    expect(res.chargedCents).toBe(0);
    expect(res.eventCount).toBe(1);
  });

  it("rounds fractional chargedCents to integer cents per day (Cursor bills sub-cent)", async () => {
    const t = Date.parse("2026-03-02T20:00:00Z"); // -> 2026-03-02 PT
    const fetchImpl = mockFetch([{
      usageEvents: [
        { timestamp: t, chargedCents: 1500.4 },
        { timestamp: t, chargedCents: 1500.4 },
      ],
      totalUsageEventsCount: 2,
    }]);
    const c = new CursorClient({ apiKey: "k", fetchImpl });
    const res = await c.usageForRange(0, Date.now());
    // 1500.4 + 1500.4 = 3000.8 -> rounded to integer cents
    expect(res.byDay.get("2026-03-02")?.cents).toBe(3001);
    expect(res.chargedCents).toBe(3001);
    expect(Number.isInteger(res.chargedCents)).toBe(true);
  });
});
