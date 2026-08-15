# OSLIFE v2 — Redesign & Revamp

> **Status:** Phase 0 shipped (2026-08-15). Phases 1–4 not started.
> Source study: [`docs/APP-TRUTH.md`](./APP-TRUTH.md).

## Context

`APPTRUTH.md` (field study, 2026-08-15) compared what OSLIFE *declares* against what its database
*reveals*. The finding: the app offers ~4× more surface than it carries. 26 screens, but six tables
take human writes in a normal week. Every feature that asks Rick to keep a ledger on a schedule
(habits, cleaning, workouts, hour logging, contact cadences, block completion) died within two weeks
of being built. Every feature that costs one gesture and then does its own work is still alive.

The study distilled one constitution:

> **Catch what Rick throws at it, do the work of making it useful without him, and tell him the one
> thing that matters now.**

It also named the largest gap: **capture without return**. 110 captures → 55 extractions → 45
confirmed insights, and *nothing ever gives them back*. The "tell him" half currently only fires for
money (214 of 342 notifications are `urgent_payment`).

Three decisions from Rick shape this plan:

- **Nothing gets deleted.** Everything the study cut moves behind an `Archief` flag — reachable by
  URL, absent from navigation.
- **ParkingYou gets its own surface.** 63% of tasks carry `domain='parkingyou'`, a business with no
  screen, while CRM / Projecten / Strategie HQ / Buurtkaart hold ceremonial data on prime real estate.
- **All three return modes** for captured knowledge: resurface proactively, be findable, and turn
  into action.

### The redesign is half-finished, not un-started

`docs/design.md` Part 1 describes a warm-paper, bordered, shadowed, lime-gradient app and offers a
blank "Part 2 — Redesign Template". **Both are stale.** `src/index.css` already declares RICK-OS v3 —
*"Tactile Organic Materialism"*, dark-only, `--canvas: 0 0% 4%`, flat borderless cards
(`--shadow-card: none`), inverted primary buttons, and a weight guardrail redefining
`font-bold`/`font-semibold` to 500.

What was never finished is **adoption**:

| Measure | State |
|---|---|
| v3 library `src/components/v3.tsx` (11 components) | imported by **2 of 26 views** (`Dashboard`, `Dog`) |
| `border-line` — bordered cards, contradicting the v3 flat spec | **24 of 26 views** |
| `font-bold` in markup (silently forced to 500 — the classnames lie) | 13 views |
| `src/design-demo/` (2,489 LOC at `/design-demo`) | 1 commit, 2026-07-30, never adopted |

`src/design-demo/RedesignDemo.tsx` says it plainly: *"2 of the proposed 12 screens (Homepage,
Finance) so the direction can be reviewed before the remaining 10 screens get built from this same
library."* Those 10 were never built.

**This plan does not invent a look.** The direction, tokens and component library exist. It finishes
the adoption — against a screen list 9 long instead of 26.

### Two corrections to APP-TRUTH, found in the code

1. **The Obsidian vault is not vestigial — it is live-wired.** The study lists `vaults`,
   `vault_files`, `vault_members`, `notes`, `locks` as five empty tables and recommends cutting the
   integration. **None of those tables exist in any migration.** The vault is two Supabase *storage
   buckets* (`vault`, `vault-inbox`), and `materialize-note` is invoked from three live call sites in
   `src/lib/supabase.ts`: `materializeWikiEntry()` (every Kennisbank confirm, L1147),
   `createMessageRow()` (CRM, L2296) and `createInteractionRow()` (Relaties, L2533). Cutting it would
   break the Kennisbank mirror. **Not archived in this plan.** Its `_shared/frontmatter.ts` is also
   imported by `claude-chat-ingest` and `embed-memory-backfill`.
2. **The RuneScape character screen is not a screen.** It is `CharacterTab`, rendered inside
   `src/views/Profile.tsx:326` — ~1,720 lines behind one import. It archives with Profiel's tab list,
   not with a nav entry.

### What archiving does and does not buy

Archiving is a **navigation** change, not a code change — and given the real blast radius, that is
the right trade. `habits` has consumers in 13+ files (`reflect.ts`, `graph.ts`, `character.ts`,
`blockSuggestions.ts`, four edge functions); `goals` is read by 20. Deleting either is a multi-day
refactor with real regression risk. Archiving is a one-line flag.

