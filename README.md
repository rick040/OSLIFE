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
| Projecten | **Notion** (read+write) | `notion-sync` ↓ · `notion-mutate` ↑ | `projects` |
| CRM / Klanten | **Notion** (read+write) | `notion-sync` ↓ · `notion-mutate` ↑ | `clients` |
| Strategie HQ · Buurtkaart/Eyes/Dakmeester callouts | **Notion** | `notion-hq` (live) | — |
| Buurtkaart beheer | **Geldrop Buurtkaart WordPress API** | `gbk-overview` (header `X-GBK-Key`) | — (live read) |
| Geld · transacties | **Betalingen Google Sheet** + **ABN AMRO CSV** (in-app) + Google Wallet | `payments-sheet-ingest` · in-app import · `wallet-ingest` | `finance_tx` |
| Geld · Te betalen | **Payments Google Calendar** | Code.gs `syncPayments` | `payments` |
| Schermtijd | **Schermtijd Google Sheet** (tab per categorie) | `screentime-sheet-ingest` | `screentime` |
| Gezondheid | **Health Google Sheet** (slaap/activiteiten/gewicht/stappen) | `health-sheets-ingest` | `health_daily_stats`, `health_sleep`, `health_body_metrics` |
| Inbox / mail | **Gmail** | Code.gs `syncGmail` | `gmail_messages` |
| Dagplanner / agenda | **Google Calendar** | Code.gs `syncCalendarBlocks` | `day_blocks` |
| Gewoonten · Doelen · Kyra · Abonnementen | in-app (handmatig) | app write-back | `habits`, `goals`, `dog_log`, `subscriptions` |
| Geheugen / Reflectie | afgeleid in-app | reflect engine | `brain_state` |

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
