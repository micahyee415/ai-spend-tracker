"use client";
import type { DailyRow } from "@/lib/db";
import { periodTotal, annualizedRunRate, deltaVs } from "@/lib/aggregate";
import type { Range } from "@/lib/ranges";

interface Props {
  rows: DailyRow[];
  previousRows?: DailyRow[];
  yearAgoRows?: DailyRow[] | null;
  range: Range;
  bucket?: "license" | "api";
  title?: string;
}

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export default function StatCards({ rows, previousRows, yearAgoRows, range, bucket, title }: Props) {
  const total = periodTotal(rows, bucket);
  const runRate = annualizedRunRate(total, range.days);
  const prev = previousRows ? periodTotal(previousRows, bucket) : null;
  const yoy = yearAgoRows ? periodTotal(yearAgoRows, bucket) : null;
  const dPrev = prev !== null ? deltaVs(total, prev) : null;
  const dYoY = yoy !== null && yoy > 0 ? deltaVs(total, yoy) : null;

  return (
    <div className="grid grid-cols-2 gap-3">
      {title && <h2 className="col-span-2 text-lg font-semibold">{title}</h2>}
      <Card label={`Total (${range.label})`} value={dollars(total)} />
      <Card label={`Run rate (${range.label} avg)`} value={`${dollars(runRate)}/yr`} />
      <Card label="vs Last Period" value={dPrev && dPrev.percent !== null ? `${dPrev.percent > 0 ? "+" : ""}${dPrev.percent}%` : "—"} sub={dPrev !== null ? `${dPrev.absolute >= 0 ? "+" : ""}${dollars(dPrev.absolute)}` : ""} />
      <Card
        label="vs Last Year"
        value={dYoY && dYoY.percent !== null ? `${dYoY.percent > 0 ? "+" : ""}${dYoY.percent}%` : "—"}
        sub={
          dYoY !== null
            ? `${dYoY.absolute >= 0 ? "+" : ""}${dollars(dYoY.absolute)}`
            : yoy === 0
            ? "no comparison"
            : "insufficient history"
        }
      />
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <div className="text-xs uppercase text-gray-500 dark:text-gray-400">{label}<sup>*</sup></div>
      <div className="text-2xl font-bold mt-1 text-gray-900 dark:text-gray-100">{value}</div>
      {sub && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}
