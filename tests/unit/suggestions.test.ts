import { describe, it, expect } from "vitest";
import { matchesKeyword } from "@/lib/suggestions";

describe("matchesKeyword", () => {
  const positives = ["openai", "anthropic", "replicate", "huggingface", "gpt-4 turbo", "claude 3", "ai studio", "cursor pro", "gemini api", "copilot"];
  positives.forEach(v => {
    it(`matches positive: ${v}`, () => {
      expect(matchesKeyword({ vendor_normalized: v })).toBe(true);
    });
  });

  const negatives = ["starbucks", "uber", "mai tai lounge", "aim high coaching", "amazon", "delta airlines", "aimed studio"];
  negatives.forEach(v => {
    it(`rejects negative: ${v}`, () => {
      expect(matchesKeyword({ vendor_normalized: v })).toBe(false);
    });
  });

  it("matches 'ai' as standalone word", () => {
    expect(matchesKeyword({ vendor_normalized: "openai api" })).toBe(true);
  });

  it("does not match 'ai' inside other words (aimed)", () => {
    expect(matchesKeyword({ vendor_normalized: "aimed studio" })).toBe(false);
  });
});
