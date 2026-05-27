"use client";
import DashboardHeader from "./DashboardHeader";
import StaleDataBanner from "./StaleDataBanner";
import HeroStrip from "./HeroStrip";
import StatCards from "./StatCards";
import VendorPie from "./VendorPie";
import Methodology from "./Methodology";
import VendorTable from "./VendorTable";
import NeedsClassification from "./NeedsClassification";
import type { DailyRow } from "@/lib/db";
import type { Range } from "@/lib/ranges";

interface Props {
  rows: DailyRow[];
  previousRows: DailyRow[];
  yearAgoRows: DailyRow[];
  ytdRows: DailyRow[];
  allowlistCount: number;
  allowlistNames: string[];
  unclassifiedTotal: { cents: number; txns: number };
  range: Range;
  lastSync: string | null;
  userEmail: string;
  isAdmin: boolean;
  dataError?: string | null;
  cursorResidual?: boolean;
}

export default function DashboardClient({
  rows,
  previousRows,
  yearAgoRows,
  ytdRows,
  allowlistCount,
  allowlistNames,
  unclassifiedTotal,
  range,
  lastSync,
  userEmail,
  isAdmin,
  dataError,
  cursorResidual,
}: Props) {
  return (
    <>
      <DashboardHeader rangeLabel={range.label} lastSync={lastSync} userEmail={userEmail} />
      <StaleDataBanner lastSync={lastSync} />
      {dataError && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-800 dark:bg-red-900 dark:text-red-200 p-3 text-sm">
          ⚠ Data temporarily unavailable. {lastSync ? `Last refresh: ${lastSync}` : ""}
        </div>
      )}
      <main className="p-6 space-y-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <HeroStrip
          rows={rows}
          previousRows={previousRows}
          yearAgoRows={yearAgoRows}
          range={range}
        />
        <Methodology
          allowlistCount={allowlistCount}
          allowlistNames={allowlistNames}
          unclassifiedTotal={unclassifiedTotal}
          cursorResidual={cursorResidual}
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-gray-600 dark:text-gray-300">§ LICENSES</h2>
            <VendorPie rows={rows} bucket="license" />
            <StatCards
              rows={rows}
              previousRows={previousRows}
              yearAgoRows={yearAgoRows}
              range={range}
              bucket="license"
            />
            <VendorTable
              rows={rows}
              previousRows={previousRows}
              ytdRows={ytdRows}
              range={range}
              bucket="license"
            />
          </section>
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-gray-600 dark:text-gray-300">§ TOKEN / API CONSUMPTION</h2>
            <VendorPie rows={rows} bucket="api" />
            <StatCards
              rows={rows}
              previousRows={previousRows}
              yearAgoRows={yearAgoRows}
              range={range}
              bucket="api"
            />
            <VendorTable
              rows={rows}
              previousRows={previousRows}
              ytdRows={ytdRows}
              range={range}
              bucket="api"
            />
          </section>
        </div>
        <NeedsClassification rows={rows} />
        {isAdmin && (
          <section className="border-t border-gray-200 dark:border-gray-700 pt-4 text-sm">
            <a
              href="/admin"
              className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
            >
              ⚙ Admin panel
            </a>
            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
              Manage allowlist, card map, vendor overrides, and audit log.
            </span>
          </section>
        )}
      </main>
    </>
  );
}
