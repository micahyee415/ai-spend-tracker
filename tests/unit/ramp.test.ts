import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RampClient } from "@/lib/ramp";

describe("RampClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("caches the OAuth token until it expires", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "tok_abc", expires_in: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const client = new RampClient({
      clientId: "id",
      clientSecret: "sec",
      fetchImpl: fetchSpy,
    });

    await client.getAccessToken();
    await client.getAccessToken();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(3500 * 1000);
    await client.getAccessToken();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("retries on 429 then succeeds", async () => {
    const tokenResponse = () => new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200, headers: { "Content-Type": "application/json" } });
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "a" }] }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const client = new RampClient({ clientId: "id", clientSecret: "sec", fetchImpl: fetchSpy });
    // Use the private request path indirectly via paginate
    const promise = (async () => {
      const items: Array<{ id: string }> = [];
      for await (const t of client.listCards()) items.push(t as { id: string });
      return items;
    })();
    // Advance the 5s backoff
    await vi.advanceTimersByTimeAsync(5_000);
    const items = await promise;
    expect(items).toEqual([{ id: "a" }]);
    expect(fetchSpy).toHaveBeenCalledTimes(3);  // token + 429 + success
  });

  it("paginate follows cursor across two pages then stops", async () => {
    const tokenResponse = () => new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200, headers: { "Content-Type": "application/json" } });
    // Ramp returns page.next as a full URL, not a bare cursor. Test reflects real shape.
    const realNextUrl = "https://api.ramp.com/developer/v1/cards?page_size=2&start=ce6142d2-faa0-48d8-8094-e4535554251f";
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "1" }, { id: "2" }], page: { next: realNextUrl } }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "3" }] }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const client = new RampClient({ clientId: "id", clientSecret: "sec", fetchImpl: fetchSpy });
    const ids: string[] = [];
    for await (const c of client.listCards()) ids.push((c as { id: string }).id);
    expect(ids).toEqual(["1", "2", "3"]);
    // Second page URL must extract start=<uuid> from the next URL
    const calls = fetchSpy.mock.calls;
    const secondPageUrl = String(calls[2][0]);
    expect(secondPageUrl).toContain("start=ce6142d2-faa0-48d8-8094-e4535554251f");
  });

  it("throws with truncated body on non-OK non-429 status", async () => {
    const longBody = "x".repeat(500);
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(longBody, { status: 500 }));

    const client = new RampClient({ clientId: "id", clientSecret: "sec", fetchImpl: fetchSpy });
    await expect(async () => {
      for await (const _ of client.listCards()) { /* noop */ }
    }).rejects.toThrow(/^Ramp \/cards failed: 500 x+/);

    // Verify body is truncated (full 500 chars not in error message)
    try {
      for await (const _ of client.listCards()) { /* noop */ }
      throw new Error("should have thrown");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      expect(msg.length).toBeLessThan(300);  // 200 char body + prefix
    }
  });
});
