"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchInput } from "./SearchInput";
import { BucketSelect } from "./BucketSelect";
import { ConfirmDialog } from "./ConfirmDialog";
import { AuditBadge } from "./AuditBadge";
import type { Bucket } from "@/lib/classify";

export interface OverrideRow {
  key: string;
  label: string;
  bucket: Bucket;
  updated_at: string;
}

interface Draft {
  label: string;
  bucket: Bucket;
}

export function OverridesTable({ initialRows }: { initialRows: OverrideRow[] }) {
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newBucket, setNewBucket] = useState<Bucket>("license");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return initialRows;
    return initialRows.filter(r =>
      r.key.toLowerCase().includes(q) ||
      r.label.toLowerCase().includes(q)
    );
  }, [initialRows, query]);

  function getDraft(r: OverrideRow): Draft {
    return drafts[r.key] ?? { label: r.label, bucket: r.bucket };
  }

  function setDraft(key: string, patch: Partial<Draft>) {
    const row = initialRows.find(r => r.key === key);
    const current = drafts[key] ?? { label: row?.label ?? "", bucket: row?.bucket ?? "license" };
    setDrafts(d => ({ ...d, [key]: { ...current, ...patch } }));
    setError(null);
  }

  function isDirty(r: OverrideRow): boolean {
    const d = drafts[r.key];
    if (!d) return false;
    return d.label !== r.label || d.bucket !== r.bucket;
  }

  async function save(r: OverrideRow) {
    const d = drafts[r.key];
    if (!d) return;
    setError(null);
    const res = await fetch(`/api/admin/classifications/vendor_override/${encodeURIComponent(r.key)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: d.label, bucket: d.bucket }),
    });
    if (res.ok) {
      setDrafts(prev => {
        const next = { ...prev };
        delete next[r.key];
        return next;
      });
      router.refresh();
    } else {
      const b = await res.json();
      setError(b.error?.message ?? "Save failed");
    }
  }

  async function remove(key: string) {
    setError(null);
    const res = await fetch(`/api/admin/classifications/vendor_override/${encodeURIComponent(key)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setPendingDelete(null);
      router.refresh();
    } else {
      const b = await res.json();
      setError(b.error?.message ?? "Delete failed");
      setPendingDelete(null);
    }
  }

  async function addNew() {
    setError(null);
    if (!newKey.trim() || !newLabel.trim()) {
      setError("Vendor and label required");
      return;
    }
    const res = await fetch(`/api/admin/classifications/vendor_override/${encodeURIComponent(newKey.trim().toLowerCase())}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: newLabel, bucket: newBucket }),
    });
    if (res.ok) {
      setAdding(false);
      setNewKey("");
      setNewLabel("");
      setNewBucket("license");
      router.refresh();
    } else {
      const b = await res.json();
      setError(b.error?.message ?? "Add failed");
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <SearchInput onChange={setQuery} placeholder="Search vendor..." />
        <button
          onClick={() => { setAdding(true); setError(null); }}
          className="px-3 py-1.5 text-xs font-semibold bg-blue-600 dark:bg-blue-500 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-400"
        >
          + Add override
        </button>
      </div>

      {adding && (
        <div className="flex gap-2 mb-3 p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded">
          <input
            placeholder="vendor_normalized (lowercase)"
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
            className="flex-1 px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded"
          />
          <input
            placeholder="Label"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            className="flex-1 px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded"
          />
          <BucketSelect value={newBucket} onChange={setNewBucket} />
          <button
            onClick={addNew}
            disabled={!newKey.trim() || !newLabel.trim()}
            className="px-3 py-1 text-xs font-semibold bg-blue-600 dark:bg-blue-500 text-white rounded disabled:opacity-50"
          >
            Save
          </button>
          <button
            onClick={() => { setAdding(false); setError(null); setNewKey(""); setNewLabel(""); setNewBucket("license"); }}
            className="px-3 py-1 text-xs border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded"
          >
            Cancel
          </button>
        </div>
      )}

      {error && (
        <div className="mb-3 px-3 py-2 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded">
          {error}
        </div>
      )}

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
            <th className="px-3 py-2 font-medium">Vendor</th>
            <th className="px-3 py-2 font-medium">Label</th>
            <th className="px-3 py-2 font-medium">Bucket</th>
            <th className="px-3 py-2 font-medium">Last edited</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                {initialRows.length === 0 ? "No vendor overrides yet." : "No matches."}
              </td>
            </tr>
          )}
          {filtered.map(r => {
            const draft = getDraft(r);
            const dirty = isDirty(r);
            return (
              <tr key={r.key} className="border-b border-gray-200 dark:border-gray-700">
                <td className="px-3 py-2 font-mono text-gray-900 dark:text-gray-100">{r.key}</td>
                <td className="px-3 py-2">
                  <input
                    value={draft.label}
                    onChange={e => setDraft(r.key, { label: e.target.value })}
                    className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded"
                  />
                </td>
                <td className="px-3 py-2">
                  <BucketSelect value={draft.bucket} onChange={b => setDraft(r.key, { bucket: b })} />
                </td>
                <td className="px-3 py-2">
                  <AuditBadge actor={null} when={r.updated_at} />
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex gap-2 justify-end">
                    {dirty && (
                      <button
                        onClick={() => save(r)}
                        className="px-2 py-1 text-xs font-semibold bg-blue-600 dark:bg-blue-500 text-white rounded"
                      >
                        Save
                      </button>
                    )}
                    <button
                      onClick={() => setPendingDelete(r.key)}
                      className="text-xs text-red-600 dark:text-red-400 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {pendingDelete && (
        <ConfirmDialog
          title="Remove override?"
          body={`Bucket for "${pendingDelete}" will fall back to card map.`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => remove(pendingDelete)}
        />
      )}
    </div>
  );
}
