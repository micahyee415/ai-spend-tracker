// components/admin/AllowlistTable.tsx
// Plain English: Client Component — renders the allowlist as a searchable table.
// Clicking a label enters inline edit mode (label + optional min_amount_cents).
// The "+ Add vendor" button expands an inline form to add a new vendor to the allowlist.
// Delete shows a ConfirmDialog before calling the API. All mutations hit
// PUT/DELETE /api/admin/classifications/allowlist/[key] and refresh the page on success.

"use client";

import { useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { SearchInput } from "./SearchInput";
import { ConfirmDialog } from "./ConfirmDialog";
import { AuditBadge } from "./AuditBadge";

export interface AllowlistRow {
  key: string;
  label: string;
  override_bucket: "license" | "api" | "exclude" | null;
  min_amount_cents: string | null;
  updated_at: string;
  needs_classification: boolean;
}

export function AllowlistTable({
  initialRows,
  unclassifiedCount,
}: {
  initialRows: AllowlistRow[];
  unclassifiedCount: number;
}) {
  const [query, setQuery] = useState("");
  const [showOnlyNeeds, setShowOnlyNeeds] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftMin, setDraftMin] = useState<string>("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newMin, setNewMin] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const toggleNeedsFilter = useCallback(() => setShowOnlyNeeds(prev => !prev), []);

  const filtered = useMemo(() => {
    let rows = initialRows;
    if (showOnlyNeeds) rows = rows.filter(r => r.needs_classification);
    if (query) {
      const q = query.toLowerCase();
      rows = rows.filter(
        r =>
          r.key.toLowerCase().includes(q) ||
          r.label.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [initialRows, query, showOnlyNeeds]);

  async function save(key: string) {
    setError(null);
    const body: Record<string, unknown> = { label: draftLabel };
    if (draftMin.trim()) {
      if (!/^\d+$/.test(draftMin.trim())) {
        setError("min_amount_cents must be a non-negative integer");
        return;
      }
      body.min_amount_cents = parseInt(draftMin.trim(), 10);
    }
    const res = await fetch(`/api/admin/classifications/allowlist/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setEditing(null);
      router.refresh();
    } else {
      const b = await res.json();
      setError(b.error?.message ?? "Save failed");
    }
  }

  async function remove(key: string) {
    setError(null);
    const res = await fetch(`/api/admin/classifications/allowlist/${encodeURIComponent(key)}`, { method: "DELETE" });
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
    const body: Record<string, unknown> = { label: newLabel };
    if (newMin.trim()) {
      if (!/^\d+$/.test(newMin.trim())) {
        setError("min_amount_cents must be a non-negative integer");
        return;
      }
      body.min_amount_cents = parseInt(newMin.trim(), 10);
    }
    const res = await fetch(
      `/api/admin/classifications/allowlist/${encodeURIComponent(newKey.trim().toLowerCase())}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    if (res.ok) {
      setAdding(false);
      setNewKey("");
      setNewLabel("");
      setNewMin("");
      router.refresh();
    } else {
      const b = await res.json();
      setError(b.error?.message ?? "Add failed");
    }
  }

  return (
    <div>
      {unclassifiedCount > 0 && (
        <div className="mb-3 px-3 py-2 text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded flex justify-between items-center">
          <span>
            <strong>{unclassifiedCount}</strong>{" "}
            {unclassifiedCount === 1 ? "vendor needs" : "vendors need"} classification — at least one transaction uses an unmapped card and there&apos;s no vendor override.
          </span>
          <button
            onClick={toggleNeedsFilter}
            className="ml-4 shrink-0 text-amber-900 dark:text-amber-100 underline text-xs"
          >
            {showOnlyNeeds ? "Show all" : "Show only these"}
          </button>
        </div>
      )}

      <div className="flex justify-between items-center mb-3">
        <SearchInput onChange={setQuery} placeholder="Search vendor or label..." />
        <button
          onClick={() => { setAdding(true); setEditing(null); setError(null); }}
          className="px-3 py-1.5 text-xs font-semibold bg-blue-600 dark:bg-blue-500 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-400"
        >
          + Add vendor
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
          <input
            placeholder="min cents"
            value={newMin}
            onChange={e => setNewMin(e.target.value)}
            className="w-24 px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded"
          />
          <button
            onClick={addNew}
            disabled={!newKey.trim() || !newLabel.trim()}
            className="px-3 py-1 text-xs font-semibold bg-blue-600 dark:bg-blue-500 text-white rounded disabled:opacity-50"
          >
            Save
          </button>
          <button
            onClick={() => { setAdding(false); setError(null); setNewKey(""); setNewLabel(""); setNewMin(""); }}
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
            <th className="px-3 py-2 font-medium">Override bucket</th>
            <th className="px-3 py-2 font-medium text-right">Min cents</th>
            <th className="px-3 py-2 font-medium">Last edited</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr>
              <td colSpan={6} className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                {initialRows.length === 0 ? "No vendors on the allowlist yet." : "No matches."}
              </td>
            </tr>
          )}
          {filtered.map(r => (
            <tr key={r.key} className="border-b border-gray-200 dark:border-gray-700">
              <td className="px-3 py-2 text-gray-900 dark:text-gray-100 font-mono">
                {r.key}
                {r.needs_classification && (
                  <span className="ml-2 text-[10px] uppercase text-amber-700 dark:text-amber-300">
                    needs classification
                  </span>
                )}
              </td>
              <td className="px-3 py-2">
                {editing === r.key ? (
                  <div className="flex gap-2">
                    <input
                      value={draftLabel}
                      onChange={e => setDraftLabel(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && save(r.key)}
                      autoFocus
                      className="flex-1 px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded"
                    />
                    <input
                      value={draftMin}
                      onChange={e => setDraftMin(e.target.value)}
                      placeholder="min cents"
                      onKeyDown={e => e.key === "Enter" && save(r.key)}
                      className="w-24 px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded"
                    />
                    <button
                      onClick={() => save(r.key)}
                      className="px-2 py-1 text-xs bg-blue-600 dark:bg-blue-500 text-white rounded"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => { setEditing(null); setError(null); }}
                      className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setEditing(r.key);
                      setDraftLabel(r.label);
                      setDraftMin(r.min_amount_cents ?? "");
                      setError(null);
                    }}
                    onKeyDown={e => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setEditing(r.key);
                        setDraftLabel(r.label);
                        setDraftMin(r.min_amount_cents ?? "");
                        setError(null);
                      }
                    }}
                    className="cursor-pointer text-gray-900 dark:text-gray-100 hover:underline"
                  >
                    {r.label}
                  </span>
                )}
              </td>
              <td className={`px-3 py-2 ${r.override_bucket ? "text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-400"}`}>
                {r.override_bucket ?? "(via card map)"}
              </td>
              <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">
                {r.min_amount_cents ?? "—"}
              </td>
              <td className="px-3 py-2">
                <AuditBadge actor={null} when={r.updated_at} />
              </td>
              <td className="px-3 py-2 text-right">
                <button
                  onClick={() => setPendingDelete(r.key)}
                  className="text-xs text-red-600 dark:text-red-400 hover:underline"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {pendingDelete && (
        <ConfirmDialog
          title="Remove from allowlist?"
          body={`Transactions from "${pendingDelete}" will stop appearing in the dashboard. You can re-promote from the Suggestions tab later.`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => remove(pendingDelete)}
        />
      )}
    </div>
  );
}
