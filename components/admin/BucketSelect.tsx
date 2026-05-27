"use client";
import type { Bucket } from "@/lib/classify";

export function BucketSelect({
  value,
  onChange,
  disabled,
}: {
  value: Bucket | null;
  onChange: (b: Bucket) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value as Bucket)}
      disabled={disabled}
      className="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded"
    >
      <option value="" disabled>
        —
      </option>
      <option value="license">license</option>
      <option value="api">api</option>
      <option value="exclude">exclude</option>
    </select>
  );
}
