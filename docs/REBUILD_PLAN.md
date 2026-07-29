# OSLIFE — Ground-Up Rebuild Plan

## Context

OSLIFE is a personal life-operating-system app (health, finance, projects/CRM,
habits, relationships, home admin, a dog-tracking module, business ideas, an AI
chat assistant) that has grown organically across ~1,000s of commits into
something the owner describes as messy, buggy, unreliable, and not up to a
"ready to ship" quality bar — even though it's for personal use only and will
never actually ship publicly. Concretely, three things are broken at once:

1. **Data is unreliable.** Devices show stale or wrong data, sync between
   mobile and desktop is unreliable, and offline/failed writes silently
   disappear.
2. **The "brain" doesn't work as one thing.** AI is wired into 8+ separate
   places, each with its own copy-pasted prompt/call/parse logic, and there
   are two never-merged retrieval systems (a vector search and a separate
   self-hosted knowledge-graph service) plus a third ad hoc client-side graph.
3. **The codebase has accreted competing patterns** — three different
   "task" concepts that were never unified, 8 currency formatters, 6 modal
   styles, ~90 hand-written CRUD functions with no shared data-access layer,
   an abandoned half-built redesign sitting unused in the repo
   (`src/design-demo/`), and documentation that describes screens that no
   longer exist.

Research (three parallel deep-dives across the repo, plus reading
`README.md` and `docs/DATA-ARCHITECTURE.md` directly) confirmed all of this
concretely — file paths and line numbers are cited throughout this plan.
One important finding: `docs/DATA-ARCHITECTURE.md` already describes a
genuinely well-designed event-sourcing + tiered-privacy + confidence-scored
inference architecture (PM-201) that directly answers "how should data be
stored and analyzed" — it's just unfinished (the event log is a shadow
mirror today, not what the UI actually reads from) and layered on top of,
rather than replacing, the legacy per-domain tables. This plan finishes that
design as the real foundation rather than reinventing it.

The owner wants a **total rebuild**: same product concept and same screens
conceptually, but a completely rethought infrastructure — where data lives,
how it's stored, how it syncs across devices, how AI reasons over it as one
coherent "brain," and a lean, cheap-to-free, fully open-source tool stack not
tied to any particular vendor (explicitly not clamped to Supabase-as-a-company
or Vercel-as-a-company, though their underlying open-source components are
fair game). Decisions below reflect the owner's explicit answers:

- **Data platform**: self-hosted, open-source Postgres stack — full control,
  no vendor lock-in, near-zero cost.
- **Mobile**: no true offline mode needed — just reliable sync whenever a
  device reconnects. Priority is getting phone data (health, activity,
  notifications) in the *best* way, which points toward a native-capable
  client rather than more browser/automation workarounds.
- **AI brain**: one unified vector-RAG service. Drop the separate
  self-hosted knowledge-graph service (its own database, its own OpenAI
  billing) to remove a whole moving part.
- **Execution**: greenfield rebuild. Also explicitly kill the "middleman"
  ingestion pattern — Google Apps Script (Gmail/Calendar/Sheets bridge),
  MacroDroid/Tasker phone automations — and bring that functionality
  directly into the app itself instead of chaining through third-party
  automation tools.

---

## Product surface to preserve (screens & functions)

25 routed screens today, grouped into 5 areas (`src/nav.ts` is the current
single source of truth). The rebuild keeps this product surface — the redesign
is about *how it's built*, not *what it does*. Recommended consolidations are
called out inline; final call on each is made during detailed screen-by-screen
design, not here.

**Surface** (daily use): Dashboard (home/overview), Tasks, Day Planner
**Life**: Health/Vitals, Workout, Habits, Cleaning, Money (finance), Dog
(Kyra), Locations, Relationships, Home & Admin, Inbox (Gmail), North Star
(goals), Profile
**Business**: CRM, Projects, Strategy HQ (business ideas), Buurtkaart (a real
side business), two smaller side-business admin screens (Eyes, Dakmeester —
currently orphaned from navigation entirely; recommend folding into the
existing shared `SideBusiness` template or retiring them)
**Intake**: HEYRA (the AI chat assistant), Capture (universal "braindump"
inbox)
**Reflect**: Memory, Kennisbank (auto-suggested knowledge wiki), Reflect
(cross-domain correlation engine), Mindmap

Recommended structural consolidations to resolve during rebuild (not new
functionality, just removing the "everything does its own thing" pattern):
- **One task model.** Today there are three independent task
  representations — `store.threads` (Tasks kanban), `project_tasks`
  (CRM/Projects), `day_blocks` (Day Planner). These should become one
  underlying concept with domain-specific views/filters on top, not three
  separate stores.
- **Kiosk views** (`GymWorkoutKiosk`, `ProjectDeskKiosk`) should become thin
  routes reusing the real Workout/Projects screens once real routing exists,
  not separately duplicated components.
- **`src/design-demo/`** (an already-started token system + 2 of 12 rebuilt
  screens) becomes the literal starting point for the new UI's design system
  rather than something to reinvent from scratch — it's already aligned with
  this exact goal.

