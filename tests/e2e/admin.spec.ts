// tests/e2e/admin.spec.ts
// E2E smoke for the admin panel. Mirrors the v1 smoke.spec.ts pattern — no OAuth stubbing,
// just verifies the auth gate from the outside (unauthenticated redirects + 403s).
// Full authenticated happy-path testing happens manually during the deploy verification step.
//
// Behavior confirmed via curl against the local dev server:
// - All /admin/* routes: 307 → /login (Auth.js middleware, unauthenticated)
// - All /api/admin/* routes: 307 → /login (Auth.js middleware intercepts before handler)
// - Playwright request API follows redirects by default, so maxRedirects: 0 is required
//   to observe the 307 directly.

import { test, expect } from "@playwright/test";

test.describe("admin panel — auth gate", () => {
  test("unauthed /admin redirects to login", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthed /admin/suggestions redirects to login", async ({ page }) => {
    await page.goto("/admin/suggestions");
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthed /admin/allowlist redirects to login", async ({ page }) => {
    await page.goto("/admin/allowlist");
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthed /admin/card-map redirects to login", async ({ page }) => {
    await page.goto("/admin/card-map");
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthed /admin/vendor-overrides redirects to login", async ({ page }) => {
    await page.goto("/admin/vendor-overrides");
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthed /admin/audit redirects to login", async ({ page }) => {
    await page.goto("/admin/audit");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/admin/forbidden redirects to login when unauthenticated", async ({ page }) => {
    // /admin/forbidden is excluded from the admin-role check (non-admins can land here
    // after authentication), but unauthenticated visitors still hit the base auth gate
    // and get bounced to /login. Confirmed: 307 → /login.
    await page.goto("/admin/forbidden");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("admin panel — API endpoints reject unauthed requests", () => {
  // Auth.js v5 middleware intercepts /api/admin/* before the route handler runs and
  // issues a 307 redirect to /login when there is no session.
  // We use maxRedirects: 0 to observe the 307 directly (Playwright follows by default).
  // The route-level requireAdmin() 403 is defense-in-depth for authenticated non-admins.

  test("GET /api/admin/suggestions rejects unauthed (307)", async ({ request }) => {
    const res = await request.get("/api/admin/suggestions", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
  });

  test("GET /api/admin/audit rejects unauthed (307)", async ({ request }) => {
    const res = await request.get("/api/admin/audit", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
  });

  test("PUT /api/admin/classifications/allowlist/test rejects unauthed (307)", async ({ request }) => {
    const res = await request.put("/api/admin/classifications/allowlist/test", {
      data: { label: "Test" },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(307);
  });

  test("DELETE /api/admin/classifications/allowlist/test rejects unauthed (307)", async ({ request }) => {
    const res = await request.delete("/api/admin/classifications/allowlist/test", {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(307);
  });

  test("POST /api/admin/suggestions/anyvendor rejects unauthed (307)", async ({ request }) => {
    const res = await request.post("/api/admin/suggestions/anyvendor", {
      data: { label: "Test" },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(307);
  });

  test("GET /api/admin/suggestions/count rejects unauthed (307)", async ({ request }) => {
    const res = await request.get("/api/admin/suggestions/count", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
  });

  test("DELETE /api/admin/suggestions/anyvendor rejects unauthed (307)", async ({ request }) => {
    const res = await request.delete("/api/admin/suggestions/anyvendor", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
  });

  test("GET /api/admin/suggestions/anyvendor/transactions rejects unauthed (307)", async ({ request }) => {
    const res = await request.get("/api/admin/suggestions/anyvendor/transactions", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
  });
});

test.describe("admin panel — UI smoke (no auth required for sign-in flow surface)", () => {
  test("admin shell is not exposed to anonymous visitors", async ({ page }) => {
    // Hitting /admin redirects to /login — confirm we land on login and the
    // admin sidebar (which contains admin-specific nav items) is not rendered.
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
    // Admin sidebar nav items should NOT be visible on the login page
    await expect(page.getByText("Suggestions", { exact: true })).not.toBeVisible();
    await expect(page.getByText("Allowlist", { exact: true })).not.toBeVisible();
  });
});
