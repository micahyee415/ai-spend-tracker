"use client";
// components/VendorTable.tsx
// Plain English: Per-vendor breakdown table for one bucket (license or api).
// Aggregates DailyRow data into one row per normalized vendor showing
// This Period $, Last Period $, YTD $, a 30-day sparkline, and Last Txn date.
// Clicking a row toggles a drill-down that fetches individual Ramp transactions
// from /api/data/transactions and displays them in a nested table.

import { useState, Fragment, useMemo } from "react";
import type { DailyRow, TransactionDrillRow } from "@/lib/db";
import type { Range } from "@/lib/ranges";
import { subtractDays } from "@/lib/ranges";

interface Props {
  rows: DailyRow[];
  previousRows: DailyRow[];
  ytdRows: DailyRow[];
  range: Range;
  bucket: "license" | "api";
}

interface VendorAggregate {
  vendor_normalized: string;
  vendor_label: string;
  cents: number;
  lastDay: string | null;
}

function aggregateByVendor(rows: DailyRow[], bucket: "license" | "api"): Map<string, VendorAggregate> {
  const map = new Map<string, VendorAggregate>();
  for (const r of rows) {
    if (r.bucket !== bucket) continue;
    const existing = map.get(r.vendor_normalized);
    if (existing) {
      existing.cents += r.amount_cents;
      if (!existing.lastDay || r.day > existing.lastDay) existing.lastDay = r.day;
    } else {
      map.set(r.vendor_normalized, {
        vendor_normalized: r.vendor_normalized,
        vendor_label: r.vendor_label,
        cents: r.amount_cents,
        lastDay: r.day,
      });
    }
  }
  return map;
}

function buildVendorDayMap(
  rows: DailyRow[],
  bucket: "license" | "api"
): Map<string, Map<string, number>> {
  // Pre-bucket rows by vendor → day → cents in a single pass so the sparkline
  // build is O(rows) instead of O(rows × days × vendors).
  const m = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (r.bucket !== bucket) continue;
    let inner = m.get(r.vendor_normalized);
    if (!inner) {
      inner = new Map();
      m.set(r.vendor_normalized, inner);
    }
    inner.set(r.day, (inner.get(r.day) ?? 0) + r.amount_cents);
  }
  return m;
}

function sparklineFor(
  vendorDayMap: Map<string, number> | undefined,
  endDate: string,
  days = 30
): number[] {
  // Pacific-TZ-safe: walks back from range.endDate using subtractDays (UTC-based, DST-immune).
  const out: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = subtractDays(endDate, i);
    out.push(vendorDayMap?.get(d) ?? 0);
  }
  return out;
}

function Sparkline({ values }: { values: number[] }) {
  const blocks = "▁▂▃▄▅▆▇█";
  const max = Math.max(...values, 1);
  return (
    <span className="font-mono text-xs text-blue-600 dark:text-blue-400" title="last 30d">
      {values
        .map((v) => {
          if (v <= 0) return blocks[0];
          const idx = Math.min(blocks.length - 1, Math.floor((v / max) * (blocks.length - 1)));
          return blocks[idx];
        })
        .join("")}
    </span>
  );
}

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

interface VendorRow {
  vendor_normalized: string;
  vendor_label: string;
  thisPeriod: number;
  lastPeriod: number;
  ytd: number;
  lastDay: string | null;
  trend: number[];
}