---

## Architecture: three stages, as the owner framed it

### Stage 1 — Data: storage & sync

**Platform**: a self-hosted, fully open-source Postgres stack — Postgres +
PostgREST (auto-generated REST API) + Realtime + GoTrue (auth) + a storage
API + `pg_cron`, run via Docker Compose on a cheap VPS (roughly
€5–10/month). This is literally the open-source stack Supabase-the-company
ships and self-hosts — so existing Postgres/RLS/RPC knowledge carries over
directly, but there is no vendor, no usage-based billing, and no lock-in.
Migrating off it later just means migrating a plain Postgres database.

**Schema — make the event-sourcing design real, not a shadow.** Adopt the
PM-201 model from `docs/DATA-ARCHITECTURE.md` as the actual primary pattern
from day one, not a mirror bolted onto legacy tables:
- An append-only `events` log is the source of truth; current-state tables
  are projections derived from it, not the other way around.
- Universal envelope on every record (id, type, life-domain(s), occurred_at,
  recorded_at, source, confidence, status, tier, provenance).
- Two-tier privacy (`normaal` / `geheim`) preserved exactly as designed —
  `geheim` content never reaches cloud AI and never gets embedded. This is a
  good existing principle worth keeping unchanged.
- Confidence-scored inference with confirm/reject loop, pattern-promotion
  rules, and the learn-to-suppress feedback loop (R1–R9 rules,
  P1–P5 promotions) — this is a legitimately good design; finish it instead
  of replacing it.

**Data access**: one generated, typed client instead of the current ~90
hand-written per-table fetch/create/update/delete functions
(`src/lib/supabase.ts`) and a hand-maintained shadow schema (`src/types.ts`).
Generate TypeScript types from the real schema; use a single generic
query/mutation layer (e.g., PostgREST's typed client, or a thin layer like
Drizzle directly against Postgres) so a table's read/write behavior is
defined once, not once per table.