The honest cost: **~69k LOC stays in the tree**, `store.ts` (3,801 lines) and `lib/supabase.ts`
(3,358) keep loading archived slices, and the load batch still fetches them. Set a decision date —
re-audit **2026-09-15** (the same date the study sets for Outreach/widgets) and decide deletion then,
with read telemetry in hand.

---

## Target architecture

Three loops, matching the constitution's three clauses:

| Loop | Clause | Screens |
|---|---|---|
| **VANG** (catch) | *catch what Rick throws at it* | Vastleggen |
| **VERWERK** (digest) | *do the work without him* | none — crons, ingest, edge functions |
| **VERTEL** (tell) | *tell him the one thing that matters now* | Nu, Kennisbank |

### Navigation: 26 screens → 9 live + Archief

`src/nav.ts` declares 26 screens in 5 groups with `primary: true` on 7 — **dead metadata**, because
`mobile-bottom-nav.tsx` hardcodes its own 5 slots and never reads it. v2 makes `primary` real again.

**Bottom bar (`primary: true`):**

| Slot | Screen | Replaces |
|---|---|---|
| 1 | **Nu** | Dashboard + hero carousel + Belangrijkste vandaag + bell dropdown — *one* urgency surface |
| 2 | **Vastleggen** | unchanged — most-used feature, deliberately left crude |
| 3 | **Taken** | unchanged logic; the only growing feature |
| 4 | **Werk** | CRM + Projecten + Strategie HQ, ParkingYou-first |
| 5 | **Meer** | `AppGrid` launcher |

**In `AppGrid`, not the bar:** **Kennisbank** (the return surface — Geheugen + Kennisbank + ClaudeLog
+ Verbanden + Reflectie merged), **Geld**, **Lijf** (Gezondheid + Kyra + Locaties, machine-fed only),
**HEYRA**, **Profiel**.

**Archief** (`/archief`, absent from nav): Workout, Gewoonten, Schoonmaak, Relaties, Huis & Admin,
Noordster, Buurtkaart, Dagplanner, the tablet kiosks (`/tablet`), `/design-demo`. Plus three files
that are already unreachable dead code with **zero importers** — `src/views/{Eyes,Dakmeester,SideBusiness}.tsx`
(294 lines, never in `nav.ts`); these are the one safe outright `rm`.

Design principle 4 — *nav prominence is earned by three consecutive weeks of writes, and lost the
same way* — is what Phase 0's telemetry exists to make enforceable.

---

## Phase 0 — Make the next audit possible, and clear the surface

The study could not see reads, and half the app is read-surface: every verdict about Vitals,
Locaties, Kennisbank, Mindmap and Reflect was flagged unfalsifiable. Telemetry must land first so it
accumulates during the whole rebuild.

**0a. Read telemetry.** New `screen_views` table (`user_id, view, opened_at`, RLS owner policy), one
debounced fire-and-forget insert from `app-shell.tsx` on `view` change. Note `app_sessions` already
exists but is **MacroDroid per-app phone screentime**, not in-app navigation — it cannot carry this.

**0b. HEYRA conversation persistence.** 6,744 LOC whose usage cannot be measured; design principle 8
says instrument before extending. New `heyra_messages` table, written from `src/views/Heyra.tsx` where
the transcript is already in component state. No UI change.

**0c. The Archief mechanism.** Add `archived?: true` to the `Screen` interface in `src/nav.ts`.
`app-sidebar.tsx`, `command-menu.tsx` (both in `src/components/layout/`) and
`src/components/AppGrid.tsx` filter it out; `App.tsx`'s `Current` record keeps every entry so
`?view=workout` still resolves. One `Archief` screen lists what's parked. **No files deleted, no
tables dropped** (except 0e).

**0d. Fix the `primary` lie.** `mobile-bottom-nav.tsx` reads `SCREENS.filter(s => s.primary)` capped
at 4 + Meer, instead of its hardcoded list.

**0e. Delete the three orphans.** `src/views/{Eyes,Dakmeester,SideBusiness}.tsx`. Zero importers,
zero tables, zero risk.

