// components/admin/SuggestionsTable.tsx
// Plain English: Client Component — renders the suggestions queue as a table.
// Clicking a row opens the VendorDrawer on the right showing per-row card attribution
// (card last-4 + label + amount + date) for that vendor's recent transactions.
// After promote/dismiss the drawer calls onCommitted(), which closes it and refreshes
// the page so the acted-on row disappears from the queue.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VendorDrawer } from "./VendorDrawer";

interface Row {
  vendor_normalized: string;
  lifetime_total_cents: string;
  txn_count: number;
  last_seen: string;
}

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function SuggestionsTable({ initialRows }: { initialRows: Row[] }) {
  const [selected, setSelected] = useState<Row | null>(null);
  const router = useRouter();

  if (initialRows.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
        Queue empty. Nice work.
      </div>
    );
  }

  return (
    <div className="flex gap-0">
      {/* Left — vendor table */}
      <table className="flex-1 text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
            <th className="px-3 py-2 font-medium">Vendor</th>
            <th className="px-3 py-2 font-medium text-right">Lifetime</th>
            <th className="px-3 py-2 font-medium text-right">Txns</th>
            <th className="px-3 py-2 font-medium">Last seen</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {initialRows.map((r) => {
            const isActive =
              selected?.vendor_normalized === r.vendor_normalized;
            return (
              <tr
                key={r.vendor_normalized}
                onClick={() => setSelected(r)}
                className={
                  "cursor-pointer border-b border-gray-200 dark:border-gray-700 " +
                  (isActive
                    ? "bg-blue-50 dark:bg-blue-950"
                    : "hover:bg-gray-50 dark:hover:bg-gray-800")
                }
              >
                <td className="px-3 py-2 text-gray-900 dark:text-gray-100">
                  {r.vendor_normalized}
                </td>
                <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">
                  {dollars(Number(r.lifetime_total_cents))}
                </td>
                <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">
                  {r.txn_count}
                </td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">
                  {new Date(r.last_seen).toLocaleDateString()}
                </td>
                <td className="px-3 py-2 text-gray-400 dark:text-gray-500">▸</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Right — drawer (mounts when a row is selected) */}
      {selected && (
        <VendorDrawer
          vendor={selected.vendor_normalized}
          aggregate={{
            lifetime_cents: Number(selected.lifetime_total_cents),
            txn_count: selected.txn_count,
          }}
          onClose={() => setSelected(null)}
          onCommitted={() => {
            setSelected(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
