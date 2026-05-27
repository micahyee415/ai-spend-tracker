import { describe, it, expect } from "vitest";
import { annualizedRunRate, periodTotal, deltaVs } from "@/lib/aggregate";
import type { DailyRow } from "@/lib/db";

const rows: DailyRow[] = [
  { day: "2026-05-01", vendor_label: "OpenAI", vendor_normalized: "openai", bucket: "license", spend_type: "card", amount_cents: 10000, txn_count: 1 },
  { day: "2026-05-02", vendor_label: "OpenAI", vendor_normalized: "openai", bucket: "license", spend_type: "card", amount_cents: 20000, txn_count: 1 },
  { day: "2026-05-03", vendor_label: "Anthropic", vendor_normalized: "anthropic", bucket: "api", spend_type: "card", amount_cents: 30000, txn_count: 1 },
];

describe("aggregations", () => {
  it("periodTotal sums by bucket", () => {
    expect(periodTotal(rows, "license")).toBe(30000);
    expect(periodTotal(rows, "api")).toBe(30000);
    expect(periodTotal(rows)).toBe(60000);
  });

  it("annualizedRunRate scales correctly", () => {
    expect(annualizedRunRate(30000, 30)).toBe(Math.round(30000 / 30 * 365));
  });

  it("deltaVs returns percent and absolute", () => {
    const d = deltaVs(120, 100);
    expect(d.percent).toBe(20);
    expect(d.absolute).toBe(20);
  });

  it("deltaVs handles divide-by-zero", () => {
    expect(deltaVs(50, 0).percent).toBeNull();
  });

  it("deltaVs returns null percent for negative comparison", () => {
    const d = deltaVs(50, -100);
    expect(d.percent).toBeNull();
    expect(d.absolute).toBe(150);
  });

  it("periodTotal excludes null-bucket rows when total requested", () => {
    const mixed: DailyRow[] = [
      ...rows,
      { day: "2026-05-04", vendor_label: "X", vendor_normalized: "x", bucket: null, spend_type: "card", amount_cents: 99999, txn_count: 1 },
    ];
    expect(periodTotal(mixed)).toBe(60000);  // null-bucket row excluded
  });

  it("periodTotal returns 0 for empty rows", () => {
    expect(periodTotal([])).toBe(0);
    expect(periodTotal([], "license")).toBe(0);
  });

  it("periodTotal handles negative amount_cents (refunds)", () => {
    const withRefund: DailyRow[] = [
      ...rows,
      { day: "2026-05-04", vendor_label: "OpenAI", vendor_normalized: "openai", bucket: "license", spend_type: "card", amount_cents: -5000, txn_count: 1 },
    ];
    expect(periodTotal(withRefund, "license")).toBe(25000);  // 30000 - 5000
  });
});
