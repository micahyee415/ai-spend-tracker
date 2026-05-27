// components/admin/VendorDrawer.tsx
// Plain English: Right-side drawer that opens when a suggestion row is selected.
// Fetches the vendor's recent transactions from the drawer endpoint and renders them
// as a per-row table showing: date | card ••last-4 | card label | amount.
// Also provides a label editor, "Add to allowlist" (promote) and "Dismiss" buttons.
// Card last-4 + label + amount + date are shown PER ROW — not as aggregated sections.

"use client";

import { useEffect, useState } from "react";

interface DrawerTxn {
  id: string;
  occurred_at: string;
  amount_cents: string; // BIGINT-as-string from pg
  memo: string | null;
  card_id: string | null;
  card_label: string;
  card_last_four: string;
}

interface Props {
  vendor: string;
  aggregate: { lifetime_cents: number; txn_count: number };
  onClose: () => void;
  onCommitted: () => void;
}

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function VendorDrawer({ vendor, aggregate, onClose, onCommitted }: Props) {
  const [txns, setTxns] = useState<DrawerTxn[] | null>(null);
  const [label, setLabel] = useState(vendor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reload transactions and reset form whenever the selected vendor changes
  useEffect(() => {
    setLabel(vendor);
    setTxns(null);
    setError(null);
    fetch(
      `/api/admin/suggestions/${encodeURIComponent(vendor)}/transactions`
    )
      .then((r) => r.json())
      .then((b) => setTxns(b.rows ?? []))
      .catch(() => setTxns([]));
  }, [vendor]);

  async function promote() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/suggestions/${encodeURIComponent(vendor)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ label }),
        }
      );
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error?.message ?? "Promote failed");
      }
      onCommitted();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Promote failed");
    } finally {
      setBusy(false);
    }
  }

  async function dismiss() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/suggestions/${encodeURIComponent(vendor)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error?.message ?? "Dismiss failed");
      }
      onCommitted();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Dismiss failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="w-80 border-l border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900 flex flex-col gap-3">
      {/* Header */}
      <div className="flex justify-between items-baseline">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {vendor}
        </h2>
        <button
          onClick={onClose}
          className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-lg leading-none"
          aria-label="Close drawer"
        >
          ✕
        </button>
      </div>

      {/* Aggregate summary */}
      <div className="text-xs text-gray-500 dark:text-gray-400">
        {aggregate.txn_count} txns • {dollars(aggregate.lifetime_cents)} lifetime
      </div>

      {/* Per-row card attribution table */}
      <div>
        <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
          Recent transactions
        </div>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
              <th className="pb-1 text-left font-medium">Date</th>
              <th className="pb-1 text-left font-medium">Card</th>
              <th className="pb-1 text-left font-medium">Label</th>
              <th className="pb-1 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {txns === null && (
              <tr>
                <td
                  colSpan={4}
                  className="py-2 text-center text-gray-500 dark:text-gray-400"
                >
                  Loading…
                </td>
              </tr>
            )}
            {txns?.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="py-2 text-center text-gray-500 dark:text-gray-400"
                >
                  No transactions found.
                </td>
              </tr>
            )}
            {txns?.map((t) => (
              <tr
                key={t.id}
                className="border-b border-gray-200 dark:border-gray-700"
              >
                {/* Date */}
                <td className="py-1 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  {new Date(t.occurred_at).toLocaleDateString()}
                </td>
                {/* Card last-4 */}
                <td className="py-1 font-mono text-gray-700 dark:text-gray-300">
                  ••{t.card_last_four}
                </td>
                {/* Card label */}
                <td
                  className="py-1 text-gray-500 dark:text-gray-400 truncate max-w-[100px]"
                  title={t.card_label}
                >
                  {t.card_label}
                </td>
                {/* Amount */}
                <td className="py-1 text-right text-gray-900 dark:text-gray-100">
                  {dollars(Number(t.amount_cents))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Label editor */}
      <div>
        <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
          Label
        </div>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Error message */}
      {error && (
        <div className="text-xs text-red-600 dark:text-red-400">{error}</div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 mt-auto">
        <button
          onClick={promote}
          disabled={busy || !label.trim()}
          className="flex-1 px-3 py-2 text-xs font-semibold bg-blue-600 dark:bg-blue-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 dark:hover:bg-blue-400 transition-colors"
        >
          {busy ? "…" : "Add to allowlist"}
        </button>
        <button
          onClick={dismiss}
          disabled={busy}
          className="flex-1 px-3 py-2 text-xs border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </aside>
  );
}
