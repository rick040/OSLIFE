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

**Product philosophy refinement.** The owner clarified what "premium" means
beyond bug-free: the app should stop *feeling* like a data dashboard —
widgets, rings, tiles, lists you have to read and act on yourself — and
instead feel like a personal assistant / life coach / mentor that plans,
suggests, budgets, and advises toward the owner's stated goals, is
voice-driven, and — critically — treats a captured thought as something to
*act on*, not just file away. The example given: sharing an Instagram video
of a good workout routine via Capture shouldn't just get summarized as a
note; it should actually propose an update to the real workout plan.
Research into the current codebase found this is much closer at hand than
it sounds — several of the needed building blocks already exist, just
disconnected or under-surfaced (see "Interaction model" below) — so this is
a refinement of the architecture above, not a different plan.

---

## Product surface: kept in concept, pushed further in capability

25 routed screens today, grouped into 5 areas (`src/nav.ts` is the current
single source of truth). The rebuild keeps this product surface — but
"keeps" means keeps the *concept*, not the current ceiling. Per the owner's
direction, each area below is rebuilt to actually do more, using the new
brain/goal-linked infrastructure, not just cleaned-up plumbing behind
today's version. These are proposals to react to, not locked decisions —
final call per screen happens during detailed design.

### Surface (daily use)

| Screen | Today | Rebuilt to |
|---|---|---|
| Dashboard | Static widgets + occasional rule-based sentences | Leads with an automatic, goal-aware briefing (see Interaction Model) that also calls out budget pace and spending-vs-goal, not just overdue items |
| Tasks | Manual kanban you triage yourself | Assistant actively proposes re-prioritization/re-scheduling based on goals and capacity ("3 things due Friday, a light Tuesday — move one?"), always via the confirm mechanism, never silently |
| Day Planner | AI fills calendar gaps around fixed events | Also accounts for actual physical state (sleep debt, recent energy dips already computed by Reflect) when proposing a day, not just gap-filling |

### Life

| Screen | Today | Rebuilt to |
|---|---|---|
| Health/Vitals | Displays steps/sleep/HR/energy as charts | The correlation engine (already built, currently passive charts you have to read) becomes proactive coaching: concrete cause→suggestion callouts ("3 low-energy days followed <6h sleep — want an earlier bedtime nudge tonight?"); gains a nutrition dimension (new domain, see "Pushing further") logged via the same capture pipeline as workouts |
| Workout | Manual CRUD + a rule-based random plan generator | Capture-driven plan evolution (Interaction Model) *plus* the plan adapts itself from real `workout_sets` history over time (progressive-overload suggestions), not only from captures |
| Habits + Cleaning | Two independently-built gamification systems (separate points/streaks) | One shared streak/motivation layer; both surfaced through the assistant's coaching language instead of two separate score widgets |
| Money | Transaction tracking + a subscriptions list | Real budgeting: spending-pace forecasting, category-norm deviation alerts, explicit ties to North Star savings goals ("this pace puts you €X over budget for [goal]") — the "budget things" the owner specifically asked an assistant to do — plus net worth over time and a runway/affordability model (new, see "Pushing further"), linked to Strategy HQ's business ideas |
| Dog (Kyra) | Manual log + a passive AI-advice panel | The existing vet-visit inference rule (R1) and health-condition promotion (P1) get surfaced proactively in the coaching briefing, instead of sitting as history you have to check |
| Locations | Standalone visited-places map, a dead end today | Feeds a lightweight signal into Reflect (time-away-from-home vs. mood/energy) instead of being read-only |
| Relationships | Manual interaction log | Gets the same overdue-follow-up nudge pattern CRM already has for clients (R9-style), applied to personal relationships — today that pattern is CRM-only |
| Home & Admin | Renewal reminder only (R4) | "Admin autopilot": near a cancellation/notice deadline, the assistant can draft the actual email for you to confirm and send, not just remind you it's coming |
| Inbox | Already curated by default (see Interaction Model) — the template the other raw-list screens above generalize from | |
| North Star (goals) | Static goal + milestone progress bars | Becomes the anchor every other domain's suggestions are checked against — nudges/briefings explicitly cite which goal they serve, or flag when something works against one |
| Profile | AI-synthesized identity, display-only | Becomes an actual input: the assistant's coaching tone/style calibrates off it, instead of just showing it back to you |

### Business

