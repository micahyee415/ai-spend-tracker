import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";
import { requireAdmin, ForbiddenError, adminErrorResponse } from "@/lib/admin-auth";

describe("requireAdmin", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.ADMIN_EMAILS = "user@example.com,user@example.com";
  });

  it("returns admin email when session matches allowlist", async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: { email: "user@example.com" } } as any);
    await expect(requireAdmin()).resolves.toEqual({ email: "user@example.com" });
  });

  it("throws ForbiddenError when no session", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as any);
    await expect(requireAdmin()).rejects.toThrow(ForbiddenError);
  });

  it("throws ForbiddenError when email not in allowlist", async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: { email: "user@example.com" } } as any);
    await expect(requireAdmin()).rejects.toThrow(ForbiddenError);
  });

  it("rejected message does not leak the user's email", async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: { email: "user@example.com" } } as any);
    await expect(requireAdmin()).rejects.toThrow("Admin only");
    // verify the message doesn't contain the email
    try { await requireAdmin(); } catch (e: any) {
      expect(e.message).not.toContain("user@example.com");
    }
  });

  it("throws when ADMIN_EMAILS is empty", async () => {
    process.env.ADMIN_EMAILS = "";
    vi.mocked(auth).mockResolvedValueOnce({ user: { email: "user@example.com" } } as any);
    await expect(requireAdmin()).rejects.toThrow(ForbiddenError);
  });
});

describe("adminErrorResponse", () => {
  it("returns 403 JSON for ForbiddenError", async () => {
    const res = adminErrorResponse(new ForbiddenError("nope"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns 500 JSON for unexpected error", async () => {
    const res = adminErrorResponse(new Error("boom"));
    expect(res.status).toBe(500);
  });
});
