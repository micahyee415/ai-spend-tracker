# Changelog

All notable changes to this project will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

## [Unreleased]

### Added
- **Cursor seat/token split.** Cursor bills seat licenses and token usage as a single card charge, so 100% of the Cursor card previously landed in the License bucket. Token usage is now pulled from the Cursor Admin API and netted out per calendar month: Licenses shows "Cursor seats" (card charge minus usage) and Token/API shows "Cursor (token usage)".
  - `db/migrations/005_cursor_usage_daily.sql` — `cursor_usage_daily` table (authoritative billed usage per Pacific day; kept separate from `ramp_transactions`).
  - `lib/cursor.ts` — Cursor Admin API client (`CursorClient`), Basic auth, paginated `/teams/filtered-usage-events`, sums billable `chargedCents` (rounded to integer cents — Cursor returns sub-cent floats), 429 backoff mirroring `RampClient`.
  - `lib/cursor-split.ts` — pure `applyCursorSplit()` transform: nets card charge − usage per calendar month, floors seats at 0, flags residual months where usage exceeded the card charge.
  - `lib/sync.ts` `syncCursorUsage()` — upserts a trailing-window usage pull; no-op (degrades to all-License) when `CURSOR_ADMIN_KEY` is unset.
  - `app/api/cron/sync/route.ts` — best-effort Cursor usage sync after the Ramp sync (failure alerts via Slack, never blocks).
  - `app/page.tsx` — fetches usage per range and applies the split server-side; `Methodology` discloses the split and warns on residual months.
  - `scripts/backfill-cursor-usage.ts` — one-time YTD backfill script.
  - `CURSOR_ADMIN_KEY` env var for the Cursor Admin API key.

### Fixed
- Card transactions were missing `card_name` / `card_display_name` in the dashboard drill-down when the daily bill sync consumed the full function timeout before the card-detail backfill could run. Two-layer fix:
  - **Inline resolution in `upsertCard` (`lib/sync.ts`)** — every card transaction now resolves its `card_id` to `'•••• {last_four}'` + `card_display_name` at sync time via a per-run cache (one `/cards/{id}` call per distinct card_id per run). `ON CONFLICT` uses `COALESCE(EXCLUDED, existing)` so a transient API failure on a re-sync never wipes an already-resolved value.
  - **Cron reordering (`app/api/cron/sync/route.ts`)** — interleaved sequence: card sync → `backfillNewCardDetails` → bill+reimbursement sync. Card-detail resolution now runs immediately after card sync, before the bill workload that had been hitting the timeout. `runSync()` accepts an optional `types` parameter to support the split sequence.

## [0.2.2] — 2026-05-20

### Changed
- Moved `config/ai-spend.json` → `docs/historical/ai-spend-v1-seed.json`. File is now a historical reference only — admin edits land in the database directly via `/admin`.
- Updated `NeedsClassification` footer link to point at `/admin/suggestions` instead of the retired JSON config.

## [0.2.1] — 2026-05-20

### Changed
- Retired `reseedClassifications()` — the admin panel is now the sole writer for the `classifications` table. The daily cron, manual refresh, and one-time backfill no longer re-seed from `config/ai-spend.json`.

### Removed
- `reseedClassifications()` function in `lib/sync.ts` and all call sites (cron, manual refresh, backfill script).
- `tests/integration/sync.test.ts` — only exercised the retired function.

## [0.2.0] — 2026-05-19 (admin panel)

Admin panel at `/admin` for managing classifications without a code change. Replaces the `config/ai-spend.json` curation flow with DB-backed writes. Gated to `ADMIN_EMAILS`. Every write is audited with a full before/after diff. Five tabs: Suggestions / Allowlist / Card Map / Vendor Overrides / Audit Log — admin edits are visible on the next dashboard reload.

