// scripts/card-detail.ts
// Pulls 90-day transactions and outputs:
//   1. Per-card breakdown for OpenAI + Anthropic cards (for the manual review)
//   2. Azure / Microsoft card detection (Azure cards may have OpenAI billed through Azure portal;
//      only large transactions above a threshold are AI-related)
//
// Output written to:
//   /tmp/ramp-openai-anthropic-detail.csv  (per-card transaction detail)
//   /tmp/ramp-azure-detail.csv              (Microsoft / Azure transactions for review)

import { RampClient } from "@/lib/ramp";
import { writeFileSync } from "node:fs";

interface Row {
  card_id: string;
  cardholder: string;
  department: string;
  location: string;
  vendor: string;
  amount_cents: number;
  date: string;
  memo: string;
  txn_id: string;
}

interface RampTransactionFull {
  id: string;
  amount: number;
  merchant_name: string;
  user_transaction_time: string;
  card_id?: string;
  memo?: string;
  card_holder?: {
    first_name?: string;
    last_name?: string;
    department_name?: string;
    location_name?: string;
  };
}

async function main() {
  const clientId = process.env.RAMP_CLIENT_ID;
  const clientSecret = process.env.RAMP_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("RAMP_CLIENT_ID and RAMP_CLIENT_SECRET must be set");
  }

  const since = new Date();
  since.setDate(since.getDate() - 90);
  const fromDate = since.toISOString();

  const client = new RampClient({ clientId, clientSecret });

  const openAIAnthropicRows: Row[] = [];
  const microsoftRows: Row[] = [];
  let scanned = 0;

  for await (const tx of client.listTransactions(fromDate) as AsyncGenerator<RampTransactionFull>) {
    scanned++;
    const vendor = (tx.merchant_name ?? "").toLowerCase();
    const ch = tx.card_holder;
    const fullName = ch ? `${ch.first_name ?? ""} ${ch.last_name ?? ""}`.trim() : "";
    const row: Row = {
      card_id: tx.card_id ?? "no-card",
      cardholder: fullName,
      department: ch?.department_name ?? "",
      location: ch?.location_name ?? "",
      vendor: tx.merchant_name ?? "",
      amount_cents: Math.round(tx.amount * 100),
      date: tx.user_transaction_time.slice(0, 10),
      memo: (tx.memo ?? "").replace(/[\r\n]+/g, " ").slice(0, 80),
      txn_id: tx.id,
    };

    if (vendor.includes("openai") || vendor.includes("anthropic")) {
      openAIAnthropicRows.push(row);
    }
    if (vendor.includes("microsoft") || vendor.includes("azure")) {
      microsoftRows.push(row);
    }
  }

  console.error(`Scanned ${scanned} transactions. Found ${openAIAnthropicRows.length} OpenAI/Anthropic, ${microsoftRows.length} Microsoft/Azure.`);

  // Sort OpenAI/Anthropic: group by card_id, then by date desc
  openAIAnthropicRows.sort((a, b) => a.card_id.localeCompare(b.card_id) || b.date.localeCompare(a.date));

  const fmt = (rs: Row[]) => {
    const lines = ["card_id,cardholder,vendor,amount_dollars,date,memo,txn_id"];
    for (const r of rs) {
      const dollars = (r.amount_cents / 100).toFixed(2);
      const memo = r.memo.replace(/"/g, '""');
      lines.push(`${r.card_id},${r.cardholder},"${r.vendor.replace(/"/g, '""')}",${dollars},${r.date},"${memo}",${r.txn_id}`);
    }
    return lines.join("\n");
  };

  writeFileSync("/tmp/ramp-openai-anthropic-detail.csv", fmt(openAIAnthropicRows));
  writeFileSync("/tmp/ramp-azure-detail.csv", fmt(microsoftRows));

  // Summary by card for OpenAI/Anthropic
  const byCard = new Map<string, { cardholder: string; department: string; location: string; vendor: string; count: number; total: number; min: number; max: number; firstDate: string; lastDate: string }>();
  for (const r of openAIAnthropicRows) {
    const key = r.card_id;
    const cur = byCard.get(key) ?? { cardholder: r.cardholder, department: r.department, location: r.location, vendor: r.vendor, count: 0, total: 0, min: Infinity, max: -Infinity, firstDate: r.date, lastDate: r.date };
    if (!cur.cardholder && r.cardholder) cur.cardholder = r.cardholder;
    if (!cur.department && r.department) cur.department = r.department;
    cur.count++;
    cur.total += r.amount_cents;
    cur.min = Math.min(cur.min, r.amount_cents);
    cur.max = Math.max(cur.max, r.amount_cents);
    if (r.date < cur.firstDate) cur.firstDate = r.date;
    if (r.date > cur.lastDate) cur.lastDate = r.date;
    byCard.set(key, cur);
  }

  const summary = Array.from(byCard.entries())
    .sort(([, a], [, b]) => b.total - a.total)
    .map(([cardId, s]) => ({
      card_id: cardId,
      cardholder: s.cardholder,
      department: s.department,
      vendor: s.vendor,
      txns: s.count,
      total_dollars: (s.total / 100).toFixed(2),
      avg_dollars: (s.total / s.count / 100).toFixed(2),
      min_dollars: (s.min / 100).toFixed(2),
      max_dollars: (s.max / 100).toFixed(2),
      first_txn: s.firstDate,
      last_txn: s.lastDate,
      ramp_url: `https://app.ramp.com/transactions?card_id=${cardId}`,
    }));

  console.log("card_id,cardholder,department,vendor,txns,total,avg,min,max,first,last,ramp_url");
  for (const s of summary) {
    console.log(`${s.card_id},"${s.cardholder}","${s.department}","${s.vendor}",${s.txns},$${s.total_dollars},$${s.avg_dollars},$${s.min_dollars},$${s.max_dollars},${s.first_txn},${s.last_txn},${s.ramp_url}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
