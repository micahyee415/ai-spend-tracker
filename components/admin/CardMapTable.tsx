// components/admin/CardMapTable.tsx
// Plain English: Client Component — renders the Card Map table with per-row
// inline label edit + bucket select. Rows with no classification (unmapped=true)
// are highlighted in blue and sorted to the top by the server query.
// A Save button appears only when the row has unsaved changes.

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchInput } from "./SearchInput";
import { BucketSelect } from "./BucketSelect";
import { AuditBadge } from "./AuditBadge";
import type { Bucket } from "@/lib/classify";

export interface CardRow {
  card_id: string;
  label: string;
  bucket: Bucket | null;
  updated_at: string | null;
  txn_count: number;
  last_four: string;
  unmapped: boolean;
  cardholder: string;        // full name from card_holder on transaction
  department: string;        // department from card_holder on transaction
  ramp_display_name: string; // display_name field from Ramp Cards API
}

interface Draft {
  label: string;
  bucket: Bucket;
}

export function CardMapTable({ initialRows }: { initialRows: CardRow[] }) {
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return initialRows;
    return initialRows.filter(r =>
      r.card_id.toLowerCase().includes(q) ||
      r.label.toLowerCase().includes(q) ||
      r.last_four.includes(q) ||
      r.cardholder.toLowerCase().includes(q)
    );
  }, [initialRows, query]);

  function defaultDraft(r: CardRow): Draft {
    return {
      label: r.label === "(unmapped)" ? `Card ••${r.last_four}` : r.label,
      bucket: (r.bucket ?? "license") as Bucket,
    };
  }

  function getDraft(r: CardRow): Draft {
    return drafts[r.card_id] ?? defaultDraft(r);
  }

  function setDraft(card_id: string, patch: Partial<Draft>) {
    const current = drafts[card_id] ?? defaultDraft(filtered.find(r => r.card_id === card_id)!);
    setDrafts(d => ({ ...d, [card_id]: { ...current, ...patch } }));
    setError(null);
  }

  function isDirty(r: CardRow): boolean {
    const d = drafts[r.card_id];
    if (!d) return false;
    return d.label !== r.label || d.bucket !== r.bucket;
  }

  async function save(r: CardRow) {
    const d = drafts[r.card_id];
    if (!d || !d.bucket) return;
    setError(null);
    const res = await fetch(`/api/admin/classifications/card/${encodeURIComponent(r.card_id)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: d.label, bucket: d.bucket }),
    });
    if (res.ok) {
      setDrafts(prev => {
        const next = { ...prev };
        delete next[r.card_id];
        return next;
      });
      router.refresh();
    } else {
      const b = await res.json();
      setError(b.error?.message ?? "Save failed");
    }
  }

  return (
    <div>
      <SearchInput onChange={setQuery} placeholder="Search card id, label, or last-4..." />

      {error && (
        <div className="mb-3 px-3 py-2 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded">
          {error}
        </div>
      )}

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
            <th className="px-3 py-2 font-medium">Last-4</th>
            <th className="px-3 py-2 font-medium">Cardholder</th>
            <th className="px-3 py-2 font-medium">Ramp name</th>
            <th className="px-3 py-2 font-medium">Label</th>
            <th className="px-3 py-2 font-medium">Bucket</th>
            <th className="px-3 py-2 font-medium text-right">Txns</th>
            <th className="px-3 py-2 font-medium">Last edited</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr>
              <td colSpan={8} className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                {initialRows.length === 0 ? "No cards yet." : "No matches."}
              </td>
            </tr>
          )}
          {filtered.map(r => {
            const draft = getDraft(r);
            const dirty = isDirty(r);
            return (
              <tr
                key={r.card_id}
                className={`border-b border-gray-200 dark:border-gray-700 ${
                  r.unmapped ? "bg-blue-50/40 dark:bg-blue-950/40" : ""
                }`}
              >
                <td className="px-3 py-2 font-mono text-gray-900 dark:text-gray-100">
                  ••{r.last_four}
                  {r.unmapped && (
                    <span className="ml-2 text-[10px] text-blue-700 dark:text-blue-300 uppercase">unmapped</span>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-900 dark:text-gray-100">
                  {r.cardholder || <span className="text-gray-400 dark:text-gray-500">—</span>}
                  {r.department && (
                    <div className="text-[10px] text-gray-500 dark:text-gray-400">{r.department}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                  {r.ramp_display_name || <span className="text-gray-400 dark:text-gray-500">—</span>}
                </td>
                <td className="px-3 py-2">
                  <input
                    value={draft.label}
                    onChange={e => setDraft(r.card_id, { label: e.target.value })}
                    className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded"
                  />
                </td>
                <td className="px-3 py-2">
                  <BucketSelect value={draft.bucket} onChange={b => setDraft(r.card_id, { bucket: b })} />
                </td>
                <td className="px-3 py-2 text-right text-gray-500 dark:text-gray-400">{r.txn_count}</td>
                <td className="px-3 py-2">
                  {r.updated_at && <AuditBadge actor={null} when={r.updated_at} />}
                </td>
                <td className="px-3 py-2 text-right">
                  {dirty && (
                    <button
                      onClick={() => save(r)}
                      className="px-2 py-1 text-xs font-semibold bg-blue-600 dark:bg-blue-500 text-white rounded"
                    >
                      Save
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
