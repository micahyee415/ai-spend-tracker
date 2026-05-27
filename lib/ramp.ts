// lib/ramp.ts
// Ramp Developer API client.
// Handles OAuth client-credentials flow (caches token, refreshes on expiry),
// paginated reads (Ramp returns { data, page: { next } } cursor format),
// and 429 backoff with three retries (5s, 30s, 120s).

const RAMP_BASE = "https://api.ramp.com/developer/v1";

export interface RampClientOptions {
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}

export class RampClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly fetchImpl: typeof fetch;
  private token: string | null = null;
  private tokenExpiresAt = 0;

  constructor(opts: RampClientOptions) {
    this.clientId = opts.clientId;
    this.clientSecret = opts.clientSecret;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.token && now < this.tokenExpiresAt - 120_000) {
      return this.token;
    }
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const res = await this.fetchImpl(`${RAMP_BASE}/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials&scope=transactions:read bills:read reimbursements:read cards:read users:read",
    });
    if (!res.ok) {
      const errBody = (await res.text()).slice(0, 200);
      throw new Error(`Ramp OAuth failed: ${res.status} ${errBody}`);
    }
    const body = (await res.clone().json()) as { access_token: string; expires_in: number };
    this.token = body.access_token;
    this.tokenExpiresAt = now + body.expires_in * 1000;
    return this.token;
  }

  private async request<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${RAMP_BASE}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const delays = [5_000, 30_000, 120_000];
    let attempt = 0;
    let reAuthAttempted = false;
    while (true) {
      const token = await this.getAccessToken();
      const res = await this.fetchImpl(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401 && !reAuthAttempted) {
        reAuthAttempted = true;
        this.token = null;
        this.tokenExpiresAt = 0;
        continue;
      }
      if (res.status === 429 && attempt < delays.length) {
        await new Promise((r) => setTimeout(r, delays[attempt++]));
        continue;
      }
      if (!res.ok) {
        const errBody = (await res.text()).slice(0, 200);
        throw new Error(`Ramp ${path} failed: ${res.status} ${errBody}`);
      }
      return (await res.json()) as T;
    }
  }

  async *paginate<T>(path: string, params: Record<string, string> = {}): AsyncGenerator<T> {
    let cursor: string | undefined;
    do {
      const page: { data: T[]; page?: { next?: string } } = await this.request(
        path,
        { ...params, ...(cursor ? { start: cursor } : {}) }
      );
      for (const row of page.data) yield row;
      // Ramp returns page.next as a full URL with ?start=<uuid>; extract the cursor.
      if (page.page?.next) {
        try {
          cursor = new URL(page.page.next).searchParams.get("start") ?? undefined;
        } catch {
          cursor = page.page.next;
        }
      } else {
        cursor = undefined;
      }
    } while (cursor);
  }

  listTransactions(fromDate?: string) {
    return this.paginate<RampTransaction>("/transactions", fromDate ? { from_date: fromDate } : {});
  }
  listBills(fromDate?: string) {
    return this.paginate<RampBill>("/bills", fromDate ? { from_date: fromDate } : {});
  }
  listReimbursements(fromDate?: string) {
    return this.paginate<RampReimbursement>("/reimbursements", fromDate ? { from_date: fromDate } : {});
  }
  listCards() {
    return this.paginate<RampCard>("/cards");
  }
}

export interface RampTransaction {
  id: string;
  amount: number;
  currency_code: string;
  merchant_name: string;
  user_transaction_time: string;
  card_id?: string;
  card_holder?: { email?: string };
  memo?: string;
}
export interface RampBill {
  id: string;
  amount: { amount: number; currency_code: string };
  vendor: { name: string };
  invoice_date?: string;
  payment_date?: string;
  memo?: string;
}
export interface RampReimbursement {
  id: string;
  amount: { amount: number; currency_code: string };
  merchant?: string;
  user: { email?: string };
  transaction_date?: string;
  memo?: string;
}
export interface RampCard {
  id: string;
  display_name: string;
  cardholder?: { email?: string };
  state: string;
}