### Added — Database
- `db/migrations/002_admin_audit_log.sql` — `audit_log` (BIGSERIAL pk, JSONB before/after, indexed on `ts DESC` + `(scope, key)`) and `suggestion_dismissals` (vendor PK, idempotent upserts) tables. Additive — existing tables and view untouched.
- `db/migrations/003_bucket_exclude.sql` — expand `classifications.bucket` CHECK constraint to include `'exclude'` (was `license` | `api` only).

### Added — Auth gate
- `ADMIN_EMAILS` env var (comma-separated) — controls admin allowlist; empty value rejects all writes (kill-switch).
- `lib/admin-emails.ts` — pure parser shared by Edge proxy and Node route handlers.
- `lib/admin-auth.ts` — `requireAdmin()` defense-in-depth helper + `adminErrorResponse()` envelope mapper. Generic "Admin only" message — does not leak authenticated email back to client.
- `auth.config.ts` — `authorized()` extended to redirect non-admins on `/admin/*` and `/api/admin/*` to `/admin/forbidden`. Login path bypassed; `/admin/forbidden` self-excluded from the redirect to prevent loops.

### Added — Audit infrastructure
- `lib/audit.ts` — `writeAudit(client, row)` runs INSERT with JSONB casts inside the caller's BEGIN/COMMIT transaction. `diffAction(before, after)` derives create/update/delete from null comparison.

### Added — Bucket type expansion
- `lib/classify.ts` — `Bucket` type widened to `"license" | "api" | "exclude"`. `classifyTransaction()` returns `{ included: false, bucket: null }` when override or card bucket is `"exclude"`.
- `lib/db.ts` `dailySpend()` — SQL filter `AND (bucket IS NULL OR bucket <> 'exclude')`.
- `lib/aggregate.ts` `periodTotal()` — JS-layer guard `r.bucket !== "exclude"`.

### Added — Suggestion queue
- `lib/suggestions.ts` — keyword regex (`gpt|claude|openai|anthropic|llm|\yai\y|model|cohere|mistral|gemini|copilot|cursor|perplexity|replicate|huggingface`), with constants for minimum lifetime spend threshold, window, and queue size limit. Postgres POSIX `\y` for word boundary; translated to `\b` for JS unit-test use.

