"use client";
import { useState } from "react";
import type { DailyRow } from "@/lib/db";

interface Props {
  rows: DailyRow[];
}

function dollars(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export default function NeedsClassification({ rows }: Props) {
  const [open, setOpen] = useState(false);
  const unbucketed = rows.filter((r) => r.bucket === null);
  if (unbucketed.length === 0) return null;

  const byVendor = new Map<string, { label: string; cents: number; txns: number }>();
  for (const r of unbucketed) {
    const cur = byVendor.get(r.vendor_normalized) ?? { label: r.vendor_label, cents: 0, txns: 0 };
    cur.cents += r.amount_cents;
    cur.txns += r.txn_count;
    byVendor.set(r.vendor_normalized, cur);
  }
  const sorted = Array.from(byVendor.entries()).sort((a, b) => b[1].cents - a[1].cents);
  const top = sorted.length <= 10 ? sorted : sorted.slice(0, 5);
  const total = unbucketed.reduce((s, r) => s + r.amount_cents, 0);
  const totalTxns = unbucketed.reduce((s, r) => s + r.txn_count, 0);

  return (
    <section className="border-t border-gray-200 dark:border-gray-700 pt-4 text-sm">
      <button onClick={() => setOpen(!open)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
        {open ? "▴" : "▾"} Needs classification: {totalTxns} transactions, {dollars(total)}
      </button>
      {open && (
        <div className="mt-2 ml-4 text-gray-600 dark:text-gray-300">
          <p className="mb-2">Top unclassified vendors in this range:</p>
          <ul className="list-disc ml-5">
            {top.map(([key, v]) => <li key={key}>{v.label} — {dollars(v.cents)} ({v.txns} txns)</li>)}
          </ul>
          <p className="mt-2 text-xs italic">IT can classify these in the <a href="/admin/suggestions" className="text-blue-600 dark:text-blue-400 hover:underline">admin panel</a>.</p>
        </div>
      )}
    </section>
  );
}
