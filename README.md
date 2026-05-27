# ai-spend-dashboard

> A Next.js dashboard for tracking and categorizing AI/software spend (Licenses vs Token/API), with Google SSO, a Postgres-backed admin panel, and a daily automated sync.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)

## Overview

AI spend is hard to track because it comes from multiple sources and mixes two fundamentally different cost types: **seat licenses** (flat monthly charges for tools like Cursor or Copilot) and **token/API consumption** (usage-based charges from providers like OpenAI or Anthropic). Most finance dashboards show them as one undifferentiated number.

This dashboard splits those categories and presents them side-by-side, pulled daily from a corporate card platform (Ramp), enriched with per-card classification rules, and surfaced through a secure internal web app. Non-obvious spend (vendors that look AI-related but haven't been classified) surfaces automatically for admin review.

## Features

### Dashboard
- **Two-section layout** — Licenses (left) and Token/API Consumption (right), each with its own pie chart, stat cards, and vendor table
- **Flexible time ranges** — 1d / 7d / 30d / 90d / YTD / 1yr via a pill selector
- **Stat cards per section** — period total, annualized run rate, delta vs. last period, delta vs. last year
- **Vendor pie chart** — donut chart with 12-color palette; slices ≥5% labeled; dark-mode-aware
- **Vendor table with drill-down** — click any vendor row to expand individual transactions (date, amount, card last-four, cardholder email, memo); LIMIT 500 with overflow indicator; YTD column alongside the selected range
- **Cursor seat/token split** — Cursor bills seat licenses and token usage as a single card charge; the dashboard nets them per calendar month against the Cursor Admin API so each bucket reflects the true cost type
- **Stale data banner** — warns if the last successful sync is >24 hours old
- **Methodology panel** — auto-lists the vendor allowlist from the database; flags unclassified spend by dollar total and transaction count
- **Dark/light mode toggle** — OS-respecting default via next-themes; SF Pro system font stack

### Classification engine
- **Three-tier precedence**: vendor override → card map → allowlist (highest to lowest priority)
- **`exclude` bucket** — explicitly drops a vendor or card from all totals (not just "needs classification")
- **Per-card `min_amount_cents` threshold** — sub-threshold transactions for a card are excluded entirely (useful for mixed-use cards where only large charges are AI-related)
- **Keyword-based suggestion queue** — vendors matching AI-related keywords (`gpt`, `claude`, `openai`, `anthropic`, `llm`, `ai`, `model`, `cursor`, `gemini`, `copilot`, `perplexity`, and others) with lifetime spend above $50 surface automatically for admin action
- **Vendor name normalization** — keyword squash + lowercase to merge variant merchant names before classification

### Admin panel (`/admin`)
Gated to `ADMIN_EMAILS`. Every write is transactionally audited with full before/after diff.

- **Suggestions tab** — paginated queue of unclassified AI-looking vendors; clickable rows open a drawer with per-transaction card attribution (date, masked card number, card label, amount); promote to allowlist or dismiss
- **Allowlist tab** — searchable table of approved vendors; inline label and minimum threshold editing; add/delete with confirmation
- **Card Map tab** — maps card IDs to buckets and labels; auto-surfaces unmapped cards from the transaction history
- **Vendor Overrides tab** — vendor-level bucket overrides that take precedence over the card map
- **Audit Log tab** — chronological feed of every admin write; color-coded create/update/delete badges; side-by-side before/after diff expansion; paginated (50/page)

### Data pipeline
- **Daily cron** — Vercel cron at `0 13 * * *` (UTC); syncs cards, bills, and reimbursements from Ramp; resolves card last-four at sync time via per-run cache; Slack alert on failure
- **Per-type isolated sync** — card, bill, and reimbursement syncs run independently; a bill timeout does not block card sync
- **Cursor usage sync** — pulls billed usage events from the Cursor Admin API into a separate `cursor_usage_daily` table; degrades gracefully (all-license Cursor) when `CURSOR_ADMIN_KEY` is unset
- **Manual refresh** — session-gated endpoint with IP rate limiting; UI button with cooldown counter
- **Backfill scripts** — one-time scripts for initial 24-month Ramp history and Cursor YTD usage

## Screenshots

> _Add screenshot here before publishing._

## Architecture

```
┌─────────────────────────────────────────────┐
│  Next.js 16 App Router (React 19)           │
│                                             │
│  app/page.tsx           — server component  │
│  app/admin/*            — admin panel       │
│  app/api/cron/sync      — daily sync        │
│  app/api/data           — read endpoints    │
│  app/api/admin/*        — write endpoints   │
└────────────────┬────────────────────────────┘
                 │
     ┌───────────┴───────────┐
     │                       │
  Auth.js v5             Postgres
  Google OAuth           (Vercel / Neon)
  @example.com           ├── ramp_transactions
  domain-gated           ├── classifications
  ADMIN_EMAILS           ├── sync_state
  for writes             ├── audit_log
                         ├── suggestion_dismissals
                         ├── cursor_usage_daily
                         └── ai_spend_daily (view)
                                  │
                         ┌────────┴────────┐
                         │                 │
                      Ramp API        Cursor Admin API
                      (daily sync)    (usage sync)
```

**Key design decisions:**

- **`ai_spend_daily` view** — SQL view with bucket precedence (vendor override > card map > allowlist); `min_amount_cents` threshold applied in WHERE clause so sub-threshold transactions drop out entirely rather than landing in "unclassified"
- **Auth.js v5 on Vercel Edge** — custom `type:"oauth"` provider with explicit issuer bypasses RFC9207 strict `iss` validation that breaks on Edge; edge proxy enforces domain + admin gate before any route handler runs
- **Server-side data fetch** — 12 parallel `Promise.all` queries on page load (current/previous/YoY periods × 3 spend windows, plus metadata); no client-side fetching on initial render
- **DST-safe range math** — `subtractDays()` uses `Date.UTC` to avoid ±1 day drift around DST transitions

**Postgres schema (key tables):**

| Table | Purpose |
|---|---|
| `ramp_transactions` | Raw spend rows from Ramp (cards, bills, reimbursements); `spend_type` + `card_id` + `vendor_normalized` |
| `classifications` | Three-scope rule table: `allowlist`, `card`, `vendor_override` |
| `audit_log` | JSONB before/after for every admin write; indexed on `ts DESC` and `(scope, key)` |
| `cursor_usage_daily` | Cursor billed usage per Pacific day; kept separate from `ramp_transactions` |
| `ai_spend_daily` (view) | Join of transactions + classifications with bucket precedence and threshold filtering |

**Migrations** — sequential SQL files in `db/migrations/`; additive and idempotent (`IF NOT EXISTS`).

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5 |
| Auth | Auth.js v5 (`next-auth@5`) — Google OAuth, domain-restricted |
| Database | Postgres via `@vercel/postgres` / `pg` (Neon on Vercel) |
| Charts | Recharts 3 |
| Styling | Tailwind CSS 4 |
| Validation | Zod 4 |
| Tests | Vitest (unit + integration), Playwright (E2E) |
| Deploy | Vercel (cron + serverless functions) |
| Spend source | Ramp Developer API |
| Usage source | Cursor Admin API (optional) |

## Getting Started

### Prerequisites

- Node.js 20+
- A Postgres database (local, [Neon](https://neon.tech), or [Vercel Postgres](https://vercel.com/storage/postgres))
- A [Ramp Developer API](https://docs.ramp.com/developer-api) application (client credentials)
- A Google Cloud OAuth 2.0 client (for SSO)

### Installation

```bash
git clone https://github.com/micahyee415/ai-spend-tracker
cd ai-spend-tracker
npm install
```

### Configuration

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

| Variable | Description |
|---|---|
| `RAMP_CLIENT_ID` | Ramp Developer API OAuth client ID |
| `RAMP_CLIENT_SECRET` | Ramp Developer API OAuth client secret |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 client secret |
| `AUTH_SECRET` | Random 32-byte secret for Auth.js session signing (`openssl rand -base64 32`) |
| `AUTH_TRUST_HOST` | Set to `true` for Vercel / behind a proxy |
| `POSTGRES_URL` | Postgres connection string |
| `CRON_SECRET` | Bearer token to protect the `/api/cron/sync` endpoint |
| `ADMIN_EMAILS` | Comma-separated emails allowed to access `/admin` and write classifications |
| `SLACK_ALERT_WEBHOOK` | (Optional) Incoming webhook URL for sync failure alerts |
| `CURSOR_ADMIN_KEY` | (Optional) Cursor Admin API key; enables seat/token split for Cursor spend |

**Domain restriction:** The dashboard restricts login to a single Google Workspace domain. Update the `@example.com` check in `app/page.tsx` and `auth.ts` to match your domain.

### Apply database migrations

```bash
# Run each migration file in order against your Postgres database
psql "$POSTGRES_URL" -f db/migrations/001_initial_schema.sql
psql "$POSTGRES_URL" -f db/migrations/002_admin_audit_log.sql
psql "$POSTGRES_URL" -f db/migrations/003_bucket_exclude.sql
psql "$POSTGRES_URL" -f db/migrations/004_card_display_name.sql
psql "$POSTGRES_URL" -f db/migrations/005_cursor_usage_daily.sql
```

### Initial data backfill

```bash
# Backfill up to 24 months of Ramp transaction history
npx tsx --env-file=.env.local scripts/backfill.ts

# (Optional) Backfill Cursor YTD usage if CURSOR_ADMIN_KEY is set
npx tsx --env-file=.env.local scripts/backfill-cursor-usage.ts
```

### Run development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You will be redirected to `/login` and prompted to sign in with Google.

### Run tests

```bash
npm test              # Vitest unit + integration tests
npm run test:e2e      # Playwright E2E (requires a running dev server)
```

### Build

```bash
npm run build
npm start
```

### Deploy to Vercel

1. Push to GitHub and import the repo in [Vercel](https://vercel.com/new).
2. Add all environment variables from `.env.example` in the Vercel dashboard (mark secrets as sensitive).
3. Provision a Postgres database (Vercel Postgres / Neon) — `POSTGRES_URL` is auto-set if you use the Vercel marketplace integration.
4. Apply the migrations (see above) against the production database.
5. The Vercel cron (`vercel.json`) fires `/api/cron/sync` daily at 13:00 UTC. Set `CRON_SECRET` and enable Vercel Cron in your project settings.

## Project structure

```
app/
  admin/          — admin panel pages (suggestions, allowlist, card map, overrides, audit)
  api/
    admin/        — write API routes (classifications, suggestions, audit)
    cron/sync     — daily sync cron handler
    data/         — read-only spend data endpoints
  page.tsx        — main dashboard (server component)
components/
  admin/          — admin UI components (tables, drawer, sidebar, shared inputs)
  DashboardClient.tsx
  DashboardHeader.tsx
  HeroStrip.tsx
  StatCards.tsx
  VendorPie.tsx
  VendorTable.tsx
  Methodology.tsx
  NeedsClassification.tsx
  StaleDataBanner.tsx
db/migrations/    — sequential SQL migration files
lib/
  ramp.ts         — Ramp API client (OAuth, pagination, retry)
  cursor.ts       — Cursor Admin API client
  cursor-split.ts — pure seat/token netting transform
  sync.ts         — sync engine (card / bill / reimbursement / Cursor)
  classify.ts     — three-tier classification logic
  suggestions.ts  — suggestion queue filter rules and keyword regex
  aggregate.ts    — pure math helpers (period total, run rate, delta)
  db.ts           — Postgres query functions
  audit.ts        — audit log write helper
  admin-auth.ts   — admin gate helper
  normalize.ts    — vendor name normalization
  ranges.ts       — DST-safe date range helpers
  slack.ts        — Slack webhook alert
scripts/
  backfill.ts              — initial 24-month Ramp history backfill
  backfill-cursor-usage.ts — YTD Cursor usage backfill
  sync-card-details.ts     — full card-details backfill (idempotent)
  pull-cards.ts            — AI card discovery helper (CSV output)
  card-detail.ts           — per-card transaction detail export
tests/
  unit/           — classify, admin-auth, audit, suggestions
  integration/    — migration schema, audit write/read, classifications, suggestion queue
  e2e/            — Playwright auth gate smoke tests
```
