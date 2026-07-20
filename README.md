# OSLIFE

A personal life-management **operating system**: it turns scattered noticing into one
accumulating memory and surfaces the cross-domain connections (sleep↔energy, finance↔stress)
no single tracker could show.

A working single-user app on a real backend: Supabase (Postgres + Auth + Realtime + Edge
Functions), live ingestion pipelines (Google Apps Script + Google Sheets + the Geldrop
Buurtkaart WordPress API), and a React/Vite frontend that reads live data with realtime updates.
When a data source has no rows yet, the matching screen falls back to seeded demo data so the UI
is never empty.

This app talks to exactly one backend — the Supabase project **`nhyunnnmdcmojvkxrbpl` ("oslife")**
and the Vercel project **oslife**. There is no connection to any other database project.

## Run it

```bash
npm install
cp .env.example .env.local   # fill in VITE_SUPABASE_ANON_KEY
npm run dev
```

Open http://localhost:5173 and sign in with the Supabase account that owns the data
(`auth.users.id` = `OSLIFE_USER_ID`). The sidebar shows a **live data / mock data** dot.

```bash
npm run build     # type-check + production build
npm run preview   # serve the production build
```

## Architecture

```
Ingestion                                  Supabase (nhyunnnmdcmojvkxrbpl)         Frontend
─────────                                  ──────────────────────────────         ────────
Apps Script hub (Code.gs)                                                       ┌ React + Vite
  Gmail  → gmail_messages        ┐                                              │ Zustand store
  Calendar → day_blocks          ├──▶ PostgREST ─▶ Postgres (RLS, per-user) ───▶│ live reads
  payments-calendar → payments   │                  + Realtime channel ─────────▶│ + realtime
Sheet-bound Apps Script          │
  Health  → health-sheets-ingest │
  Betalingen → payments-sheet-ingest ─▶ Edge Functions ─▶ finance_tx
  Schermtijd → screentime-sheet-ingest                 ─▶ screentime
Projecten/Klanten (native CRM, in-app only — no external sync)
Geldrop Buurtkaart WordPress API ─▶ gbk-overview ─▶ Buurtkaart screen
Google Wallet (MacroDroid)       ─▶ wallet-ingest ─▶ finance_tx
Phone unlock/screen-off (MacroDroid) ─▶ phone-events-ingest ─▶ phone_events ─▶ health_sleep
App-timer stopwatch (MacroDroid)     ─▶ phone-events-ingest ─▶ app_sessions ─▶ screentime
ABN AMRO CSV (manual, in-app)    ─▶ finance_tx (deduped against the Betalingen sheet)
```

- **Auth**: Supabase email/password (`src/components/LoginScreen.tsx`). RLS scopes every table to the owner.
- **Store**: `src/store.ts` (Zustand + localStorage). `loadLiveData()` fetches all slices on login
  and subscribes to one Realtime channel; it only overwrites a slice when the query returns rows.
- **Data access**: `src/lib/supabase.ts` — one typed fetcher per slice, plus the write-back helpers
  (`updateProjectRow`/`updateClientRow` for the native CRM, `insertFinanceTx` for the CSV import).

## Data sources — one per module

| Module | Source | Pipeline | Table(s) |
|--------|--------|----------|----------|
| Projecten | **In-app (native CRM)** — full CRUD | app write-back (Supabase) | `projects`, `project_tasks`, `project_milestones`, `project_hours`, `project_invoices`, `project_activity` |
| CRM / Klanten | **In-app (native CRM)** — full CRUD | app write-back (Supabase) | `clients`, `client_messages` |
| Strategie HQ (business ideas) | **In-app** — capture + HEYRA elaboration | `idea-elaborate` edge function | `business_ideas` |
| Buurtkaart/Eyes/Dakmeester side-business screens | in-app (static config) | — | — |
| Buurtkaart beheer | **Geldrop Buurtkaart WordPress API** | `gbk-overview` (header `X-GBK-Key`) | — (live read) |
| Geld · transacties | **Betalingen Google Sheet** + **ABN AMRO CSV** (in-app) + Google Wallet | `payments-sheet-ingest` · in-app import · `wallet-ingest` | `finance_tx` |
| Geld · Te betalen | **Payments Google Calendar** | Code.gs `syncPayments` | `payments` |
| Schermtijd | **App-timer stopwatch (MacroDroid)** — actieve tijd per app + **Schermtijd Google Sheet** (fallback) | `phone-events-ingest` (`app_sessions` → `screentime`) · `screentime-sheet-ingest` | `screentime`, `app_sessions` |
| Gezondheid | **Health Google Sheet** (slaap/activiteiten/gewicht/stappen) + **phone-afgeleide slaap** (MacroDroid) | `health-sheets-ingest` · `phone-events-ingest` | `health_daily_stats`, `health_sleep`, `health_body_metrics`, `phone_events` |
| Inbox / mail | **Gmail** | Code.gs `syncGmail` | `gmail_messages` |
| Dagplanner / agenda | **Google Calendar** | Code.gs `syncCalendarBlocks` | `day_blocks` |
| Gewoonten · Doelen · Kyra · Abonnementen | in-app (handmatig) | app write-back | `habits`, `goals`, `dog_log`, `subscriptions` |
| Geheugen / Reflectie | afgeleid in-app | reflect engine | `brain_state` |

