"use client";
import { useMemo } from "react";
import { useTheme } from "next-themes";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { DailyRow } from "@/lib/db";

interface Props {
  rows: DailyRow[];
  bucket: "license" | "api";
}

const PALETTE = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
  "#06b6d4", "#84cc16", "#a855f7", "#f43f5e",
];

export default function VendorPie({ rows, bucket }: Props) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const data = useMemo(() => {
    const byVendor = new Map<string, number>();
    for (const r of rows) {
      if (r.bucket !== bucket) continue;
      byVendor.set(r.vendor_label, (byVendor.get(r.vendor_label) ?? 0) + r.amount_cents / 100);
    }
    return Array.from(byVendor, ([name, value]) => ({ name, value }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [rows, bucket]);

  if (data.length === 0) {
    const hasAnyRows = rows.length > 0;
    return (
      <div className="text-gray-500 dark:text-gray-400 text-sm p-4 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
        {hasAnyRows
          ? `No classified ${bucket} spend in this range — see Methodology for unclassified total.`
          : "No data in this range."}
      </div>
    );
  }

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="h-80 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-2">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius="70%"
            innerRadius="35%"
            paddingAngle={1}
            label={(entry: { value?: number }) => {
              const v = typeof entry.value === "number" ? entry.value : 0;
              const pct = (v / total) * 100;
              return pct >= 5 ? `${pct.toFixed(0)}%` : "";
            }}
            labelLine={false}
            stroke={isDark ? "#1f2937" : "#ffffff"}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v) => {
              const n = typeof v === "number" ? v : Number(v);
              return Number.isFinite(n) ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : String(v ?? "");
            }}
            contentStyle={{
              backgroundColor: isDark ? "#1f2937" : "#ffffff",
              border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
              color: isDark ? "#f3f4f6" : "#111827",
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: isDark ? "#d1d5db" : "#374151" }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