**0f. Add a CI check.** `.github/workflows/` currently runs only Android/TWA/widget APK builds —
**nothing runs `npm test` or `tsc`**. Add a workflow running `npm run build && npm test` before a
refactor of this size. Also note `tsconfig.json` sets `noUnusedLocals: false`, so the compiler will
*not* flag imports orphaned by this work (exactly why the three orphans above sat unnoticed) — grep
for dangling imports by hand.

*Files:* `src/nav.ts`, `src/App.tsx`, `src/components/layout/{mobile-bottom-nav,app-sidebar,command-menu,app-shell}.tsx`,
`src/components/AppGrid.tsx`, `src/views/Heyra.tsx`, 2 migrations, 1 workflow.

---

## Phase 1 — Nu: one urgency surface

Ladder 2 is split across four competing implementations (design principle 6). `Dashboard.tsx` is
1,342 lines with a ~100-line inline IIFE building `priorities` from a dozen sources, duplicating
balance math, email importance, CRM follow-up health and task urgency that already live in libs.

**1a. Extract the selector.** Move the `priorities` IIFE (`Dashboard.tsx` ~L444–546) into
`src/lib/attention.ts` as a pure `buildAttention(state, today): DashNudge[]`. Reuse — do not
reimplement — `taskUrgency`/`focusTasksForDay` (`src/lib/taskFocus.ts`), `clientHealth`
(`src/lib/crm/followUp.ts`), `computeBalance` (`src/finance/balance.ts`), `effectiveUrgent`
(`src/finance/financeCoach.ts`), `financeInferenceNudges` (`src/heyra/proactiveNudges.ts`),
`storeNudgeToDash` (`src/components/NudgeCard.tsx`). Unit-test it — pure-logic tests are the house
style (35 test files, no jsdom, no render tests). This becomes the app's single definition of "what
matters now".

**1b. Rebuild `Nu` on the v3 library.** In order: `GreetingHeader` (one sentence — the only sentence
the design law allows) → attention feed via `PriorityList` → `focusTasksForDay` shortlist → today's
agenda from `day_blocks` (read-only: the *planning* screen archives, the calendar-fed read stays) →
money hero. Dropped from today's Dashboard: the Levensbalans radar (two of its five scores read
archived features), the Business tabs (→ Werk), the Noordster block, the habit grid.

**1c. Extend the alarm past money.** `notify-tick` already has `urgent_thread`, `urgent_followup`,
`urgent_project_blocked` — yet 63% of sends are `urgent_payment`. Verify the others actually fire.
**Bug to fix:** `urgent_payment` uses `dedupKey: p.id`, so a payment notifies **at most once ever** —
the T-3 "nadert" message claims the id and the later "te laat" message is silently suppressed.
Change to `${p.id}:${bucket}`.
`blockSuggestions.ts` takes `habitsOpen` (L58, L168–183) — make that input optional so the suggestion
drawer survives archiving habits.

*Files:* new `src/lib/attention.ts` + test, new `src/views/Nu.tsx` (replacing `Dashboard.tsx`),
`supabase/functions/notify-tick/index.ts`, `src/heyra/blockSuggestions.ts`.

---

## Phase 2 — The return path (the largest gap)

Design principle 3: *capture without return is a landfill — nothing may be added to the capture
pipeline until the existing 45 confirmed insights are surfaced back.* Rick asked for all three return
modes; they are three different mechanisms.

**2a. Findable.** `wiki_entries` is **not in `search_memory()` at all** — no embedding column, no
tsvector, one index on `(user_id, created_at)`. The one deliberately-curated thing in the app is the
one thing that cannot be searched.
- Migration: add `embedding vector(1024)`; extend `search_memory()`'s union (today
  `braindump_entries` + `interaction` + `summaries`) with a fourth branch.
- `resolveWikiEntry` (`src/store.ts` ~L3684) already calls `materializeWikiEntry` on confirm — invoke
  `embed-memory` alongside it. Backfill the 45 existing via `embed-memory-backfill`.
- Register a `wiki_entries` key in `src/heyra/contextRegistry.ts` for the `search` surface. Today
  HEYRA only sees them through the 60-fact `heyra_memory` cache, which **evicts oldest-first at
  `MAX_FACTS = 60`** (`src/heyra/learning.ts`) — the 46th insight silently pushes out the 1st.

