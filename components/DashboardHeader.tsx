"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { displayLabel, type RangeLabel } from "@/lib/ranges";

const RANGES: RangeLabel[] = ["1d", "7d", "30d", "90d", "YTD", "12mo"];

interface Props {
  rangeLabel: RangeLabel;
  lastSync: string | null;
  userEmail: string;
}

export default function DashboardHeader({ rangeLabel, lastSync, userEmail }: Props) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [syncing, setSyncing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (cooldown === null) return;
    if (cooldown <= 0) {
      setCooldown(null);
      setError(null);
      return;
    }
    const t = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function refresh() {
    setSyncing(true);
    setError(null);
    const start = Date.now();
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    try {
      const res = await fetch("/api/sync/run", { method: "POST" });
      if (res.status === 429) {
        const body = await res.json();
        setCooldown(Math.ceil(body.retryAfterMs / 1000));
        setError("Rate limited — try again later");
      } else if (!res.ok) {
        setError("Sync failed — try again or contact IT");
      } else {
        router.refresh();
      }
    } finally {
      clearInterval(tick);
      setSyncing(false);
      setElapsed(0);
    }
  }

  return (
    <header className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4 bg-white dark:bg-gray-800">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">AI Spend Dashboard</h1>
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => router.push(`/?range=${r}`)}
              className={
                "rounded px-2.5 py-1 text-xs transition-colors " +
                (r === rangeLabel
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600")
              }
            >
              {displayLabel(r)}
            </button>
          ))}
        </div>
        <button
          disabled={syncing || cooldown !== null}
          onClick={refresh}
          className="rounded bg-blue-600 px-3 py-1 text-white disabled:bg-gray-400 dark:disabled:bg-gray-600"
        >
          {syncing ? `Syncing… (${elapsed}s)` : cooldown ? `Refresh in ${cooldown}s` : "↻ Refresh now"}
        </button>
        <span className="text-gray-500 dark:text-gray-400">
          Last refreshed: {lastSync ? new Date(lastSync).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }) : "never"}
        </span>
        {mounted && (
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            title="Toggle theme"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        )}
        <span className="text-gray-400 dark:text-gray-500">{userEmail}</span>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-gray-500 dark:text-gray-400 hover:underline"
        >
          Sign out
        </button>
        {error && <span className="text-red-600 dark:text-red-400">{error}</span>}
      </div>
    </header>
  );
}
