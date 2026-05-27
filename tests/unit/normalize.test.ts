import { describe, it, expect } from "vitest";
import { normalizeVendor } from "@/lib/normalize";

describe("normalizeVendor", () => {
  const cases: [string, string][] = [
    ["OPENAI *CHATGPT.COM SAN FRANCISCO", "openai"],
    ["ANTHROPIC, PBC", "anthropic"],
    ["CURSOR.SO 8765", "cursor.so"],
    ["GITHUB INC.", "github"],
    ["Perplexity AI Inc", "perplexity"],
    ["STABILITY.AI", "stability.ai"],
    ["ELEVENLABS LLC", "elevenlabs"],
    ["AMAZON WEB SERVICES", "amazon web services"],
    ["OpenAI", "openai"],
    ["Anthropic", "anthropic"],
    ["Microsoft Office / Azure", "microsoft office / azure"],
    ["Hugging Face", "hugging face"],
  ];

  it.each(cases)("'%s' → '%s'", (raw, normalized) => {
    expect(normalizeVendor(raw)).toBe(normalized);
  });
});
