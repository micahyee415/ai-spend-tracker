// lib/aggregate.ts
// Plain English: Pure math helpers used by the dashboard to compute the
// numbers that show up in the stat cards.

import type { DailyRow } from "@/lib/db";

export function periodTotal(rows: DailyRow[], bucket?: "license" | "api"): number {
  return rows
    .filter((r) =>
      bucket
        ? r.bucket === bucket
        : r.bucket !== null && r.bucket !== "exclude"
    )
    .reduce((sum, r) => sum + r.amount_cents, 0);
}

export function annualizedRunRate(periodCents: number, periodDays: number): number {
  if (periodDays <= 0) return 0;
  return Math.round((periodCents / periodDays) * 365);
}

export interface Delta {
  percent: number | null;
  absolute: number;
}
export function deltaVs(current: number, comparison: number): Delta {
  const absolute = current - comparison;
  // Guard against zero AND negative comparison (e.g. net refunds in prior period).
  // A negative comparison flips the percent sign counter-intuitively, so we return null.
  if (comparison <= 0) return { percent: null, absolute };
  return { percent: Math.round((absolute / comparison) * 100), absolute };
}
