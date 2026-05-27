import { test, expect } from "@playwright/test";

test("unauthed visit to root redirects to /login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});

test("login page shows Sign in with Google button + @example.com gating note", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /Sign in with Google/i })).toBeVisible();
  await expect(page.getByText(/@example.com accounts only/i)).toBeVisible();
});

test("login page has correct page title", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveTitle(/AI Spend/i);
});

test("/api/data returns 403 when unauthenticated", async ({ request }) => {
  const res = await request.get("/api/data");
  expect(res.status()).toBe(403);
  const body = await res.json();
  expect(body.error).toBe("forbidden");
});

test("/api/sync/run returns 403 when unauthenticated (POST)", async ({ request }) => {
  const res = await request.post("/api/sync/run");
  expect(res.status()).toBe(403);
});
