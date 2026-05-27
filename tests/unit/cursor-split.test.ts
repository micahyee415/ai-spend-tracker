import { describe, it, expect } from "vitest";
import { applyCursorSplit } from "@/lib/cursor-split";
import type { DailyRow } from "@/lib/db";

function cursorCard(day: string, cents: number): DailyRow {
  return {
    day, vendor_label: "Cursor seats", vendor_normalized: "cursor",
    bucket: "license", spend_type: "card", amount_cents: cents, txn_count: 1,
  };
}
function otherRow(): DailyRow {
  return {
    day: "2026-03-10", vendor_label: "Anthropic", vendor_normalized: "anthropic",
    bucket: "license", spend_type: "card", amount_cents: 5000, txn_count: 1,
  };
}

describe("applyCursorSplit", () => {
  it("nets usage out of seats and adds an API usage line (same month)", () => {
    const rows = [otherRow(), cursorCard("2026-03-15", 10000)];
    const usage = [{ day: "2026-03-05", charged_cents: 6000 }];
    const { rows: out } = applyCursorSplit(rows, usage);

    const seats = out.filter((r) => r.vendor_normalized === "cursor" && r.bucket === "license");
    const api = out.filter((r) => r.vendor_normalized === "cursor" && r.bucket === "api");
    const seatTotal = seats.reduce((s, r) => s + r.amount_cents, 0);
    const apiTotal = api.reduce((s, r) => s + r.amount_cents, 0);

    expect(seatTotal).toBe(4000);            // 10000 card - 6000 usage
    expect(apiTotal).toBe(6000);             // usage
    expect(api[0].vendor_label).toBe("Cursor (token usage)");
    expect(seatTotal + apiTotal).toBe(10000); // reconciles to card
    // non-cursor rows untouched
    expect(out.find((r) => r.vendor_normalized === "anthropic")?.amount_cents).toBe(5000);
  });

  it("degrades gracefully when no usage exists (seats = full card)", () => {
    const { rows: out } = applyCursorSplit([cursorCard("2026-03-15", 10000)], []);
    const seatTotal = out.filter((r) => r.bucket === "license" && r.vendor_normalized === "cursor")
      .reduce((s, r) => s + r.amount_cents, 0);
    const api = out.filter((r) => r.bucket === "api" && r.vendor_normalized === "cursor");
    expect(seatTotal).toBe(10000);
    expect(api.length).toBe(0);
  });

  it("nets per calendar month, not globally", () => {
    const rows = [cursorCard("2026-02-15", 10000), cursorCard("2026-03-15", 10000)];
    const usage = [
      { day: "2026-02-10", charged_cents: 2000 },
      { day: "2026-03-10", charged_cents: 9000 },
    ];
    const { rows: out } = applyCursorSplit(rows, usage);
    const seatTotal = out.filter((r) => r.bucket === "license" && r.vendor_normalized === "cursor")
      .reduce((s, r) => s + r.amount_cents, 0);
    // Feb: 10000-2000=8000 ; Mar: 10000-9000=1000 ; total 9000
    expect(seatTotal).toBe(9000);
  });

  it("floors seats at 0 and flags residual when usage exceeds card in a month", () => {
    const rows = [cursorCard("2026-03-15", 5000)];
    const usage = [{ day: "2026-03-10", charged_cents: 8000 }];
    const { rows: out, residualMonths } = applyCursorSplit(rows, usage);
    const seatTotal = out.filter((r) => r.bucket === "license" && r.vendor_normalized === "cursor")
      .reduce((s, r) => s + r.amount_cents, 0);
    expect(seatTotal).toBe(0);                 // floored, never negative
    expect(residualMonths).toContain("2026-03");
  });

  it("emits exactly one seat row per month with charges, dated the latest charge day", () => {
    const rows = [cursorCard("2026-03-05", 4000), cursorCard("2026-03-20", 6000)];
    const { rows: out } = applyCursorSplit(rows, [{ day: "2026-03-10", charged_cents: 1000 }]);
    const seats = out.filter((r) => r.bucket === "license" && r.vendor_normalized === "cursor");
    expect(seats.length).toBe(1);
    expect(seats[0].amount_cents).toBe(9000);  // 10000 - 1000
    expect(seats[0].day).toBe("2026-03-20");   // latest charge day in the month
  });
});
