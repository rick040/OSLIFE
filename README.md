# OSLIFE

A personal life-management **operating system**: it turns scattered noticing into one
accumulating memory and surfaces the cross-domain connections (sleep↔energy, finance↔stress)
no single tracker could show.

A working single-user app on a real backend: Supabase (Postgres + Auth + Realtime + Edge
Functions), live ingestion pipelines (Google Apps Script + Google Sheets + Notion + the Geldrop
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
  Notion → projects/clients      ┐                                              │ Zustand store
  Gmail  → gmail_messages        │                                              │ live reads
  Calendar → day_blocks          ├──▶ PostgREST ─▶ Postgres (RLS, per-user) ───▶│ + realtime
  payments-calendar → payments   │                  + Realtime channel ─────────▶│
Sheet-bound Apps Script          │                                              └ Notion write-back
  Health  → health-sheets-ingest │                                                 (notion-mutate)
  Betalingen → payments-sheet-ingest ─▶ Edge Functions ─▶ finance_tx
  Schermtijd → screentime-sheet-ingest                 ─▶ screentime
Notion (read)  → notion-sync / notion-hq
Notion (write) ◀── notion-mutate  (app edits a project/client → Notion)
Geldrop Buurtkaart WordPress API ─▶ gbk-overview ─▶ Buurtkaart screen
Google Wallet (MacroDroid)       ─▶ wallet-ingest ─▶ finance_tx
Phone unlock/screen-off (MacroDroid) ─▶ phone-events-ingest ─▶ phone_events ─▶ health_sleep
ABN AMRO CSV (manual, in-app)    ─▶ finance_tx (deduped against the Betalingen sheet)
```

- **Auth**: Supabase email/password (`src/components/LoginScreen.tsx`). RLS scopes every table to the owner.
- **Store**: `src/store.ts` (Zustand + localStorage). `loadLiveData()` fetches all slices on login
  and subscribes to one Realtime channel; it only overwrites a slice when the query returns rows.
- **Data access**: `src/lib/supabase.ts` — one typed fetcher per slice, plus the write-back helpers
  (`persistProjectPatch` → Notion via `mutateNotion`, `insertFinanceTx` for the CSV import).

## Data sources — one per module

| Module | Source | Pipeline | Table(s) |
|--------|--------|----------|----------|
| Projecten | **In-app (native CRM)** — full CRUD | app write-back (Supabase) | `projects`, `project_tasks`, `project_milestones`, `project_hours`, `project_invoices`, `project_activity` |
| CRM / Klanten | **In-app (native CRM)** — full CRUD | app write-back (Supabase) | `clients`, `client_messages` |
| Strategie HQ · Buurtkaart/Eyes/Dakmeester callouts | **Notion** | `notion-hq` (live) | — |
| Buurtkaart beheer | **Geldrop Buurtkaart WordPress API** | `gbk-overview` (header `X-GBK-Key`) | — (live read) |
| Geld · transacties | **Betalingen Google Sheet** + **ABN AMRO CSV** (in-app) + Google Wallet | `payments-sheet-ingest` · in-app import · `wallet-ingest` | `finance_tx` |
| Geld · Te betalen | **Payments Google Calendar** | Code.gs `syncPayments` | `payments` |
| Schermtijd | **Schermtijd Google Sheet** (tab per categorie) | `screentime-sheet-ingest` | `screentime` |
| Gezondheid | **Health Google Sheet** (slaap/activiteiten/gewicht/stappen) + **phone-afgeleide slaap** (MacroDroid) | `health-sheets-ingest` · `phone-events-ingest` | `health_daily_stats`, `health_sleep`, `health_body_metrics`, `phone_events` |
| Inbox / mail | **Gmail** | Code.gs `syncGmail` | `gmail_messages` |
| Dagplanner / agenda | **Google Calendar** | Code.gs `syncCalendarBlocks` | `day_blocks` |
| Gewoonten · Doelen · Kyra · Abonnementen | in-app (handmatig) | app write-back | `habits`, `goals`, `dog_log`, `subscriptions` |
| Geheugen / Reflectie | afgeleid in-app | reflect engine | `brain_state` |

### Native CRM (Projecten / Klanten)
The CRM is no longer a read-only Notion mirror — it's a full project-manager built
on Supabase. You can add/edit/remove **clients** and **projects** in-app, and every
client is connected to its projects (`projects.client_id → clients.id`). Each project
carries a template: a **uren-tracker** (`project_hours`), **mijlpalen** with due dates
and progress (`project_milestones`), one-time **and recurring tasks** (`project_tasks`),
**facturen** (`project_invoices`), and an **activiteiten-log** (`project_activity`). The
activity logger (`src/lib/crm/activityAnalyzer.ts`) reads a free-text note, matches it to
an open task or milestone and takes the action — ticking the task or bumping the milestone's
progress. The **berichten-inbox** (`client_messages`) unifies e-mail / Fiverr / WhatsApp;
WhatsApp exports import via `src/lib/crm/whatsapp.ts`. Existing Notion-synced rows keep
working; in-app rows get a `local-<uuid>` external id.

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
When the Samsung Health export is empty, sleep still lands — inferred the way SHealth does it:
from *not touching your phone at night*. A MacroDroid macro POSTs a timestamp on each **unlock**
and **screen-off** to `phone-events-ingest`; the function logs them to `phone_events` and derives a
session from the longest overnight gap (last activity before bed → first morning unlock), writing it
to `health_sleep` with `source='phone'`. A real Samsung-Health session (`source='health_app'`) always
wins for that night and is never overwritten by an estimate. Setup:
`integrations/macrodroid/phone-sleep.md`.

### Finance dedup
The Betalingen sheet and the in-app ABN AMRO CSV import both write `finance_tx` with the same
`dedup_key = "YYYY-MM-DD|amount"`. The `UNIQUE (user_id, dedup_key)` constraint plus
`ignoreDuplicates` means a purchase that appears in both is stored exactly once — importing the
monthly ABN export never duplicates what your phone already logged.

## Going live (secrets + triggers)

All code is deployed. To turn a source on, set its secret(s) and triggers — see `.env.example` for
the full contract. Summary:

1. **Edge-function secrets** (Supabase → Edge Functions → Manage secrets): `OSLIFE_USER_ID`,
   `NOTION_TOKEN`, `INGEST_SECRET`, `GBK_API_KEY`, `WALLET_WEBHOOK_SECRET`, `SYNC_SECRET`.
2. **Apps Script** (`integrations/apps-script/`): paste `Code.gs` into the account-level project and
   `health-sheets.gs` / `payments-sheet.gs` / `screentime-sheet.gs` each into their own
   Sheet-bound project; fill Script Properties; run `installTrigger()` / add time-driven triggers.
3. **Notion**: share the Projects, Clients and the 3 side-business pages with your integration.

## Screens

20+ screens grouped into **Surface** (Dashboard, Vandaag, Dagplanner), **Life** (Gezondheid,
Gewoonten, Signalen, Geld, Kyra, Inbox, Noordster), **Business** (CRM, Projecten, Strategie HQ,
Buurtkaart, The Eyes, Dakmeester), **Intake** (HEYRA, Vastleggen) and **Reflect** (Geheugen,
Reflectie, Verbanden). See `src/nav.ts` for the single source of truth.

## Stack

Vite · React · TypeScript · Tailwind CSS · Zustand · lucide-react · recharts · Supabase.

## Secrets

The frontend only ships the public Supabase URL + anon key (RLS protects the data). Service-role
keys, the Notion token, the GBK API key and ingestion secrets live in Supabase Edge Function
secrets and Apps Script Script Properties — never in the bundle or in git. See `.env.example`.
