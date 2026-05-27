// lib/suggestions.ts
// Plain English: Source of truth for the suggestion queue's filter rules.
// Pure functions + a SQL fragment so the regex/thresholds live in one place.
//
// CRITICAL: Postgres POSIX regex uses \y for word boundary, JS uses \b.
// We store keywords in Postgres syntax (\y) and translate for JS use.

export const SUGGESTION_KEYWORDS = [
  "gpt", "claude", "openai", "anthropic", "llm",
  "\\yai\\y", "model", "cohere", "mistral", "gemini",
  "copilot", "cursor", "perplexity", "replicate", "huggingface",
] as const;

export const SUGGESTION_MIN_LIFETIME_CENTS = 5000;     // $50.00
export const SUGGESTION_WINDOW_DAYS = 180;
export const SUGGESTION_LIMIT = 50;

// Postgres-syntax regex — use this in the SQL `~*` operator
export function suggestionRegex(): string {
  return `(${SUGGESTION_KEYWORDS.join("|")})`;
}

// JS-syntax regex — translate \y → \b for V8 RegExp
export function suggestionRegexJS(): string {
  return suggestionRegex().replace(/\\y/g, "\\b");
}

// Pre-compiled JS regex (hoisted — avoids recompilation per call)
const JS_REGEX = new RegExp(suggestionRegexJS(), "i");

export interface VendorMatchInput {
  vendor_normalized: string;
}

export function matchesKeyword(input: VendorMatchInput): boolean {
  return JS_REGEX.test(input.vendor_normalized);
}

export interface QueueRow {
  vendor_normalized: string;
  lifetime_total_cents: string;  // BIGINT from pg comes as string
  txn_count: number;
  last_seen: string;
  first_seen: string;
}