### Native CRM (Projecten / Klanten)
The CRM is a full project-manager built on Supabase — no external sync of any kind.
You add/edit/remove **clients** and **projects** entirely in-app, and every client is
connected to its projects (`projects.client_id → clients.id`). Each project carries a
template: a **uren-tracker** (`project_hours`), **mijlpalen** with due dates and progress
(`project_milestones`), one-time **and recurring tasks** (`project_tasks`), **facturen**
(`project_invoices`), and an **activiteiten-log** (`project_activity`). The activity logger
(`src/lib/crm/activityAnalyzer.ts`) reads a free-text note, matches it to an open task or
milestone and takes the action — ticking the task or bumping the milestone's progress. The
**berichten-inbox** (`client_messages`) unifies e-mail / Fiverr / WhatsApp; WhatsApp exports
import via `src/lib/crm/whatsapp.ts`. New rows get a `local-<uuid>` external id.

### Auto-categorisation (vendor cache)
New transactions tag themselves. When a merchant HEYRA has never seen shows up
(and the rule-based CSV guesser left it `Uncategorized`), a Haiku call with
Anthropic **web search** (`categorize-vendor` edge function) figures out what the
business is and picks a category + life-domain. The verdict is cached in
`vendor_tags` keyed by a normalised merchant name, so the *second* time "Albert
Heijn" appears it's tagged instantly from cache — no repeat lookup, no repeat
cost. It runs automatically on load, on CSV import and when a new row is ingested
(realtime). Every tag is editable by hand in **Geld → Vendors**, and tapping any
transaction opens an editor to change its category/domain or add a note; a manual
category change also teaches the vendor cache for next time.

### Phone-derived sleep
When the Samsung Health export is empty, sleep still lands — derived from your phone via MacroDroid,
in priority order: (1) MacroDroid's own **sleep/wake detection** (`sleep_start`/`sleep_end` events →
used verbatim), else (2) the SHealth-style **activity gap** — a timestamp on each **unlock** and
**screen-off**, from which the function takes the longest overnight gap (last activity before bed →
first morning unlock). Either way it writes to `health_sleep` with `source='phone'`, and a real
Samsung-Health session (`source='health_app'`) always wins for that night and is never overwritten by
an estimate. Setup: `integrations/macrodroid/phone-sleep.md`.

### Phone-derived per-app screen time
Per-app active time comes straight from the phone via MacroDroid — no StayFree, no
Sheet. A macro runs a **stopwatch** while an app is foregrounded (App Launched →
reset+start, App Closed → stop) and, on close, sends the app name + the stopwatch
value to `phone-events-ingest` (`kind=app_usage`). Each session lands in
`app_sessions`; the function recomputes that day's per-app total into `screentime`
from the raw sessions (so retries never double-count), exactly like pickups are
recomputed from `phone_events`. This fills the one gap the Sheet used to own — the
`screentime-sheet-ingest` path still works as a fallback. Setup:
`integrations/macrodroid/app-timer.md`.

### Finance dedup
The Betalingen sheet and the in-app ABN AMRO CSV import both write `finance_tx` with the same
`dedup_key = "YYYY-MM-DD|amount"`. The `UNIQUE (user_id, dedup_key)` constraint plus
`ignoreDuplicates` means a purchase that appears in both is stored exactly once — importing the
monthly ABN export never duplicates what your phone already logged.

## Going live (secrets + triggers)

All code is deployed. To turn a source on, set its secret(s) and triggers — see `.env.example` for
the full contract. Summary:

1. **Edge-function secrets** (Supabase → Edge Functions → Manage secrets): `OSLIFE_USER_ID`,
   `INGEST_SECRET`, `GBK_API_KEY`, `WALLET_WEBHOOK_SECRET`.
2. **Apps Script** (`integrations/apps-script/`): paste `Code.gs` into the account-level project and
   `health-sheets.gs` / `payments-sheet.gs` / `screentime-sheet.gs` each into their own
   Sheet-bound project; fill Script Properties; run `installTrigger()` / add time-driven triggers.

## Screens

20+ screens grouped into **Surface** (Dashboard, Vandaag, Dagplanner), **Life** (Gezondheid,
Gewoonten, Signalen, Geld, Kyra, Inbox, Noordster), **Business** (CRM, Projecten, Strategie HQ,
Buurtkaart, The Eyes, Dakmeester), **Intake** (HEYRA, Vastleggen) and **Reflect** (Geheugen,
Reflectie, Verbanden). See `src/nav.ts` for the single source of truth.

## Stack

Vite · React · TypeScript · Tailwind CSS · Zustand · lucide-react · recharts · Supabase.

## Secrets

The frontend only ships the public Supabase URL + anon key (RLS protects the data). Service-role
keys, the GBK API key and ingestion secrets live in Supabase Edge Function secrets and Apps
Script Script Properties — never in the bundle or in git. See `.env.example`.
