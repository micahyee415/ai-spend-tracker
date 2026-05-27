import { describe, it, expect } from "vitest";
import { classifyTransaction, type Classifications } from "@/lib/classify";

function makeConfig(): Classifications {
  return {
    allowlist: new Map([
      ["openai", { label: "OpenAI" }],
      ["anthropic", { label: "Anthropic" }],
      ["cursor", { label: "Cursor" }],
      ["microsoft office / azure", { label: "Azure OpenAI", min_amount_cents: 100000 }],
      ["github", { label: "GitHub" }],
    ]),
    cards: new Map([
      ["card_lic_1", { bucket: "license", label: "OpenAI ChatGPT Team" }],
      ["card_api_1", { bucket: "api", label: "OpenAI API" }],
    ]),
    vendorOverrides: new Map([
      ["github", { bucket: "license", label: "GitHub Copilot" }],
    ]),
  };
}

describe("classifyTransaction", () => {
  it("excludes non-allowlist vendors", () => {
    const r = classifyTransaction(
      { vendor_normalized: "starbucks", card_id: "card_lic_1", amount_cents: 5000 },
      makeConfig()
    );
    expect(r.included).toBe(false);
  });

  it("uses card map bucket when vendor is on allowlist", () => {
    const r = classifyTransaction(
      { vendor_normalized: "openai", card_id: "card_lic_1", amount_cents: 50000 },
      makeConfig()
    );
    expect(r.included).toBe(true);
    expect(r.bucket).toBe("license");
    expect(r.label).toBe("OpenAI ChatGPT Team");
  });

  it("vendor override beats card map", () => {
    const r = classifyTransaction(
      { vendor_normalized: "github", card_id: "card_api_1", amount_cents: 10000 },
      makeConfig()
    );
    expect(r.bucket).toBe("license"); // override wins
    expect(r.label).toBe("GitHub Copilot");
  });

  it("returns null bucket if allowlist match but no card mapping", () => {
    const r = classifyTransaction(
      { vendor_normalized: "cursor", card_id: undefined, amount_cents: 6000 },
      makeConfig()
    );
    expect(r.included).toBe(true);
    expect(r.bucket).toBeNull();
  });

  it("excludes allowlist vendor if amount below min_amount_cents threshold", () => {
    const r = classifyTransaction(
      { vendor_normalized: "microsoft office / azure", card_id: "card_lic_1", amount_cents: 50000 },
      makeConfig()
    );
    // Amount 50000 < threshold 100000 → excluded
    expect(r.included).toBe(false);
  });

  it("includes allowlist vendor if amount at or above min_amount_cents threshold", () => {
    const r = classifyTransaction(
      { vendor_normalized: "microsoft office / azure", card_id: undefined, amount_cents: 1000000 },
      makeConfig()
    );
    expect(r.included).toBe(true);
    expect(r.label).toBe("Azure OpenAI");
  });

  it("handles missing card_id gracefully (e.g., bills / reimbursements)", () => {
    const r = classifyTransaction(
      { vendor_normalized: "anthropic", card_id: undefined, amount_cents: 20000 },
      makeConfig()
    );
    expect(r.included).toBe(true);
    expect(r.bucket).toBeNull();
  });

  it("excludes transactions when override bucket is 'exclude'", () => {
    const cfg: Classifications = {
      allowlist: new Map([["openai", { label: "OpenAI" }]]),
      cards: new Map(),
      vendorOverrides: new Map([["openai", { bucket: "exclude" }]]),
    };
    const r = classifyTransaction({ vendor_normalized: "openai", card_id: "any", amount_cents: 10000 }, cfg);
    expect(r.included).toBe(false);
    expect(r.bucket).toBeNull();
  });

  it("excludes transactions when card bucket is 'exclude'", () => {
    const cfg: Classifications = {
      allowlist: new Map([["openai", { label: "OpenAI" }]]),
      cards: new Map([["c_1", { bucket: "exclude", label: "Test" }]]),
      vendorOverrides: new Map(),
    };
    const r = classifyTransaction({ vendor_normalized: "openai", card_id: "c_1", amount_cents: 10000 }, cfg);
    expect(r.included).toBe(false);
    expect(r.bucket).toBeNull();
  });
});
