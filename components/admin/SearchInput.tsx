"use client";
import { useState } from "react";

export function SearchInput({
  onChange,
  placeholder = "Search...",
}: {
  onChange: (q: string) => void;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  function handle(v: string) {
    setValue(v);
    onChange(v);
  }
  return (
    <input
      value={value}
      onChange={(e) => handle(e.target.value)}
      placeholder={placeholder}
      className="w-60 px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded mb-3"
    />
  );
}