**Sync**: no offline-first engine needed (per the owner's answer) — just
correct online sync. Root-cause fixes, not new infrastructure:
- Stop dumping the entire Zustand store to `localStorage`
  (`src/store.ts:3522-3531` today has no `partialize`, so *all* server-owned
  state gets cached and re-shown stale on load). Persist only genuine
  client-local UI state; server is always the source of truth on load.
- Stop "any change → refetch the whole table" (`src/store.ts:3306-3356`
  today folds ~30 tables onto one Realtime channel and full-refetches on any
  change). Consume the actual row payload Realtime already provides and
  patch the store incrementally.
- Add a small durable write-queue for the case a write fails while
  offline/reconnecting (today it's rolled back and silently dropped —
  `src/store.ts:1284-1286`); flush the queue on reconnect. This is a modest
  addition, not a local-first sync engine.

### Stage 2 — Ingestion: kill the middlemen

Per the owner's explicit instruction, fold today's automation-chain
integrations directly into the app rather than rebuilding them as more
external automations:

- **Gmail / Google Calendar**: replace the Google Apps Script hub
  (`integrations/apps-script/Code.gs`) with a direct server-side integration
  — the backend calls the Gmail API and Google Calendar API itself (OAuth,
  refresh token held server-side) and writes straight into Postgres. No
  Apps Script, no intermediate Google Sheet.
- **Phone health/activity/screen-time/notifications**: replace
  MacroDroid/Tasker-triggered webhooks with native capability in the
  mobile client itself (see Stage 4) — direct Health Connect API access,
  native Activity Recognition + geofencing for walk detection (folding in
  what the standalone `/android` walk-tracker app does today), native
  UsageStats for screen time, and a notification listener for
  bank/wallet capture where platform-permitted. One app owns this instead
  of chaining through third-party automation apps.
- **Keep as-is** (already work well, no middleman to remove): the manual
  ABN AMRO CSV import, the Obsidian vault mirror (read-only export +
  write-via-inbox pattern over Supabase/Storage-API S3 protocol), the
  Telegram evening-digest, and the live Buurtkaart WordPress API read.

### Stage 3 — Brain: one AI/RAG system

- **One shared model-call service** (`callModel()`), used by every feature,
  with shared retry/timeout/JSON-schema validation — replacing the current
  8+ independently hand-rolled Anthropic `fetch()` call sites
  (`heyra-brain`, `categorize-vendor`, `enrich-client`, `summarize-email`,
  `draft-email-reply`, `idea-elaborate`, `idea-mvp-plan`,
  `braindump-ingest`, plus a fourth duplicate in the standalone
  braindump-worker). Anthropic Claude stays the model provider — it's
  already a good fit and the Haiku tier is already used cost-consciously.
- **One retrieval system**: pgvector inside the same self-hosted Postgres.
  Drop the separate self-hosted Cognee knowledge-graph service entirely —
  it currently requires its own dedicated Postgres instance *and* its own
  OpenAI billing, and was never actually merged with the vector search it
  ran alongside. One retrieval interface, one thing to operate, one thing
  to pay for.
- **One grounding/context-assembly module**, replacing the two independent
  implementations that exist today (`src/heyra/agents/memoryContext.ts` on
  the client, `idea-elaborate`'s own `buildGrounding()` on the server) —
  every feature that needs "relevant context from memory" calls the same
  function.
- HEYRA's existing brain-first router pattern
  (`src/heyra/router.ts` → single classification/routing call → graceful
  rule-based fallback) is the best current design in the repo and is the
  template to extend to the other, currently-independent AI call sites
  rather than starting from zero.

### Stage 4 — Client apps

- **Web**: React + TypeScript + Vite, rebuilt clean. Add real URL routing
  (the current app has none — `src/App.tsx` is a single `useState` view
  switch with no deep-linking or back-button support). Use the
  `design-demo` tokens/components as the real starting design system.
  Replace ad hoc fetch-into-store logic with a proper data-fetching/caching
  layer (e.g. TanStack Query) on top of the new typed data client; keep
  Zustand only for genuine client-only UI state.
- **Mobile**: wrap the same React codebase with Capacitor rather than
  building a separate native app or a second standalone Android APK. This
  gives one shared codebase access to native Health Connect, Activity
  Recognition/geofencing, UsageStats, and notification-listener APIs —
  exactly what's needed to retire MacroDroid/Tasker and the standalone
  walk-tracker app — while explicitly not requiring an offline-first
  architecture, matching the owner's stated needs.

---

## Tool stack (concrete)

| Layer | Choice | Why |
|---|---|---|
| Frontend framework | React + TypeScript + Vite + Tailwind + shadcn/radix | Keep — already a good, unbloated choice; adds a real router + TanStack Query |
| State | Zustand, client-UI-state only | Server data moves to a query/cache layer instead of being persisted wholesale |
| Backend | Self-hosted Postgres + PostgREST + Realtime + GoTrue + Storage API + pg_cron (Docker Compose on a small VPS) | Fully open-source, no vendor billing, keeps existing Postgres/RLS knowledge |
| Mobile shell | Capacitor wrapping the same web app | Native phone integrations without a second codebase; no offline-engine needed |
| AI model | Anthropic Claude (existing), one shared service module | Already proven fit; consolidate the plumbing, not the provider |
| RAG / retrieval | pgvector in the same Postgres | One retrieval system instead of two never-merged ones |
| Direct integrations | Gmail API, Google Calendar API called server-side | Removes the Apps Script + Sheets middle hop |
| Deployment | Frontend on a free static host (Vercel free tier is fine to keep — it's the vendor-neutral static output that matters, not avoiding Vercel specifically); backend on the VPS | Only real recurring cost is the VPS |

**Open item**: the owner mentioned having previously shared other people's
GitHub repos and Obsidian as things to potentially delegate parts of the
build to. Those specific repos aren't available in this session — worth
surfacing them again before Phase 0 so anything genuinely reusable (e.g. an
existing open-source life-OS/PKM project, self-hosted Supabase tooling, a
Capacitor Health Connect plugin) gets evaluated instead of rebuilt from
scratch. The Obsidian vault-mirror pattern already in place
(`materialize-note`, the `vault`/`vault-inbox` buckets) is good and should
be kept as-is.

---

## Execution phases

1. **Phase 0 — Foundation.** Stand up the self-hosted Postgres stack, auth,
   and a fresh schema built around the event-sourcing spine as the *actual*
   primary pattern (informed by, not copy-pasted from, the current 61
   migrations). No UI yet.
2. **Phase 1 — Brain + data proof.** Build the one shared model-call
   service, the one pgvector retrieval service, and the typed data-access
   layer against 2-3 real domains end-to-end (e.g. finance + health) to
   prove the architecture before scaling it to all 25 screens.
3. **Phase 2 — Screens.** Rebuild screens domain by domain on the new
   backend, starting from `design-demo`'s tokens/components, porting logic
   (not code) from the current app — including the recommended task-model
   consolidation.
4. **Phase 3 — Kill the middlemen.** Build the Capacitor shell; move
   Gmail/Calendar to direct API calls; move health/activity/screen-time/
   notification capture into native app code, retiring Apps Script,
   MacroDroid/Tasker, and the standalone walk-tracker APK.
5. **Phase 4 — Cutover.** Switch real daily use to the new app, migrate
   historical data from the old Supabase project, keep the old repo as
   reference until the new one has run cleanly for a while.

## Verification

This is a planning document, not a code change — there's nothing to run yet.
The plan is "verified" by the owner's review and sign-off here. Once
implementation starts (separate work, not part of this plan), each phase
above gets its own concrete verification: Phase 0 by successfully writing
and reading an event through the new stack; Phase 1 by getting a correct,
context-grounded AI answer end-to-end from real ingested data; Phase 2 by
each rebuilt screen matching its current functionality against the old app
side-by-side; Phase 3 by confirming native ingestion produces the same data
MacroDroid/Apps Script used to, then decommissioning the old pipelines.