**2b. Resurfaced proactively.** Migration adds `last_surfaced_at timestamptz`, `surfaced_count int
default 0`. A new `notify-tick` rule picks the least-recently-surfaced confirmed entry past a spacing
interval, sends `kind='insight_recall'` (`dedupKey: date`), stamps the row; the same query drives an
insight card in the Nu feed. A new `kind` needs no migration (free text) — but update the registry
comment in `20260701150000_notifications.sql`, already stale by five kinds.

**2c. Turned into action.** `findUnactionedWorkoutBraindump` (`src/heyra/proactiveNudges.ts`) is
already this mechanism, hardcoded to one keyword list. Generalise to a small rule table (workout,
content idea, client, purchase, ParkingYou) proposing *"this capture looks like a task — add it?"* in
the Nu feed. Accepting creates the task **and** writes the `braindump_links` row. That table is empty
today because its only writer is a manual dropdown buried in a detail overlay (`Capture.tsx:284`,
`Memory.tsx:609`, `ClaudeLog.tsx:155`) — a ledger action, so it never happens. Making the link a side
effect of accepting is what fills it.

**2d. Triage the landfill.** 59 of 110 captures yielded no insight and have no view. Add an
"Onverwerkt" lane to Vastleggen: `status='ready'`, no `wiki_entries` child, no `braindump_links` row.
Two actions per item — make a task, or dismiss.

**2e. Rebuild Kennisbank as the merged return surface.** Absorb Geheugen, ClaudeLog, Verbanden and
Reflectie as tabs — five Reflect screens read the same braindump/wiki/summaries substrate and only
the confirm action writes. Build from `KnowledgeCard` and `SuggestionCard`, which already exist in
`src/design-demo/components.tsx`.

> **Consolidate while here:** the wiki category list is duplicated in four places, each with a "must
> stay in sync" comment — the migration check constraint, `braindump-ingest`'s
> `VALID_LEARNING_CATEGORIES`, `integrations/braindump-worker/server.mjs`, and
> `src/heyra/learning.ts`. Three functions insert into `wiki_entries` (`braindump-ingest`, the
> worker, `claude-chat-ingest`); a fourth writer would be a mistake.

*Files:* 2 migrations, `supabase/functions/notify-tick/index.ts`, `src/store.ts`,
`src/heyra/{contextRegistry,proactiveNudges,learning}.ts`, `src/views/{Kennisbank,Capture}.tsx`,
`src/lib/attention.ts`.

---

## Phase 3 — Werk: the ParkingYou surface

One screen over "what work is owed", defaulting to ParkingYou, with domain chips for prjct /
buurtkaart / personal. Absorbs CRM, Projecten and Strategie HQ.

- **Tasks are the spine**, filtered by `Thread.domain` (`src/types.ts:152`). Clients and projects hang
  off them as context, not as the primary axis. Reuse `groupByUrgency`/`taskCounts` from
  `src/lib/taskFocus.ts` and `pickFocusedProject` from `src/components/ProjectBrowser.tsx`.
- **Drop defaults that optimise empty fields** (design principle 2): Projecten's deadline sort and
  "Achterstallig" KPI run on a field filled 3 of 51 times, so the counter is structurally always
  zero; the CRM's `FollowUpDot`/`clientHealth` engine runs on `last_contacted_at`, filled 7 of 85 —
  silently inert. Surface these as explicit "onbekend", or don't headline them.
- **Archive, don't port:** the Bureau desk layout, `PomodoroTimer`, `TimerWidget`, and hour-based
  invoicing (`project_hours` = 0 rows ever). Rick's Fiverr intake implies per-package billing, so the
  timer isn't underused — it answers a question he doesn't have.
  **Careful:** `src/lib/crm/invoicing.ts` mixes two things. `unbilledBillableHours`/`sumHours`/
  `invoiceAmountFromHours` are hour-based and go dormant; **`projectPipeline()` must survive** — it
  backs the "Nog te factureren" KPI in `src/finance/BillsTab.tsx:8`. Cutting hour-billing ≠ cutting
  `project_invoices`, which is read by Money, BillsTab, `contextRegistry` and two HEYRA action modules.