| Screen | Today | Rebuilt to |
|---|---|---|
| CRM | Follow-up-health list buried below KPI tiles/charts | That prioritized "who needs follow-up" list becomes the actual home view (curate-by-default), with draft-reply proposals surfaced inline the same way Gmail already gets them |
| Projects | Searchable/sortable grid you scan yourself | The existing stall-detection rule (R7) surfaces at-risk projects proactively in the briefing, instead of sitting as a tile you have to notice |
| Strategy HQ | Idea capture + on-demand elaboration/MVP plan | Ideas link back to North Star goals; the existing theme-detection rule (R12, clusters repeated braindumped ideas) proactively resurfaces stalled ones ("you've mentioned X three times — revisit it?") instead of only reacting to a manual "elaborate" tap |
| Buurtkaart / Eyes / Dakmeester | Side-business admin templates | Mostly consolidation (see below), not expansion — lower priority |

### Intake

| Screen | Today | Rebuilt to |
|---|---|---|
| HEYRA | Chat assistant, 12 agents | Becomes the umbrella surface for the unified propose→confirm→apply system (Interaction Model) — one place to both ask and act |
| Capture | Text/link/image/video → note + optional wiki suggestion | Generalized so any capture can propose a structured change to any domain (Interaction Model), reachable from anywhere (share sheet, global voice), with the assistant proactively following up on captures left unprocessed |

### Reflect

| Screen | Today | Rebuilt to |
|---|---|---|
| Memory / Kennisbank / Reflect / Mindmap | Four separate screens over largely the same underlying correlation/knowledge data | Become the *drill-down* detail behind a direct "why did you suggest that" query in chat, rather than four places you have to separately check to piece a pattern together |

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

## Interaction model: assistant-first, not dashboard-first

This is the connective tissue between the "Brain" and "Screens" stages
below — the redesign isn't just a cleaner dashboard, it's a different
primary interaction pattern. Research confirms real building blocks for
this already exist in the current app, just fragmented or buried:

- **A capture already can produce a structured suggestion — just the wrong
  kind.** `braindump-ingest` already classifies captured content (including
  Instagram links) with Claude and, when it spots something like "an
  interesting approach/tool/strategy," inserts a `suggested` row into
  `wiki_entries` for the owner to confirm — but confirming only ever
  produces a `LearnedFact`, never a change to a real domain table like
  `workout_plans`. Meanwhile the app already has a genuinely capable
  confirm-gated "propose a write into a *different* domain table" mechanism
  — `confirm_inference()` in the inference engine (e.g. a recurring
  transaction pattern proposes, and on confirm creates, a real
  `subscriptions` row). And the Workout screen's `GeneratePlanModal` already
  has a generate → preview → reroll → commit UI whose data shape
  (`GeneratedDay`/`GeneratedExercise`) is exactly what an AI-derived plan
  draft needs. **The rebuild wires these together**: extend the
  classification step so a capture that implies a concrete change to an
  existing domain record (a workout plan, a goal, a budget cap) produces a
  confirm-gated structured proposal via the same effect-per-type convention
  `confirm_inference()` already uses, rendered through the existing
  preview/commit UI for that domain (Workout's modal, or a generalized
  version of it) rather than only ever becoming a note.
