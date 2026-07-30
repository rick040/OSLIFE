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
Tasker (Health Connect)          │
  Steps/sleep → health-ingest    │
Sheet-bound Apps Script          │
  Betalingen → payments-sheet-ingest ─▶ Edge Functions ─▶ finance_tx
Projecten/Klanten (native CRM, in-app only — no external sync)
Geldrop Buurtkaart WordPress API ─▶ gbk-overview ─▶ Buurtkaart screen
Google Wallet (MacroDroid)       ─▶ wallet-ingest ─▶ finance_tx
Phone unlock/screen-off (MacroDroid) ─▶ phone-events-ingest ─▶ phone_events ─▶ health_sleep
App Opened/Closed (MacroDroid)       ─▶ screentime-app-ingest ─▶ screentime_events ─▶ screentime
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
| Strategie HQ (business ideas) | **In-app** — capture + HEYRA elaboration + opt-in MVP validation plan | `idea-elaborate`, `idea-mvp-plan` edge functions | `business_ideas` |
| Buurtkaart/Eyes/Dakmeester side-business screens | in-app (static config) | — | — |
| Buurtkaart beheer | **Geldrop Buurtkaart WordPress API** | `gbk-overview` (header `X-GBK-Key`) | — (live read) |
| Geld · transacties | **Betalingen Google Sheet** + **ABN AMRO CSV** (in-app) + Google Wallet | `payments-sheet-ingest` · in-app import · `wallet-ingest` | `finance_tx` |
| Geld · Te betalen | **Payments Google Calendar** | Code.gs `syncPayments` | `payments` |
| Schermtijd | **App-timer (MacroDroid)** — App Opened/Closed per app, rechtstreeks | `screentime-app-ingest` (`screentime_events` → `screentime`) | `screentime`, `screentime_events` |
| Gezondheid | **Health Connect** (stappen/slaap, via Tasker) + **scale-notificatie** (MacroDroid, gewicht) + **phone-afgeleide slaap** (MacroDroid fallback) | `health-ingest` · `weight-ingest` · `phone-events-ingest` | `health_daily_stats`, `health_sleep`, `health_body_metrics`, `phone_events` |
| Inbox / mail | **Gmail** | Code.gs `syncGmail` | `gmail_messages` |
| Dagplanner / agenda | **Google Calendar** | Code.gs `syncCalendarBlocks` | `day_blocks` |
| Gewoonten · Doelen · Kyra · Abonnementen | in-app (handmatig) | app write-back | `habits`, `goals`, `dog_log`, `subscriptions` |
| Kyra · wandelroutes | **standalone Android app** (`/android`) — auto-detects real walks (home-geofence / car-ride triggers) | `walk-ingest` | `walks`, `dog_log` |
| Geheugen / Reflectie | afgeleid in-app | reflect engine | `brain_state` |
| Claude-gesprekken → geheugen | **`oslife-remember` Claude Skill** (`.claude/skills/oslife-remember/`) — Claude zelf, via Bash/curl | `claude-chat-ingest` | `braindump_entries` |

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