- The 45 `done` Notion imports are archive, not working data: default the list to the ~6 live rows,
  history behind a toggle.

---

## Phase 4 — Finish the v3 design adoption

Nine screens, one library, in the language `src/index.css` already ships.

**4a. Consolidate the library.** `src/components/v3.tsx` (11 components, live) and
`src/design-demo/components.tsx` (30+, unadopted) overlap — and the demo has exactly the pieces v2
needs that the live one lacks: `KnowledgeCard`, `SuggestionCard`, `NotificationCenter`, `Donut`,
`SegmentedBar`, `DetailCard`, `IconRail`, `WeekBarChart`. Promote the missing ones into
`src/components/v3.tsx`, re-tokenised from the demo's scoped `--v3-*` vars to the live
`--canvas`/`--surface`/`--sunken`/`--ink`. Then archive `/design-demo`.

**4b. Rebuild each live screen on it**, enforcing the law already written in
`src/design-demo/Framework.tsx`: *number / icon / colour first, label second, sentence never — except
the greeting.* Per screen: replace `.card border-line` with the flat `.card`, strip
`font-bold`/`font-semibold` from markup (the CSS guardrail already forces 500, so the classnames only
mislead), at most one `card-hero`, `tabular-nums` on every number.

**4c. Rewrite `docs/design.md`.** Part 1 documents a design that no longer exists; Part 2 is a blank
template for a decision already made. Replace both with one current spec. `docs/CODEBASE_MAP.md` is
also self-declared stale ("as of 28 migrations" — there are 71).

**4d. Widgets follow.** `supabase/functions/widget-summary/index.ts` aggregates dog / tasks /
**habits** / calendar; habits is archived, so that payload needs revisiting. The widgets are `[NEW]`
(2026-08-09) and explicitly not to be judged before 2026-09-15 — this is a data-shape fix, not a
redesign.

---

## Explicitly out of scope

- **Outreach, Fiverr intake, Android widgets, TWA** — all shipped within 10 days of the study; their
  empty tables are age, not failure. Re-audit after 2026-09-15.
- **The `events` spine** — 474,186 rows, 97% system mirrors, no reader. Leave it running as an audit
  log. It must not shape screens, and it is not worth a migration to remove.
- **Deleting archived features.** Archive only, per Rick's decision — with the 2026-09-15 review date
  noted above. The three zero-importer orphan files (0e) are the sole exception.
- **The Obsidian vault** — live-wired, see the correction above.

---

## Verification

- `npm run build` (`tsc -b && vite build`) and `npm test` (vitest, 35 files) after each phase. New
  logic in `src/lib/attention.ts` ships with tests. Watch the tests coupled to archived features
  (`character.test.ts`, `workout/*`, `heyra/{planner,blockSuggestions,suggestions}.test.ts`) — they
  should still pass, since archiving is nav-only. If one breaks, the archive leaked into logic.
- **Nav**: all 26 `View` ids still resolve via `?view=<id>` after Phase 0 — archiving must not 404.
  Bottom bar shows exactly the `primary` screens.
- **Return path** (worth proving end-to-end): share an Instagram link → confirm the suggested
  Kennisbank entry → verify (a) `search_memory('<term>')` returns it, (b) a `notification_log` row
  appears with `kind='insight_recall'` after the cron window, (c) it renders in the Nu feed,
  (d) accepting a task suggestion writes both a `tasks` row and a `braindump_links` row.
- **Telemetry**: confirm `screen_views` accumulates for a day, then re-run the study's
  nav-prominence test against real reads rather than writes.
- Row counts against Supabase project `nhyunnnmdcmojvkxrbpl` before/after — no phase should reduce a
  live table's count. *(Note: the Supabase MCP server is not authorized in this session; verification
  runs via the app or an authorized session.)*

## Sequencing

Phase 0 first and alone — telemetry needs to accumulate, and the nav collapse makes everything after
it easier to see. Phases 1 and 2 are the constitution's two halves and carry most of the value; 2 is
the one the study calls the single largest gap. Phase 3 is independent of 1–2. Phase 4 depends on 1–3
landing, since it rebuilds their screens. All work on `claude/oslife-redesign-plan-w71v57`.