### Added — Admin API endpoints
Nine routes, all `requireAdmin`-gated, all parameterized SQL, all mutations write an audit row inside the same transaction:
- `PUT/DELETE /api/admin/classifications/[scope]/[key]` — upsert/delete with Zod validation, `min_amount_cents` support, bucket rejected on allowlist scope, bucket required on card/vendor_override.
- `GET /api/admin/suggestions` — filtered queue (CTE with `~*` keyword regex, lifetime ≥ $50, last 180 days, excludes allowlisted + dismissed).
- `POST /api/admin/suggestions/[vendor]` — promote vendor to allowlist; race-safe (only audits when row didn't exist).
- `DELETE /api/admin/suggestions/[vendor]` — idempotent dismissal. Not audited — dismissals are noise filtering, not classification.
- `GET /api/admin/suggestions/[vendor]/transactions` — drawer detail with per-row card attribution; card last-four extracted via regex, not card_id UUID.
- `GET /api/admin/suggestions/count` — sidebar badge count (same filter as queue).
- `GET /api/admin/audit?scope=&key=&page=` — paginated history (50/page, ORDER BY ts DESC, scope enum-validated).

### Added — Admin UI
- `app/admin/layout.tsx` — sidebar + main split, applies to all admin routes.
- `app/admin/page.tsx` — redirects to `/admin/suggestions`.
- `app/admin/forbidden/page.tsx` — 403 page for non-admins.
- `components/admin/AdminSidebar.tsx` — 5-item nav with live Suggestions count badge (refetches on pathname change).
- `app/admin/suggestions/page.tsx` + `SuggestionsTable.tsx` + `VendorDrawer.tsx` — clickable rows open a right-side drawer with per-transaction card attribution (date / masked last-4 / card label / amount), label editor, promote + dismiss actions.
- `app/admin/allowlist/page.tsx` + `AllowlistTable.tsx` — searchable table, inline label + min_cents edit, delete confirmation, add-vendor form with strict integer validation, keyboard-accessible row activation.
- `app/admin/card-map/page.tsx` + `CardMapTable.tsx` — UNION ALL of mapped cards + auto-discovered unmapped cards from `ramp_transactions`. Unmapped cards float to top with a subtle highlight.
- `app/admin/vendor-overrides/page.tsx` + `OverridesTable.tsx` — searchable table, required bucket, add/delete with confirm.
- `app/admin/audit/page.tsx` + `AuditFeed.tsx` — chronological feed, color-coded action badges (green=create, blue=update, red=delete), side-by-side before/after diff expansion, pagination.
- `components/admin/SearchInput.tsx`, `BucketSelect.tsx`, `ConfirmDialog.tsx`, `AuditBadge.tsx` — shared admin presentational components.

### Added — Tests
- `tests/integration/migration-002.test.ts` — schema verification + CHECK constraint enforcement.
- `tests/integration/audit-write.test.ts` — `writeAudit` round-trip + rollback isolation (3 cases).
- `tests/integration/classifications-write.test.ts` — PUT/DELETE happy/error paths + audit row written in same transaction (9 cases).
- `tests/integration/suggestion-queue.test.ts` — filter dimensions (threshold/window/allowlist/dismissal/keyword/order) + word-boundary edge cases + promote/dismiss/drawer (16 cases).
- `tests/integration/audit-read.test.ts` — pagination + filter (5 cases).
- `tests/unit/admin-auth.test.ts` — requireAdmin + adminErrorResponse (7 cases including no-email-leak assertion).
- `tests/unit/audit.test.ts` — `diffAction` semantics (3 cases).
- `tests/unit/suggestions.test.ts` — `matchesKeyword` positive/negative + word boundary (~19 cases).
- `tests/unit/classify.test.ts` — added exclude-bucket cases (2 new).
- `tests/e2e/admin.spec.ts` — Playwright unauthed gate verification across all 6 admin pages + 8 admin API methods (16 cases).

### Changed
- `app/api/data/transactions/route.ts` — bucket param remains `"license" | "api"` only (drill-down on excluded transactions is not meaningful).
- `.env.example` — added `ADMIN_EMAILS=` documentation block.

## [0.1.0] — 2026-05-18

Initial deployment. Ramp-backed AI spend dashboard with a two-section layout (Licenses vs Token/API), daily automated refresh, and drill-down with card last-four. Built end-to-end in a single day.

### Added — Scaffolding & Auth
- Next.js 16 app with App Router, Turbopack, Auth.js v5 (`next-auth@5.0.0-beta.31`), Google OAuth restricted to a single `@example.com` domain (`signIn` callback + defensive in-route 403 checks).
- `proxy.ts` Edge proxy with explicit named `proxy` const export and route `matcher` config — destructure-rename pattern does not statically resolve in Next.js 16.
- Custom Google OAuth provider (`type:"oauth"` with explicit `issuer:"https://accounts.google.com"`) — bypasses Auth.js v5 RFC9207 strict `iss` validation on Vercel Edge.

### Added — Ramp ingest pipeline
- `lib/ramp.ts` Ramp Developer API client: OAuth client_credentials with token caching, paginated reads via `page.next` cursor, 429 backoff (5s/30s/120s), 401 re-auth retry.
- `db/migrations/001_initial_schema.sql` — `ramp_transactions`, `classifications`, `sync_state` tables; `ai_spend_daily` view with bucket precedence and card-level `min_amount_cents` threshold applied in WHERE clause (sub-threshold transactions drop out entirely, not into `bucket=null`).
- `lib/normalize.ts` vendor name normalization (keyword squash, lowercase).
- `lib/sync.ts` per-spend-type isolated sync (card / bill / reimbursement), Slack failure alerts via `lib/slack.ts`.
- `scripts/backfill.ts` 24-month Ramp transaction backfill.
- `scripts/discover-cards.ts` Ramp card → bucket classification walkthrough.
- `config/ai-spend.json` initial vendor allowlist + card mappings + per-card min-amount thresholds.

### Added — Dashboard UI
- Server-side data fetch with 8 parallel `Promise.all` queries (current/previous/YoY periods, allowlist labels, unclassified totals, last-sync, YTD).
- `lib/ranges.ts` range helpers with DST-safe `subtractDays(ymd, days)` using `Date.UTC`.
- `lib/aggregate.ts` pure functions (`periodTotal`, `annualizedRunRate`, `deltaVs`).
- `DashboardHeader.tsx` range pill selector (1d/7d/30d/90d/YTD/1yr), manual refresh button with cooldown decrementer, `☀/☾` theme toggle (next-themes, OS-respecting default).
- `HeroStrip.tsx` + `StatCards.tsx` top stat strip: total / annualized run rate / vs last period / vs last year.
- `VendorPie.tsx` per-bucket donut chart (Recharts, 12-color palette, dark-mode-aware tooltip/legend, slices ≥5% show labels).
- `VendorTable.tsx` per-vendor table with sparkline + click-to-expand transaction drill-down. Drill columns: Date / Amount / User / Card (`•••• 1234`) / Memo. LIMIT 500 with overflow indicator.
- Two-column layout (`DashboardClient.tsx`): License (left) + Token/API (right), each with pie + 2×2 stat cards + vendor table.
- `Methodology.tsx` auto-lists allowlisted vendor names from the database.
- `NeedsClassification.tsx` audit panel showing unclassified vendor totals.
- `StaleDataBanner.tsx` warns if last sync > 24h.
- SF Pro system font stack, light/dark color tokens in `app/globals.css`.

### Added — Cron & ops
- `/api/cron/sync` daily at `0 13 * * *` (UTC), Bearer-gated by `CRON_SECRET`, runs `runSync` + `backfillNewCardDetails` (delta-only, capped at 100 cards/run).
- `/api/sync/run` manual refresh endpoint (session-gated, IP rate-limited).
- `/api/data/route.ts` range-scoped daily spend endpoint.
- `/api/data/transactions/route.ts` drill-down endpoint, bucket-scoped, date-format-validated.
- `scripts/sync-card-details.ts` one-time full card-details backfill (idempotent).
- 5 Playwright E2E smoke tests for unauthed redirect, login UI, and API 403 gates.

### Added — Deployment
- Vercel deployment with Neon Postgres (Vercel Marketplace).

### Fixed (during build, pre-v0.1.0)
- `proxy.ts` named-const export pattern (Next.js 16 static analyzer cannot resolve destructure-rename).
- Google OAuth `iss` validation: switched from default `type:"oidc"` to `type:"oauth"` with explicit issuer.
- DST-safe range math via `subtractDays` (was using `Date.now() - days * 86400000`, which silently drifted ±1 day around DST transitions).
- Drill-down bucket scoping: prevents a card charge for one vendor from appearing under a different vendor's drill-down when both share a normalized name prefix.
- Sub-threshold card charges hidden entirely (moved threshold check from JOIN to WHERE in the `ai_spend_daily` view).
- API error redaction (`data_unavailable` 503 instead of leaking DB/Ramp errors).
- Date parameters validated against `^\d{4}-\d{2}-\d{2}$` before passing to SQL.
- Sparkline pre-buckets rows by vendor→day in a single pass (was O(rows × days × vendors)).
- `@example.com` domain gate + range validation + DB error handling + `dynamic = "force-dynamic"` on all API routes.

### Changed — Vendor classification
- Moved `min_amount_cents` threshold from vendor-scope to card-scope (applicable to mixed-use cards where only large charges are AI-related).
- Refined vendor allowlist to the six most-used AI vendors.
- Added Voyage AI; moved Braintrust from license bucket to API.
- Classified employee card charges manually for initial seed.

[Unreleased]: https://github.com/your-username/ai-spend-dashboard/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/your-username/ai-spend-dashboard/releases/tag/v0.1.0
