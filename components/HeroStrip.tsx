"use client";
import StatCards from "./StatCards";
import type { DailyRow } from "@/lib/db";
import type { Range } from "@/lib/ranges";

interface Props {
  rows: DailyRow[];
  previousRows?: DailyRow[];
  yearAgoRows?: DailyRow[] | null;
  range: Range;
}

export default function HeroStrip(props: Props) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-gray-600 dark:text-gray-300">TOTAL AI SPEND (Licenses + API)</h2>
      <StatCards {...props} />
    </section>
  );
}
