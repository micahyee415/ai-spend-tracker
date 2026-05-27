// lib/normalize.ts
// Plain English: Reduces Ramp's messy merchant strings ("OPENAI *CHATGPT.COM SAN FRANCISCO")
// to a stable join key ("openai") for the allowlist + classification lookup.

export function normalizeVendor(raw: string): string {
  let v = raw.trim();

  // Strip processor prefix like "OPENAI *" — keep the prefix word
  const prefixMatch = v.match(/^([A-Z]+)\s\*/);
  if (prefixMatch) {
    v = prefixMatch[1];
  }

  // Lowercase for downstream rules
  v = v.toLowerCase();

  // Strip legal entity suffixes (with optional comma before)
  v = v.replace(/[\s,]+(inc|inc\.|llc|co|corp|pbc|ltd)\b\.?/gi, "");

  // Strip trailing purely-numeric IDs (3+ digits) preceded by a space
  v = v.replace(/\s\d{3,}$/, "");

  // Strip trailing US-style geographic suffixes
  v = v.replace(/\s(san francisco|sf ca|[a-z][a-z ]+,?\s[a-z]{2})$/i, "");

  // Strip filler " AI " token (e.g., "Perplexity AI" → "perplexity") — but preserve ".ai" TLDs
  v = v.replace(/\sai(\s|$)/i, "$1");

  // Strip trailing .com — but preserve .ai (it's often part of the brand)
  v = v.replace(/\.com$/i, "");

  // Collapse whitespace
  v = v.replace(/\s+/g, " ").trim();

  return v;
}
