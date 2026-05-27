"use client";

interface Props {
  lastSync: string | null;
}

export default function StaleDataBanner({ lastSync }: Props) {
  if (!lastSync) {
    return (
      <div className="bg-red-100 border-l-4 border-red-500 text-red-800 dark:bg-red-900 dark:text-red-200 p-3 text-sm">
        ⚠ No successful sync recorded. Click <strong>Refresh now</strong> to fetch data.
      </div>
    );
  }
  const ageHours = (Date.now() - new Date(lastSync).getTime()) / 3_600_000;
  if (ageHours < 25) return null;
  return (
    <div className="bg-red-100 border-l-4 border-red-500 text-red-800 dark:bg-red-900 dark:text-red-200 p-3 text-sm">
      ⚠ Data is {Math.floor(ageHours)} hours old. Last sync: {lastSync}. Click <strong>Refresh now</strong> to retry.
    </div>
  );
}