- **Unify the three separate "propose → confirm → apply" mechanisms that
  exist today** into one convention with one confirm surface: chat's
  `heyra/actions` `ActionCard` system (client-side, single-turn), the SQL
  inference engine's `confirm_inference()` (server-side, async/batched,
  cross-domain, confidence-scored), and the braindump→`wiki_entries`
  suggestion flow. They currently share no code. The rebuild keeps the
  async/server-side inference-engine pattern as the canonical mechanism for
  anything not happening inside a live chat turn (captures, background
  inference, nudges-that-can-be-acted-on) — since it's already the most
  mature and already crosses domains — and reuses one shared confirm/diff
  UI component (in the spirit of today's `ActionCardView`) everywhere a
  proposal needs a yes/no from the owner, whether it surfaced from chat, a
  capture, or a background rule. Not every proposal ends up needing that
  yes/no, though — see the trust ladder below.
- **Voice becomes first-class, not a feature buried in one screen.** Voice
  input exists today only via the browser's native Speech API, only inside
  the HEYRA chat screen — no global entry point, and there is no voice
  *output* anywhere in the app (zero text-to-speech). The rebuild adds a
  global voice entry point reachable from anywhere (not just one chat
  screen) and adds TTS so the assistant can actually talk back, not just
  render markdown bubbles — necessary for the app to feel spoken-to rather
  than typed-at.
- **The home screen leads with the assistant's voice, not a widget grid.**
  Today's Dashboard already computes several rule-based, templated
  sentences (a nudge, a "hero" vitals sentence, a weakest-life-domain
  callout) *and* separately has a real LLM-authored proactive briefing
  generator (`briefingAgent.ts` — gathers the day's real facts and writes a
  short, prioritized, natural-language summary) — but that briefing agent
  only runs when the owner explicitly asks for it in chat; it never
  surfaces automatically, and it sits alongside ~10 other stacked
  widget/chart/ring sections rather than leading them. The rebuild makes
  that proactive, LLM-authored briefing (upgraded to genuinely
  coach/mentor-toned language — tied explicitly to the owner's stated goals
  from North Star, not just "what's overdue") the lead content of the home
  screen, generated automatically, with the supporting data (rings, charts,
  tiles) available on demand underneath rather than presented as ten equal
  peer widgets.
- **Curate by default; raw data is a drill-down, not the front door.**
  Inbox already proves this pattern works: it doesn't show a raw inbox — it
  classifies importance into three tiers, summarizes emails on demand, and
  leads with a synthesized "Highlights" digest of takeaways/reminders.
  Research found Money's transaction/bill/subscription tabs and Projects'
  searchable grid are the most "browse-a-database" screens left, with CRM
  in between. The rebuild generalizes Inbox's pattern to those screens: a
  synthesized, prioritized "what needs your attention / what I'd suggest"
  view is the default, with the full list/table one tap away for whenever
  the owner actually wants to browse — not removed, just no longer the
  default way of encountering the data.

---

## Pushing further: from reactive tool to proactive coach

Everything above still assumes the owner opens the app and the assistant
reacts. Pushing further means the assistant also initiates, earns the right
to act without asking every time, and reasons across domains as its default
mode rather than as a special chart you go find.

### Proactive cadence, not just reactive
The assistant should run a real coaching rhythm, not just answer when
asked: the automatic morning briefing (already planned) gets a matching
quick evening check-in ("how did today go against what I proposed?"), a
real weekly review (goal progress, budget pace, what got confirmed vs.
rejected and why), and a monthly retro — mirroring the cadence
`run_self_audit()` already runs on the backend, just turned into something
the owner actually hears from. The existing Telegram digest is already the
delivery channel for inference approvals — extend it into the assistant's
regular voice for this rhythm, not just an approval queue. And it should be
able to start a conversation, not only finish one it was handed — noticing
a new pattern and opening with "I noticed X, want to talk about it?" rather
than waiting to be asked.

### A trust ladder, not one confirm-everything gate
Treating every proposal identically (always tap to confirm) doesn't scale
to "acts like an assistant." Extend the inference engine's existing
≥0.85-confidence auto-commit idea into a general three-tier trust ladder,
based on confidence *and* how reversible/consequential the action is:
- **Auto-apply, silent** — low-stakes, fully reversible (log a detected
  walk, tag a vendor, add an exercise to a draft plan).
- **Auto-apply, visible undo window** — medium-stakes (create a task,
  adjust a budget category, log a meal from a capture).
- **Always confirm** — external or hard-to-reverse (send an email, create
  an invoice, cancel a subscription, commit a workout-plan change).

Confidence and stakes decide the tier together, not a single global rule,
and any action type can be manually pinned to a stricter tier if it gets
something wrong — the ladder should be able to demote itself per action
type from real feedback (the existing rule-suppression/learning-loop
mechanism already does exactly this for background inferences; extend the
same idea to tier assignment).

### Cross-domain synthesis as the default lens, not a chart you go find
Reflect's correlation engine exists today as a screen you have to visit.
Push further: make cross-domain synthesis the way the coaching briefing
reasons by default — not "here's finance, here's health" as separate
sections, but "your deadline stress this week lines up with two skipped
workouts and higher spending — here's one thing that'd help all three."
That's a real escalation from *showing* correlations to *reasoning across*
them and proposing one intervention — the part a dashboard structurally
can't do and a coach does by default.

### One consistent assistant persona, not 12 prompts
Today's 12+ HEYRA agents and 8+ independent edge functions each carry their
own system prompt and tone. Stage 3's brain unification already collapses
the plumbing — push further and collapse the *voice* too: one persona,
calibrated from Profile, consistent whether it's the morning briefing, a
chat reply, an email draft, or a Telegram digest, so it reads as one mentor
across every surface instead of a different assistant per screen.

### Two domains worth adding outright, because the pattern already fits
Not scope creep — these reuse mechanisms already planned above, just not
yet pointed at these targets:
- **Nutrition.** Health coaching is incomplete without it. A photo of a
  meal, captured the same way a workout video already is, gets classified
  and logged as structured nutrition data through the same
  capture→propose→confirm pipeline — no new mechanism, just a new domain
  it writes into.
- **Net worth / financial trajectory.** Money today only tracks
  transactions and subscriptions. Add net-worth-over-time and a simple
  runway/affordability model — directly useful for someone weighing when
  they can afford to go full-time on a side business — feeding off the
  same budget-forecasting work already planned for Money, and linking to
  Strategy HQ's business ideas.

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
- **One propose → confirm → apply convention**, replacing today's three
  disconnected versions of it (chat `ActionCard`s, `confirm_inference()`,
  the wiki-suggestion flow) and extended so captures can propose structured
  changes to *any* domain table, not just knowledge-base facts — see
  "Interaction model" above for the concrete workout-plan example.

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
- **Voice + assistant-led home screen**: add TTS output and a global voice
  entry point (today voice input only exists inside the HEYRA chat screen,
  and there is no voice output at all); rebuild the Dashboard around an
  automatically-generated, goal-aware briefing as the lead content rather
  than a stack of widgets, with supporting data available on demand — see
  "Interaction model" above.

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
   service, the one pgvector retrieval service, the typed data-access
   layer, and the unified propose → confirm → apply mechanism, end-to-end
   against a real cross-domain case before scaling to all 25 screens.
   Concrete proof target: capture a workout-video-style note and have it
   produce a real, confirm-gated proposed change to a workout plan —
   because it exercises ingestion, brain, structured proposal, and UI
   confirmation together, and is the owner's own headline scenario for
   what "actually works" means here.
3. **Phase 2 — Screens.** Rebuild screens domain by domain on the new
   backend, starting from `design-demo`'s tokens/components, porting logic
   (not code) from the current app, and building each screen to the
   expanded capability set in "Product surface" above — not just its
   current functionality — including the task-model consolidation, the
   assistant-led Dashboard, generalizing Inbox's curated-by-default pattern
   to Money/Projects/CRM, the trust-ladder tiering for auto-apply vs.
   confirm, and the two new domains (Nutrition, Net worth).
4. **Phase 3 — Kill the middlemen.** Build the Capacitor shell; move
   Gmail/Calendar to direct API calls; move health/activity/screen-time/
   notification capture into native app code, retiring Apps Script,
   MacroDroid/Tasker, and the standalone walk-tracker APK.
5. **Phase 4 — Proactive cadence + persona.** Layer in the assistant-
   initiated rhythm (evening check-in, weekly review, monthly retro over
   the existing Telegram digest channel) and the single consistent
   persona across briefing/chat/email-drafts/digests, once the reactive
   core (Phases 1-3) is solid enough to trust with initiative.
6. **Phase 5 — Cutover.** Switch real daily use to the new app, migrate
   historical data from the old Supabase project, keep the old repo as
   reference until the new one has run cleanly for a while.

## Verification

This is a planning document, not a code change — there's nothing to run yet.
The plan is "verified" by the owner's review and sign-off here. Once
implementation starts (separate work, not part of this plan), each phase
above gets its own concrete verification: Phase 0 by successfully writing
and reading an event through the new stack; Phase 1 by capturing a real
workout-video-style note and confirming it produces a correct, reviewable
proposed change to a real workout plan end-to-end; Phase 2 by each rebuilt
screen matching its current functionality against the old app side-by-side,
plus the Dashboard/Inbox/Money/Projects/CRM curated-default views actually
surfacing correct, non-hallucinated priorities; Phase 3 by confirming
native ingestion produces the same data MacroDroid/Apps Script used to,
then decommissioning the old pipelines; Phase 4 by auto-apply tiers never
firing on anything the owner would have rejected (checked against the same
confirm/reject history the trust ladder itself is tuned from) and the
weekly/monthly rhythm actually landing on schedule; Phase 5 by a real
side-by-side period where the new app is trusted for daily use before the
old one is retired.
