import { describe, it, expect } from "vitest";
import { rangeFor, parseRangeLabel } from "@/lib/ranges";

describe("parseRangeLabel", () => {
  it("accepts a valid label", () => {
    expect(parseRangeLabel("90d")).toBe("90d");
  });
  it("defaults to 30d on invalid input", () => {
    expect(parseRangeLabel("foo")).toBe("30d");
  });
  it("defaults to 30d on null/undefined", () => {
    expect(parseRangeLabel(null)).toBe("30d");
    expect(parseRangeLabel(undefined)).toBe("30d");
  });
});

describe("rangeFor", () => {
  const today = new Date("2026-05-18T12:00:00-07:00");

  it("1d returns today as both start and end", () => {
    const r = rangeFor("1d", today);
    expect(r.startDate).toBe("2026-05-18");
    expect(r.endDate).toBe("2026-05-18");
    expect(r.days).toBe(1);
  });

  it("30d ends today, starts 29 days back (inclusive)", () => {
    const r = rangeFor("30d", today);
    expect(r.startDate).toBe("2026-04-19");
    expect(r.endDate).toBe("2026-05-18");
  });

  it("YTD starts Jan 1", () => {
    const r = rangeFor("YTD", today);
    expect(r.startDate).toBe("2026-01-01");
    expect(r.endDate).toBe("2026-05-18");
  });

  it("12mo starts 365 days back", () => {
    const r = rangeFor("12mo", today);
    expect(r.startDate).toBe("2025-05-18");
    expect(r.endDate).toBe("2026-05-18");
  });

  it("30d is DST-safe when today is midnight Pacific (March)", () => {
    // 2026-03-09T07:30Z = 2026-03-09 00:30 PDT (just past spring-forward)
    const today = new Date("2026-03-09T07:30:00Z");
    const r = rangeFor("30d", today);
    expect(r.endDate).toBe("2026-03-09");
    expect(r.startDate).toBe("2026-02-08");
  });

  it("90d is DST-safe across spring-forward", () => {
    const today = new Date("2026-05-18T07:30:00Z");
    const r = rangeFor("90d", today);
    expect(r.endDate).toBe("2026-05-18");
    // 89 days back from 2026-05-18 = 2026-02-18 (90d window inclusive).
    // The spec suggested 2026-02-17 but that miscounts by 1; calendar math: May has 18 days,
    // Apr 30, Mar 31, Feb 11 -> 18+30+31+11 = 90, landing start on Feb 18.
    expect(r.startDate).toBe("2026-02-18");
  });

  it("YTD on Jan 1 returns 1 day", () => {
    const today = new Date("2026-01-01T20:00:00Z");
    const r = rangeFor("YTD", today);
    expect(r.startDate).toBe("2026-01-01");
    expect(r.endDate).toBe("2026-01-01");
    expect(r.days).toBe(1);
  });

  it("24mo spans across leap day correctly", () => {
    const today = new Date("2026-03-01T20:00:00Z");
    const r = rangeFor("24mo", today);
    expect(r.endDate).toBe("2026-03-01");
    // 730 days back from 2026-03-01: 2025 (365) + 2024 Mar-Dec excludes Feb 29 → exactly
    // 730 days lands on 2024-03-01 (NOT 2024-03-02 as the spec suggested — calendar math:
    // 2025-03-01 → 2026-03-01 = 365, 2024-03-01 → 2025-03-01 = 365; total 730).
    expect(r.startDate).toBe("2024-03-01");
  });
});
