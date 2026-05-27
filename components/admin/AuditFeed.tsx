"use client";

import { Fragment, useEffect, useState } from "react";

interface Row {
  id: number;
  ts: string;
  actor_email: string;
  action: "create" | "update" | "delete";
  scope: string;
  key: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

const PAGE_SIZE = 50;

export function AuditFeed() {
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/audit?page=${page}`)
      .then(r => r.json())
      .then(b => {
        if (!b.ok) throw new Error(b.error?.message ?? "Load failed");
        setRows(b.rows ?? []);
        setTotal(b.total ?? 0);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (error) {
    return (
      <div className="px-3 py-2 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded">
        Could not load audit log: {error}
      </div>
    );
  }

  return (
    <div>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
            <th className="px-3 py-2 font-medium">When</th>
            <th className="px-3 py-2 font-medium">Who</th>
            <th className="px-3 py-2 font-medium">Action</th>
            <th className="px-3 py-2 font-medium">What</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                Loading…
              </td>
            </tr>
          )}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                No audit entries yet.
              </td>
            </tr>
          )}
          {!loading && rows.map(r => (
            <Fragment key={r.id}>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{new Date(r.ts).toLocaleString()}</td>
                <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{r.actor_email.split("@")[0]}</td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                    r.action === "create" ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" :
                    r.action === "delete" ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" :
                    "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                  }`}>
                    {r.action}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-gray-700 dark:text-gray-300">{r.scope}:{r.key}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {expanded === r.id ? "Hide diff" : "View diff"}
                  </button>
                </td>
              </tr>
              {expanded === r.id && (
                <tr>
                  <td colSpan={5} className="px-3 py-2 bg-gray-50 dark:bg-gray-900">
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <div className="text-[10px] uppercase text-gray-500 dark:text-gray-400 mb-1">Before</div>
                        <pre className="text-xs bg-white dark:bg-gray-800 p-2 border border-gray-200 dark:border-gray-700 rounded overflow-x-auto">
                          {r.before ? JSON.stringify(r.before, null, 2) : "(none)"}
                        </pre>
                      </div>
                      <div className="flex-1">
                        <div className="text-[10px] uppercase text-gray-500 dark:text-gray-400 mb-1">After</div>
                        <pre className="text-xs bg-white dark:bg-gray-800 p-2 border border-gray-200 dark:border-gray-700 rounded overflow-x-auto">
                          {r.after ? JSON.stringify(r.after, null, 2) : "(deleted)"}
                        </pre>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>

      <div className="flex justify-between items-center mt-3 text-xs text-gray-500 dark:text-gray-400">
        <span>Page {page + 1} of {totalPages} • {total} total</span>
        <div className="flex gap-2">
          <button
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
            className="px-3 py-1 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded disabled:opacity-50"
          >
            Prev
          </button>
          <button
            disabled={(page + 1) * PAGE_SIZE >= total}
            onClick={() => setPage(p => p + 1)}
            className="px-3 py-1 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
