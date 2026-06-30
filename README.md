# OSLIFE

A personal life-management **operating system**: it turns scattered noticing into one
accumulating memory and surfaces the cross-domain connections (sleep↔energy, finance↔stress)
no single tracker could show.

This is no longer a prototype. It is a working single-user app on a real backend: Supabase
(Postgres + Auth + Realtime + Edge Functions), live ingestion pipelines (Google Apps Script,
Python, GitHub Actions), and a React/Vite frontend that reads live data with realtime updates.
When a data source has no rows yet, the matching screen falls back to seeded demo data so the
UI is never empty.

## Run it

```bash
npm install
cp .env.example .env.local   # fill in VITE_SUPABASE_ANON_KEY
npm run dev
```

Open http://localhost:5173 and sign in with the Supabase account that owns the data
(`auth.users.id` = `RICK_USER_ID`). The sidebar shows a **live data / mock data** dot so you
always know which you're looking at.

```bash
npm run build     # type-check + production build
npm run preview   # serve the production build
```

## Architecture

```
Ingestion                         Supabase (nhyunnnmdcmojvkxrbpl, eu-west-1)        Frontend
─────────                         ─────────────────────────────────────────       ────────
Apps Script (Gmail/Cal/Health) ┐                                                ┌ React + Vite
Python (Spotify/YT/Maps/ActDash)├─▶ Edge Functions ─▶ Postgres (RLS, per-user) ─▶│ Zustand store
GitHub Actions (Spotify poll)   ┘   wallet-ingest        + Realtime channel ─────▶│ live reads
Notion (projects/clients)      ───▶ notion-sync/-hq                              └ + realtime
ABN AMRO CSV (manual import)   ───▶ (in-app parser)
```

- **Auth**: Supabase email/password (`src/components/LoginScreen.tsx`). Sign-in only — the
  account is provisioned in the Supabase dashboard. RLS scopes every table to the owner.
- **Store**: `src/store.ts` (Zustand + localStorage). `loadLiveData()` fetches all slices on
  login and subscribes to a single Realtime channel; it only overwrites a slice when the query
  returns rows, so empty tables keep their seeded demo values.
- **Data access**: `src/lib/supabase.ts` — one typed fetcher per slice.

## Data sources — live status

The app's Supabase project is `nhyunnnmdcmojvkxrbpl` ("oslife"). Status as of this writing:

| Source | Table(s) | Pipeline | Status |
|--------|----------|----------|--------|
| Payments / agenda | `payments` | wallet-ingest / Apps Script calendar | ✅ live (data present) |
| Day blocks & meetings | `day_blocks` | Apps Script calendar | ✅ live (data present) |
| Email / inbox | `gmail_messages` | Apps Script gmail | ✅ live (data present) |
| Projects | `projects` | notion-sync | ✅ live (data present) |
| Clients / CRM | `clients` | notion-sync | ⚪ wired, table empty |
| Bank transactions | `finance_tx` | wallet-ingest / CSV import | ⚪ wired, table empty |
| Health (steps/sleep/HR) | `health_daily_stats`, `health_sleep`, `health_body_metrics` | health-sheets-ingest | ⚪ wired, table empty |
| Habits | `habits`, `habit_log` | manual / app | ⚪ wired, table empty |
| Goals | `goals` | manual / Notion | ⚪ wired, table empty |
| Subscriptions | `subscriptions` | manual / app | ⚪ wired, table empty |
| Dog (Kyra) | `dog_log` | app logging | ⚪ wired, table empty |
| Screen time | `screentime` | Python (ActionDash) | ⚪ wired, table empty |
| Location | `location_visits` | Python (Google Maps Timeline) | ⚪ wired, table empty |
| Music | `spotify_history` | GitHub Actions + Python | ⚪ wired, table empty |
| Reflect memory | `brain_state` | reflect (planned edge fn) | ⚪ wired, table empty |

✅ = rows flowing today · ⚪ = code + table + RLS exist, source not yet connected (needs your
account/keys — see `integrations/README.md`).

## The six layers, mapped to the UI

| Layer | Where to see it |
|------|------------------|
| 1. Intake | **Vastleggen** (Capture) + passive sense data (health, bank, calendar, music) |
| 2. Understand | **Vastleggen** / **HEYRA** show live classification (domain, kind, sentiment, summary) |
| 3. Remember | **Geheugen** (Memory): three stores (Essentials, Threads, Patterns) |
| 4. Reflect | **Reflectie**: cross-domain correlations + anomalies + pattern write-back |
| 5. Surface | **Dashboard** + **Vandaag** + **Dagplanner** + the nudge + **HEYRA** |
| 6. Act | Complete/skip blocks, close threads, tick habits, accept plan, mark paid |

## Screens

20+ screens grouped into **Surface** (Dashboard, Vandaag, Dagplanner), **Life** (Gezondheid,
Gewoonten, Signalen, Geld, Kyra, Inbox, Noordster), **Business** (CRM, Projecten, Strategie HQ,
Buurtkaart, The Eyes, Dakmeester), **Intake** (HEYRA, Vastleggen) and **Reflect** (Geheugen,
Reflectie, Verbanden). See `src/nav.ts` for the single source of truth.

Buurtkaart, The Eyes and Dakmeester are currently self-contained business screens that do not
yet read from Supabase.

## Still on the roadmap to "fully wired"

- Connect the remaining ingestion sources (health, finance, music, location, screen time) — all
  code exists; each needs your account/keys (`integrations/README.md`).
- LLM-backed **Understand** and **Reflect** edge functions (today: a transparent keyword
  classifier in `src/understand.ts` + a deterministic correlator in `src/reflect.ts`).
- A scheduler (`pg_cron`) driving nightly Reflect, plus push notifications for nudges.

## Stack

Vite · React · TypeScript · Tailwind CSS · Zustand · lucide-react · recharts · Supabase.

## Secrets

The frontend only ships the public Supabase URL + anon key (RLS protects the data). Service-role
keys, Notion tokens and ingestion secrets live in Apps Script Script Properties, Supabase Edge
Function secrets, and GitHub Actions secrets — never in the bundle or in git. See `.env.example`
for the full contract.