export default function VendorTable({ rows, previousRows, ytdRows, range, bucket }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drillRows, setDrillRows] = useState<Record<string, TransactionDrillRow[]>>({});
  const [loadingVendor, setLoadingVendor] = useState<string | null>(null);

  const vendorRows: VendorRow[] = useMemo(() => {
    const thisMap = aggregateByVendor(rows, bucket);
    const prevMap = aggregateByVendor(previousRows, bucket);
    const ytdMap = aggregateByVendor(ytdRows, bucket);
    const vendorDayMap = buildVendorDayMap(rows, bucket);

    // Use the union of vendors across periods, with primary set = this period.
    const keys = new Set<string>([...thisMap.keys(), ...prevMap.keys(), ...ytdMap.keys()]);
    const out: VendorRow[] = [];
    for (const key of keys) {
      const t = thisMap.get(key);
      const p = prevMap.get(key);
      const y = ytdMap.get(key);
      out.push({
        vendor_normalized: key,
        vendor_label: t?.vendor_label ?? p?.vendor_label ?? y?.vendor_label ?? key,
        thisPeriod: t?.cents ?? 0,
        lastPeriod: p?.cents ?? 0,
        ytd: y?.cents ?? 0,
        lastDay: t?.lastDay ?? null,
        trend: sparklineFor(vendorDayMap.get(key), range.endDate),
      });
    }
    // Drop YTD-only rows: only show vendors with activity in this OR last period.
    // A vendor that had spend last period but disappeared this period still shows.
    return out
      .filter((v) => v.thisPeriod > 0 || v.lastPeriod > 0)
      .sort((a, b) => b.thisPeriod - a.thisPeriod);
  }, [rows, previousRows, ytdRows, bucket, range.endDate]);

  async function drill(vendor: string) {
    if (expanded === vendor) {
      setExpanded(null);
      return;
    }
    setExpanded(vendor);
    if (!drillRows[vendor]) {
      setLoadingVendor(vendor);
      const params = new URLSearchParams({
        vendor,
        startDate: range.startDate,
        endDate: range.endDate,
        bucket,
      });
      try {
        const res = await fetch(`/api/data/transactions?${params}`);
        if (!res.ok) {
          setDrillRows((m) => ({ ...m, [vendor]: [] }));
          return;
        }
        const body = (await res.json()) as { rows: TransactionDrillRow[] };
        setDrillRows((m) => ({ ...m, [vendor]: body.rows }));
      } catch {
        setDrillRows((m) => ({ ...m, [vendor]: [] }));
      } finally {
        setLoadingVendor((cur) => (cur === vendor ? null : cur));
      }
    }
  }

  if (vendorRows.length === 0) {
    return (
      <div className="text-gray-500 dark:text-gray-400 text-sm p-4 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
        No {bucket} vendor data in this range.
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-900 text-xs uppercase text-gray-500 dark:text-gray-400">
          <tr>
            <th className="text-left px-3 py-2">Vendor</th>
            <th className="text-right px-3 py-2">This Period</th>
            <th className="text-right px-3 py-2">Last Period</th>
            <th className="text-right px-3 py-2">YTD</th>
            <th className="text-left px-3 py-2">Last 30d</th>
            <th className="text-right px-3 py-2">Last Txn</th>
          </tr>
        </thead>
        <tbody>
          {vendorRows.map((v) => (
            <Fragment key={v.vendor_normalized}>
              <tr
                className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer text-gray-900 dark:text-gray-100"
                onClick={() => drill(v.vendor_normalized)}
              >
                <td className="px-3 py-2 font-medium">
                  <span className="mr-1 text-gray-400 dark:text-gray-500">
                    {expanded === v.vendor_normalized ? "▾" : "▸"}
                  </span>
                  {v.vendor_label}
                </td>
                <td className="px-3 py-2 text-right">{dollars(v.thisPeriod)}</td>
                <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">{dollars(v.lastPeriod)}</td>
                <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">{dollars(v.ytd)}</td>
                <td className="px-3 py-2">
                  <Sparkline values={v.trend} />
                </td>
                <td className="px-3 py-2 text-right text-gray-500 dark:text-gray-400 text-xs">{v.lastDay ?? "—"}</td>
              </tr>
              {expanded === v.vendor_normalized && (
                <tr className="bg-gray-50 dark:bg-gray-900">
                  <td colSpan={6} className="px-3 py-2">
                    {loadingVendor === v.vendor_normalized && !drillRows[v.vendor_normalized] ? (
                      <div className="text-xs text-gray-500 dark:text-gray-400 italic">Loading transactions…</div>
                    ) : drillRows[v.vendor_normalized] && drillRows[v.vendor_normalized].length > 0 ? (
                      <>
                        <table className="w-full text-xs">
                          <thead className="text-gray-500 dark:text-gray-400 uppercase">
                            <tr>
                              <th className="text-left px-2 py-1">Date</th>
                              <th className="text-right px-2 py-1">Amount</th>
                              <th className="text-left px-2 py-1">User</th>
                              <th className="text-left px-2 py-1">Card</th>
                              <th className="text-left px-2 py-1">Memo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {drillRows[v.vendor_normalized].map((t) => (
                              <tr key={t.id} className="border-t border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100">
                                <td className="px-2 py-1">{t.occurred_at.slice(0, 10)}</td>
                                <td className="px-2 py-1 text-right">{dollars(t.amount_cents)}</td>
                                <td className="px-2 py-1 text-gray-600 dark:text-gray-300">{t.user_email ?? "—"}</td>
                                <td className="px-2 py-1 text-gray-600 dark:text-gray-300 font-mono">{t.card_name ?? "—"}</td>
                                <td className="px-2 py-1 text-gray-600 dark:text-gray-300 truncate max-w-xs">
                                  {t.memo ?? "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {drillRows[v.vendor_normalized].length === 500 && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 italic mt-1">
                            Showing first 500 transactions — older results truncated.
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-xs text-gray-500 dark:text-gray-400 italic">No transactions found.</div>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
