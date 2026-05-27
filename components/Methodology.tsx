"use client";
import { useState } from "react";

interface Props {
  allowlistCount: number;
  allowlistNames: string[];
  unclassifiedTotal: { cents: number; txns: number };
  cursorResidual?: boolean;
}

export default function Methodology({ allowlistCount, allowlistNames, unclassifiedTotal, cursorResidual }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-sm">
      <button onClick={() => setOpen(!open)} className="text-blue-600 dark:text-blue-400 hover:underline">
        {open ? "▴" : "▾"} * How these numbers are calculated
      </button>
      {open && (
        <ol className="mt-2 ml-4 list-decimal space-y-1 text-gray-700 dark:text-gray-300">
          <li><strong>Source.</strong> All figures pulled directly from Ramp via the Ramp Developer API. Same dollars as on your Ramp statement.</li>
          <li><strong>Spend types included.</strong> Card transactions (physical + virtual), Bill Pay invoices (ACH/wire), and out-of-pocket reimbursements. Refunds and credits net against spend.</li>
          <li>
            <strong>What counts as "AI."</strong> A list of <strong>{allowlistCount}</strong> AI vendors maintained by IT:
            {allowlistNames.length > 0 ? (
              <span> {allowlistNames.join(", ")}.</span>
            ) : (
              <span> (none)</span>
            )} Vendors not on the list are excluded.
          </li>
          <li><strong>License vs. API bucket.</strong> Determined by the Ramp virtual card the charge hit (each card mapped to "License" or "API"). Per-vendor overrides apply where one card mixes both. Bill Pay and reimbursements are bucketed by vendor rule.</li>
          <li>
            <strong>Cursor seats vs. usage.</strong> Cursor bills seats + token usage as one card charge.
            Token usage is pulled from the Cursor Admin API (billed <code>chargedCents</code>) and shown
            under Token / API; the License "Cursor seats" line is the card charge minus that usage, netted
            per month.
            {cursorResidual && (
              <span className="text-amber-600 dark:text-amber-400">
                {" "}⚠ In at least one month, reported usage exceeded the card charge — seats floored at $0; check Cursor billing alignment.
              </span>
            )}
          </li>
          <li><strong>Time window.</strong> Grouped by Ramp's posted date, normalized to Pacific Time.</li>
          <li><strong>Annualized Run Rate</strong> = (period spend ÷ days in period) × 365.</li>
          <li><strong>vs Last Period</strong> compares same-length windows. <strong>vs Last Year</strong> compares same calendar window one year prior. Shows <code>—</code> until ≥ 12 months of data exists.</li>
          <li><strong>Excluded from hero totals.</strong> Allowlisted AI vendors on cards not yet bucketed appear in "Needs classification" below and are <strong>not</strong> counted in the hero. Current uncounted: <strong>${(unclassifiedTotal.cents / 100).toLocaleString()}</strong> ({unclassifiedTotal.txns} transactions).</li>
          <li><strong>Refresh cadence.</strong> Once daily at 5:00 AM Pacific. Manual refresh available via the button at top.</li>
        </ol>
      )}
    </div>
  );
}
