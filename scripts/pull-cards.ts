// scripts/pull-cards.ts
// One-time helper for the card-review walkthrough.
//
// Note: Ramp's `cards:read` scope is approved on the credential individually but
// silently dropped when combined with other scopes in a single OAuth call (Ramp
// API quirk). Working around this by enumerating cards from RECENT TRANSACTIONS
// that match AI-vendor keywords. This is actually more useful than listing every
// card in the org — we only care about cards that have AI activity.
//
// Output: CSV (card_id, sample_vendor, txn_count, total_dollars, last_txn_date)
// Pipe to /tmp/ramp-cards.csv, then walk through each card to classify it.

import { RampClient } from "@/lib/ramp";

const AI_KEYWORDS = [
  "openai", "anthropic", "claude", "cursor", "perplexity", "midjourney",
  "gpt", "copilot", "elevenlabs", "cohere", "replicate", "gemini",
  "hugging face", "huggingface", "stability", "runway", "jasper",
  "llm", "mistral", "groq", "together.ai", "supermaven", "codeium",
  "tabnine", "v0.dev", "vercel ai", "pinecone", "langsmith", "langchain",
  "modal labs", "braintrust", "vellum", "glean",
];

function vendorLooksAI(name: string): boolean {
  const lower = name.toLowerCase();
  return AI_KEYWORDS.some((kw) => lower.includes(kw));
}

interface Bucket {
  card_id: string;
  sample_vendor: string;
  txn_count: number;
  total_cents: number;
  last_txn: string;
  unique_vendors: Set<string>;
}

async function main() {
  const clientId = process.env.RAMP_CLIENT_ID;
  const clientSecret = process.env.RAMP_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("RAMP_CLIENT_ID and RAMP_CLIENT_SECRET must be set in .env.local");
  }

  // Pull last 90 days of transactions to keep this fast.
  // Ramp expects a full ISO datetime for from_date, not YYYY-MM-DD.
  const since = new Date();
  since.setDate(since.getDate() - 90);
  const fromDate = since.toISOString();

  const client = new RampClient({ clientId, clientSecret });
  const buckets = new Map<string, Bucket>();
  let scanned = 0;
  let matched = 0;

  for await (const tx of client.listTransactions(fromDate)) {
    scanned++;
    if (!vendorLooksAI(tx.merchant_name ?? "")) continue;
    matched++;
    const cardId = tx.card_id ?? "no-card";
    const bucket = buckets.get(cardId) ?? {
      card_id: cardId,
      sample_vendor: tx.merchant_name,
      txn_count: 0,
      total_cents: 0,
      last_txn: tx.user_transaction_time,
      unique_vendors: new Set<string>(),
    };
    bucket.txn_count++;
    bucket.total_cents += Math.round(tx.amount * 100);
    bucket.unique_vendors.add(tx.merchant_name);
    if (tx.user_transaction_time > bucket.last_txn) {
      bucket.last_txn = tx.user_transaction_time;
      bucket.sample_vendor = tx.merchant_name;
    }
    buckets.set(cardId, bucket);
  }

  console.error(`Scanned ${scanned} transactions over the last 90 days, ${matched} matched AI keywords.`);

  console.log("card_id,sample_vendor,unique_vendors,txn_count,total_dollars,last_txn_date");
  const sorted = Array.from(buckets.values()).sort((a, b) => b.total_cents - a.total_cents);
  for (const b of sorted) {
    const vendorList = Array.from(b.unique_vendors).slice(0, 3).join(" | ").replace(/"/g, '""');
    console.log(`${b.card_id},"${b.sample_vendor.replace(/"/g, '""')}","${vendorList}",${b.txn_count},${(b.total_cents / 100).toFixed(2)},${b.last_txn.slice(0, 10)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
