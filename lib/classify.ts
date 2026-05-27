// lib/classify.ts
// Plain English: Given a transaction's normalized vendor + card_id + amount,
// decide whether it belongs in the dashboard (allowlist match + above threshold)
// and which bucket (vendor override > card map > none).

export type Bucket = "license" | "api" | "exclude";

export interface AllowlistEntry {
  label: string;
  min_amount_cents?: number;
}

export interface CardRule {
  bucket: Bucket;
  label: string;
}

export interface VendorOverride {
  bucket: Bucket;
  label?: string;
}

export interface Classifications {
  allowlist: Map<string, AllowlistEntry>;
  cards: Map<string, CardRule>;
  vendorOverrides: Map<string, VendorOverride>;
}

export interface ClassifyInput {
  vendor_normalized: string;
  card_id: string | undefined;
  amount_cents: number;
}

export interface ClassifyResult {
  included: boolean;
  bucket: Bucket | null;
  label?: string;
}

export function classifyTransaction(
  tx: ClassifyInput,
  cfg: Classifications
): ClassifyResult {
  const allow = cfg.allowlist.get(tx.vendor_normalized);
  if (!allow) {
    return { included: false, bucket: null };
  }

  // Amount threshold check
  if (allow.min_amount_cents !== undefined && tx.amount_cents < allow.min_amount_cents) {
    return { included: false, bucket: null };
  }

  // Vendor override beats card map
  const override = cfg.vendorOverrides.get(tx.vendor_normalized);
  if (override) {
    if (override.bucket === "exclude") return { included: false, bucket: null };
    return {
      included: true,
      bucket: override.bucket,
      label: override.label ?? allow.label,
    };
  }

  if (tx.card_id) {
    const card = cfg.cards.get(tx.card_id);
    if (card) {
      if (card.bucket === "exclude") return { included: false, bucket: null };
      return {
        included: true,
        bucket: card.bucket,
        label: card.label,
      };
    }
  }

  // Allowlist hit but no bucket — surfaces in "Needs classification" panel
  return {
    included: true,
    bucket: null,
    label: allow.label,
  };
}