### Strategie HQ — idea capture from anywhere, grounded elaboration
A business idea reaches Strategie HQ two ways: the dedicated "Nieuw idee" capture on the
screen itself, or dropped straight into ordinary HEYRA chat — the `idea` skill
(`src/heyra/agents/ideaAgent.ts`) recognizes a pitch ("nieuw idee", "wat als we…", "business
idee") via the same brain-first router every other skill uses, and hands back an editable
`IdeaCaptureCard` inline in the conversation. Either path writes one `business_ideas` row and
fires `idea-elaborate` (fire-and-forget, exactly like `braindump-ingest`). Before asking Claude
to work the idea out, `idea-elaborate` now grounds itself: a hybrid full-text + vector recall
over `search_memory()` (via `memory-search`, so the Voyage key stays server-side) surfaces
related past braindumps, interactions and — since business ideas are themselves a
`search_memory()` source — near-duplicate ideas, plus a knowledge-graph insight straight from
cognee (reachable in-process here, unlike the frontend's `cognee-search` round trip). Both are
best-effort with a bounded timeout; a failure or empty result just means the elaboration
proceeds without that context, same graceful-degradation contract as every other HEYRA recall
path.

Elaboration answers "is this idea any good on paper" — it never asks whether anyone would
actually want it. For that, the idea detail view has a second, opt-in "Genereer MVP Launch
Plan" button: it fires `idea-mvp-plan`, which asks Claude for a lean-startup validation plan
grounded in the idea's own analysis — the riskiest assumption, cheap high-signal channels,
a handful of concrete experiments with a falsifiable success signal each, a short phased
roadmap with checkable tasks, and signals to watch. It's explicitly biased against a cold
email blast as the primary validation method (low reply rate, easy to ignore) in favour of
things like landing-page + waitlist, one-on-one conversations, or a manual concierge test —
and calls that trade-off out directly in an `emailCaveat` field. Unlike elaboration this never
runs automatically; it's a deliberate, per-idea action.

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
Sheet, no stopwatch. A macro fires on **App Launched** and **App Closed** for the
apps you track and posts the app name + state to `screentime-app-ingest`. Each
event lands in `screentime_events`; on every Closed the function pairs it with the
app's most recent unmatched Opened, computes the session length, and recomputes
that day's per-app total into `screentime` from the raw log (so retries never
double-count) — exactly like pickups are recomputed from `phone_events`. Setup:
`integrations/macrodroid/app-timer.md`.

### Android walk tracker: auto-detected dog walks
A standalone Android app (`/android` — not published to the Play Store, sideloaded) tracks
real walks with the dog, no third-party fitness app involved. It runs on two free,
battery-cheap Play Services signals — Activity Recognition (WALKING/STILL/IN_VEHICLE
transitions) and one "home" geofence — never polling continuous GPS except during an
actual detected walk. A walk starts when WALKING follows either a home-geofence exit or a
just-finished car ride (the "drove to the forest" case), ends at the home geofence or back
in the car, merges through STILL pauses (sniffing, playing) up to a timeout, and is
discarded outright if under 5 minutes — see `/android/README.md` for the full rule set and
tuning knobs. The finished route posts once to `walk-ingest`, which writes both a `dog_log`
row (shows up in the Kyra timeline like a manual entry) and a `walks` row (the GPS route,
rendered as a Leaflet/OpenStreetMap map card on the Kyra screen — free, no Maps API key).

### Obsidian integration: read the vault, write via an inbox
Two independent, optional directions over Supabase Storage's S3 protocol — full setup in
`docs/SECRETS.md` §7. **Reading**: the `vault` bucket (materialize-note's generated
Markdown mirror) synced read-only into an Obsidian vault via the Remotely Save plugin —
browse/search/graph-view every braindump/interaction/summary/business-idea as a real
`.md` file, without touching the one source of truth (Postgres). **Writing**: a second,
separate `vault-inbox` bucket that a synced Obsidian "inbox" folder feeds — `vault-inbox-sync`
(pg_cron, same shared-secret shape as `notify-tick`) turns each new note into a
`braindump_entries` row and fires `braindump-ingest` on it, exactly like pasting the note
into HEYRA chat, then moves the file under `processed/` so it's never re-ingested.

### Claude Skill: log any Claude chat into OSLIFE's memory
A Claude Skill (`.claude/skills/oslife-remember/`, installable into any Claude profile — not just
this repo) lets Claude log a summary + key points of a conversation on request ("remember this in
OSLIFE"). No MCP server, no client config — Claude writes the summary itself and runs a bundled
script (`curl`) against the `claude-chat-ingest` edge function (shared-secret auth, service-role,
no user session needed). It lands as a `braindump_entries` row — same destination as an in-app
Braindump capture, so it shows up in the Capture grid, feeds `search_memory()`'s recall, mirrors
into the Obsidian vault, and reaches cognee. It can optionally flag a reusable insight for the
Kennisbank (`wiki_entries`, `status='suggested'`), same shape as braindump-ingest's own wiki
suggestion. See `.claude/skills/oslife-remember/SKILL.md` for setup.

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
   `health-sheets.gs` / `payments-sheet.gs` each into their own Sheet-bound project; fill Script
   Properties; run `installTrigger()` / add time-driven triggers.

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
