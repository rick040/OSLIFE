# APP-TRUTH — OSLIFE

*Field study date: 2026-08-15 · Code at `8f80cd2` · 429 commits (2026-06-23 → 2026-08-13) · 73 Postgres tables · Supabase project `nhyunnnmdcmojvkxrbpl`*

---

### Method and its limits — read this before trusting anything below

Three evidence bodies were used: the codebase (declared intent), the Supabase database (revealed
behaviour), and the full git history (biography). All row counts, fill rates and write dates are
live `SELECT`s taken on 2026-08-15. Nothing was modified.

Four limits, stated up front because they bound every conclusion:

1. **This app is seven and a half weeks old.** First commit 2026-06-23, first data 2026-06-01
   (backfilled). "Abandoned after two weeks" is a real pattern here, but it is a pattern observed
   over a short life. A habit that dies in month two sometimes returns in month four.
2. **I can only see writes, never reads.** There is no analytics, no screen-view log. A read-only
   screen — Vitals, Mindmap, Kennisbank, Reflect, Locaties, Dashboard — could be opened every
   morning and leave zero trace in this analysis. **Where a screen's value is in looking, not
   logging, absence of rows is not evidence of disuse.** Every such verdict below is flagged.
3. **Anything built after ~2026-08-05 cannot be judged yet.** Outreach (2026-08-06), the Android
   widgets (2026-08-09), the Fiverr intake (2026-08-09) have empty or near-empty tables because
   they are days old, not because they failed. They are marked NEW, not vestigial.
4. **`events` is a mirror, not a signal.** 474,186 rows, 97% written by an `emit_event()` trigger
   that snapshots other tables. Its size says nothing about engagement, and it is excluded from
   every engagement count below.

---

## 1. Field Notes

OSLIFE is a single-user life-management system: one Dutch-language React PWA over a Supabase
Postgres, plus 46 edge functions, 7 cron jobs, two Android apps and a set of home-screen widgets —
roughly 69,000 lines written in seven and a half weeks. It presents 26 screens grouped into five
declared layers (Surface, Life, Business, Intake, Reflect), spanning health, money, a client CRM,
projects, habits, cleaning, the dog, workouts, locations, contacts, business strategy and a
personal knowledge base. Underneath, an "event spine" mirrors every table into an append-only log,
an inference engine promotes patterns into facts, and an assistant named HEYRA reads it all through
a RAG layer. Most of the data arriving each day is not typed by hand: it is pushed in by MacroDroid
phone automations, bank CSV imports, Gmail sync, geofences and calendar sync. What the owner
actually touches daily is much narrower than what the app offers.

---

## 2. Inventory

Classification is by **write behaviour**. `[read-surface]` marks screens whose value is in looking,
where low writes are not evidence of disuse (see method note 2). `[NEW]` marks anything under ~10
days old, which cannot yet be judged.

| Screen / feature | Purpose | UI prominence | Backing table(s) | Class | Evidence |
|---|---|---|---|---|---|
| **Vastleggen (Capture)** | One-tap capture of links, text, voice | `primary` (mobile bar) + share target + widget + Telegram | `braindump_entries` | **LOAD-BEARING** | 110 rows, 25 active days, writes in **every** week since built; last 2026-08-15 |
| **Kennisbank** | Confirm AI-extracted takeaways | Reflect group | `wiki_entries` | **LOAD-BEARING** | 55 rows, 45 confirmed (82% of suggested), last 2026-08-15 |
| **Taken** | Task list | `primary` | `tasks` | **LOAD-BEARING**, *growing* | 56 rows; per-week 1 → 10 → 24 → 21; last 2026-08-14 |
| **Geld** | Bank tx, budget, bills | `primary` | `finance_tx`, `payments`, `vendor_tags` | **LOAD-BEARING** (machine-fed) | 667 tx / 26 payments / 114 vendor tags, last 2026-08-15 |
| **Notifications** | Telegram push | not a screen | `notification_log` | **LOAD-BEARING** (machine) | 342 sends over 38 days; **214 = `urgent_payment`** |
| **Gezondheid (Vitals)** | Sleep, steps, screen time | `primary` | `health_*`, `screentime*`, `phone_events` | **LOAD-BEARING** (machine-fed) `[read-surface]` | 8,311 screentime events, 1,509 phone events, last 2026-08-15 |
| **Dagplanner / Vandaag** | Plan and complete the day | `primary` (Dashboard) | `day_blocks` | **LOAD-BEARING write, DEAD loop** | 281 blocks, but **261 still `planned`, 17 `done`, 3 `skipped`** |
| **Dagelijkse check-in** | Energy + mood sliders | Dashboard | `daily_checkin` | **LOAD-BEARING, thin** | 25 rows over 25 distinct days (~half of all days); `note` filled **0/25** |
| **CRM / Klanten** | Client register | `primary`, `wide` | `clients`, `client_messages` | **CEREMONIAL** | 85 clients but **1 email, 7 `last_contacted_at`, 3 research notes**; 495 of 529 messages arrived in one bulk import |
| **Projecten** | Project register | Business, `wide` | `projects`, `project_tasks` | **CEREMONIAL** | 51 projects, **45 are `done` Notion imports**; only **3 have a deadline**; 20 tasks |
| **Kyra (Dog)** | Dog log + walks | Life | `dog_log`, `walks` | **DECAYING** | 107 logs / 48 walks; per-week 18→1→1→28→35→24→**0**; nothing since 2026-08-08 |
| **Locaties** | Visited places | Life `[read-surface]` | `location_checkins`, `location_visits` | **LOAD-BEARING** (machine, geofence) | 227 / 139 rows, last 2026-08-15 |
| **Strategie HQ** | Business ideas → plans | Business | `business_ideas` | **CEREMONIAL** | 8 ideas, **7 still status `idea`**, 1 active; 1,496 LOC — the largest single view |
| **Schoonmaak** | Cleaning schedule | **`primary` (mobile bar)** | `cleaning_log` | **CEREMONIAL** | 26 rows across 6 days, 2026-07-21 → **2026-07-30**; dead 16 days |
| **Workout** | Plans, sessions, sets | Life + tablet kiosk | `workout_*` | **CEREMONIAL** | 5 plans, 15 exercises, **3 sessions**, 36 sets; dead since 2026-08-07; 852 LOC + kiosk |
| **Gewoonten (Habits)** | Habit tracker | Life | `habits`, `habit_log` | **ASPIRATIONAL** | 5 habits, **8 log rows in 6 weeks** (2,2,0,3,0,1,0 per week) |
| **Noordster** | Goals + milestones | Life | `goals`, `goal_milestones` | **ASPIRATIONAL** | 6 goals, **0 milestones** — despite PR #154 explicitly fixing milestone persistence |
| **Relaties** | Contact rolodex | Life | `person`, `interaction`, `person_connection` | **CEREMONIAL** | **2 people**, 7 interactions, 1 connection; dead since 2026-07-26; built over 5 PRs incl. 3 Instagram-scraping edge functions |
| **Profiel** | Self-model interview | Life | `identity_profile`, `profile_facts` | **LOAD-BEARING, single-row** | 1 profile (13KB of JSON), **updated 2026-08-15**; 8 profile facts, last 2026-07-30 |
| **HEYRA** | Assistant + RAG | Intake | `heyra_memory` | **USED, UNMEASURABLE** | 60 learned facts (18KB), updated 2026-08-13. **Conversations are never persisted** — 6,744 LOC and 46 commits leave one row of trace |
| **Geheugen / Reflectie / Verbanden** | Memory, reflection, graph | Reflect `[read-surface]` | `summaries`, `events` | **LOAD-BEARING** (machine) `[read-surface]` | 36 summaries over 33 days (nightly cron), last 2026-08-15 |
| **Huis & Admin** | Household admin | Life | `admin_item`, `admin_document` | **ASPIRATIONAL** | **0 rows in both**, 4 commits, dead since 2026-07-23 |
| **Inbox** | Smart email organizer | Life | `gmail_messages` | **LOAD-BEARING** (machine) `[read-surface]` | 1,181 messages, last 2026-08-15 |
| **Buurtkaart** | Geldrop neighbourhood | Business | — | **UNKNOWN** `[read-surface]` | No dedicated table; 331 LOC; dead in git since 2026-07-22 |
| **Bureau / Desk kiosk / Pomodoro** | Focused work + hour logging | Projects & CRM toggle, `/tablet` | `project_hours` | **VESTIGIAL** | **0 rows.** 731 LOC of desk UI + `invoicing.ts` hour-billing logic. Not one hour ever logged |
| **Obsidian vault sync** | Vault ↔ app bridge | none | `vaults`, `vault_files`, `vault_members`, `notes`, `locks` | **VESTIGIAL** | **0 rows in all five**, 2 migrations, 1 PR |
| **Outreach** | Campaign → leads → emails | Strategie HQ | `leads`, `outreach_targets`, `outreach_emails` | **`[NEW]`** | 0 rows; shipped 2026-08-06 — too young to judge |
| **Fiverr intake** | Auto-draft client + project | none (cron) | `service_packages` | **`[NEW]`** | 0 packages, 1 draft project; shipped 2026-08-09 |
| **Android widgets** | Home-screen surfaces | outside the app | reads only | **UNMEASURABLE** `[NEW]` | 2,734 LOC, 11 PRs in one day (2026-08-09); no read telemetry exists |
| **The Eyes / Dakmeester / SideBusiness** | Side-business dashboards | **none — unreachable** | — | **VESTIGIAL** | 294 LOC, **zero importers**, absent from `nav.ts`; last touched 2026-07-20 |
| **Event spine** | Append-only mirror | none | `events`, `type_registry` | **VESTIGIAL as a product** | 474,186 rows, 97% `source='system'`; `type_registry` frozen since 2026-07-24; no screen reads it |

**Empty tables (17):** `admin_document`, `admin_item`, `braindump_links`, `budget_rules`,
`card_templates`, `goal_milestones`, `health_condition`, `leads`, `locks`, `notes`,
`outreach_emails`, `outreach_targets`, `project_hours`, `service_packages`, `vault_files`,
`vault_members`, `vaults`.

**Single-row tables (11):** `app_settings`, `balance_checkpoints`, `brain_state`, `heyra_memory`,
`identity_profile`, `investment_holdings`, `medications`, `notification_prefs`,
`person_connection`, `project_activity`, `trigger_rules`.

---

## 3. Biography of the Build

Commits per week: W26 **61** · W27 **91** · W28 **4** · W29 **62** · W30 **140** · W31 **28** ·
W32 **40** · W33 **3**.

**Act I — Scaffolding (2026-06-23 → 07-05, ~150 commits).** Repo created by upload, then three
Supabase projects in four days (`xdykcdz…` → `lgwowurh…` → the current `nhyunnnm…`) before the
schema settled. Six screens land in a single day (2026-06-26) as literal "Fase 1–6" commits: HEYRA,
CRM, Money, Habits, Kyra, and the business screens (Strategie HQ, Buurtkaart, **The Eyes,
Dakmeester**). Mock data is stripped, auth added, shadcn adopted. The Eyes and Dakmeester are never
wired into navigation — **they are stillborn on day four and still in the tree.**

**Act II — First silence (07-06 → 07-10).** Five days, zero commits. The first real pause.

**Act III — The spine (07-11 → 07-15, ~37 commits).** The most architectural stretch: `event_spine`,
`inference_engine`, `learning_loop`, `memory_retrieval`, `memory_embeddings`, `app_sessions`. This
is where `docs/DATA-ARCHITECTURE.md` ("het datamodel is het product") is enacted. Six migrations in
two days build the substrate that today has no reader.

**Act IV — The great expansion (07-19 → 07-30, ~200 commits, peak 37 on 07-22).** The largest and
most consequential burst. In roughly ten days: Braindump capture, Obsidian vault sync, the Inbox
organizer, wiki/Kennisbank, the finance redesign, tasks, the Relaties rolodex with Instagram
scraping, the Profiel self-model, Workout, walks, the tablet kiosks, the desk/Pomodoro layout, the
first Android widget, and the homescreen rebuild "around one attention feed instead of 13 scattered
sections" (#135). **Almost everything built in this burst is now ceremonial — Relaties (2 rows),
Workout (3 sessions), Cleaning (dead 07-30), the vault (0 rows), Pomodoro (0 hours). The one
exception, Braindump/Kennisbank, is the only thing still written to every week.**

**Act V — Money and urgency (07-30 → 08-05, ~48 commits).** A tight, corrective run: context
registry, milestone persistence (#154), then eight consecutive finance fixes — internal transfers,
IBAN detection, budget accuracy, the finance coach, payment urgency. Then in one day (08-05): the
gamified RuneScape character screen (#175, #176), the dashboard redesign (#177), the Bureau desk
layout (#179, #180) and Taken rebuilt around urgency (#182). **The character screen was built and
never touched again.**

**Act VI — Off the web (08-06 → 08-13, ~43 commits).** Outreach schema, then eleven PRs in a single
day (08-09) building, splitting, debugging and redesigning the Android widgets, plus a TWA wrapper
and the Fiverr intake pipeline. The last two weeks of energy went **outward** — to surfaces outside
the app, and to a pipeline that creates work without being asked.

**Cadence of revision.** Files touched most: `Dashboard.tsx` (36 commits), `Money.tsx` (24),
`Heyra.tsx` (20), `Memory.tsx` (19), `Vitals.tsx` (19). Files built once and abandoned:
`ShareIntake.tsx` (1), `ClaudeLog.tsx` (1), `Cleaning.tsx` (2), `Locations.tsx` (2),
`PersonDetail/PersonForm` (2 each), `src/graph` (1 commit, 2026-07-03), `src/cleaning` (1 commit,
2026-07-14). **Enthusiasm that was never revisited is the norm, not the exception: 9 of 37 view
files have ≤2 commits.**

---

## 4. The Implied User

**The person the artifacts assume.** Someone who opens the app in the morning to a dashboard of
energy, sleep, steps, balance and today's plan; builds their day into blocks and marks each one
done; logs habits against a schedule; records cleaning tasks on a rotation; logs workout sets at the
gym on a wall-mounted tablet; starts a Pomodoro timer when they sit down to client work and bills
the hours it accrues; maintains a CRM of 85 clients with contact dates and follow-up cycles; keeps
a rolodex of people with cadences and birthdays; sets goals with milestones and watches a quest log
level up. The cadence this presupposes is **daily, scheduled, and self-maintained** — the app is a
set of ledgers, and the user is their bookkeeper.

**The person the data shows.** Someone who touches the app on **6–7 days of every week** — that
part of the assumption holds, and it has held for four straight weeks. But what they do in those
touches is almost entirely one of four things: **share an Instagram or YouTube video into it**
(92 of 110 captures), **confirm a takeaway the AI extracted** (45 confirmations), **add or close a
task** (56, and rising), and about half the time, **drag two sliders** for energy and mood. They
never write the check-in's note field (0/25). They mark 6% of their planned day-blocks done. They
have logged eight habit entries in six weeks and zero billable hours ever.

**The divergence.** The assumed cadence is *scheduled discipline*; the actual cadence is *reactive
one-tap*. Every feature that requires Rick to maintain state on a rhythm — habits, cleaning,
workouts, hour logging, contact cadences, block completion — is dead or dying within two weeks of
being built. Every feature that takes a single gesture in the moment it occurs, and then does its
own work in the background, is still alive. The app was designed for a bookkeeper. It is used by
someone throwing things over a wall and expecting the other side to sort them.

---

## 5. Contradictions

1. **Declared:** Schoonmaak is one of only seven screens flagged `primary` in `src/nav.ts` — it
   occupies the mobile bottom bar. → **Revealed:** `cleaning_log` holds 26 rows across 6 days and
   has not been written to since 2026-07-30. → *The most valuable real estate in the app is
   allocated to its deadest feature. Placement was decided by intention, never revisited by use.*

2. **Declared:** A Pomodoro timer (`PomodoroTimer.tsx`), a desk kiosk, a `TimerWidget`, a
   `project_hours` table and hour-based invoicing (`invoicing.ts`, `unbilledBillableHours`) —
   ~731 LOC of desk UI plus tested billing logic. → **Revealed:** `project_hours` = **0 rows**. →
   *An entire billing model was built for a business that has never once billed by the hour. The
   feature answers a question Rick doesn't have.*

3. **Declared:** Projecten sorts by deadline by default and headlines an "Achterstallig" (overdue)
   KPI. → **Revealed:** 3 of 51 projects have a deadline; 45 are `done` Notion imports. → *The
   default view optimises for a field that is 94% empty. The overdue counter is structurally always
   zero.*

4. **Declared:** A client follow-up health system — `clientHealth()`, `FollowUpDot`,
   `follow_up_cycle_days` defaulting to 30, red/yellow surfacing on the Dashboard. → **Revealed:**
   7 of 85 clients have `last_contacted_at`; 1 has an email. → *The follow-up engine runs on a field
   nobody fills, so it is silently inert. The CRM is an address book pretending to be a pipeline.*

5. **Declared:** The Dagplanner was rebuilt five times (#115, #117, #119, #123, #140), including
   "blocks now auto-miss instead of staying stuck, and completions actually persist". →
   **Revealed:** 261 of 281 blocks are still `planned`; 17 `done`; **0 `missed`**. → *Five rounds of
   iteration on the completion loop, and the completion loop is not used. The auto-miss fix has
   produced no misses — which means the mechanism isn't running, or nothing is ever planned in the
   past. Either way, the fix is unverified in production.*

6. **Declared:** The feature is named *Braindump* and *Vastleggen* — thought capture. →
   **Revealed:** 92 of 110 entries are Instagram (60) or YouTube (32) links; 15 are text; 1 audio. →
   *It is not a braindump. It is a read-later pipeline for other people's video content, with an AI
   summariser attached. It is also the single most-used feature in the app.*

7. **Declared:** `daily_checkin` offers energy, mood **and a free-text note**. → **Revealed:**
   energy 25/25, mood 25/25, note **0/25**. → *The two-second interaction is used every time; the
   ten-second one is never used. This is the whole thesis of the app in one row.*

8. **Declared:** Tasks gained a checklist (migration `20260725030000_tasks_checklist`) and a
   `focus_date` (#182, "Rebuild Taken around urgency"). → **Revealed:** checklist filled on **0 of
   56** tasks; `focus_date` on 6. → *Structure was added to the one feature that was already
   working. It was not adopted. Taken grew because the list grew, not because the structure helped.*

9. **Declared:** HEYRA — 6,744 LOC across ~25 modules, 46 commits, a context registry, RAG,
   embeddings, a cognee knowledge graph, action handlers, and tests. → **Revealed:** conversations
   are **not persisted anywhere**; the entire subsystem's durable trace is `heyra_memory` — one row,
   60 facts, 18KB, updated 2026-08-13. → *The most heavily engineered subsystem in the app is also
   the only one whose usage cannot be measured. It is evidently used (the facts are recent and
   accumulating), but Rick has built an assistant that forgets every conversation it has.*

10. **Declared:** `docs/DATA-ARCHITECTURE.md` states "het datamodel is het product; elk scherm is
    een view erop" — an append-only event spine, universal envelope, inference-with-confirmation. →
    **Revealed:** `events` holds 474,186 rows of which 97% are `system` mirrors; `type_registry` has
    been frozen since 2026-07-24; **no screen queries `events`**. → *The most principled piece of
    architecture in the repository serves no reader. It was built as a foundation and became a
    basement.*

11. **Declared:** PR #154, "Persist North Star milestones — **the most severe finding from the data
    audit**". → **Revealed:** `goal_milestones` = 0 rows, sixteen days later. → *A prior audit
    identified this, a fix shipped, and the table is still empty. The problem was never that
    milestones didn't persist. It was that Rick doesn't write milestones.*

12. **Declared:** Obsidian vault integration — 2 migrations, a PR, `vault-inbox-sync` and
    `materialize-note` edge functions. → **Revealed:** `vaults`, `vault_files`, `vault_members`,
    `notes`, `locks` — **all 0 rows**. → *A two-way bridge was built to a second brain that was
    never connected.*

13. **Declared:** Relaties, rebuilt as a rolodex over five PRs including three edge functions for
    scraping Instagram profiles and Pinterest thumbnails. → **Revealed:** 2 people. → *Days of work,
    including a headless browser, to manage two contacts.*

14. **Declared:** 26 screens across five conceptual layers. → **Revealed:** six tables receive
    human writes in a normal week (braindump, wiki, tasks, checkin, dog, and occasionally
    project/client edits). → *The app offers roughly four times more surface than it carries.*

15. **Declared:** Tasks are a "Surface"-layer generic; the business lives in a separate Business
    group (CRM, Projecten, Strategie HQ, Buurtkaart). → **Revealed:** **35 of 56 tasks (63%) carry
    `domain = 'parkingyou'`** — a business with no screen of its own. → *The busiest thread in the
    app runs through a nav group that doesn't exist, while three business screens with dedicated
    real estate hold ceremonial data.*

16. **Declared:** A notification system with morning briefs, evening check-ins, habit reminders and
    medication reminders. → **Revealed:** of 342 sends, **214 (63%) are `urgent_payment`**; habit
    reminders 34, medication 13. → *Whatever it was designed to be, in practice this is a
    money-panic alarm.*

---

## 6. The Latent Need

### Ladder 1 — capture

`Vastleggen` / share target / braindump widget / Telegram capture / `/share` PWA target / voice
recording / ClaudeLog import
→ **function:** move something out of Rick's head or feed into a system, in one gesture
→ **felt need:** *"I don't want to lose this, and I don't want to deal with it now."*

- [EVIDENCE] Six independent entry points were built into the same table, from four different
  surfaces (browser share sheet, home-screen widget, Telegram, in-app).
- [EVIDENCE] It is the only human-written table with writes in **every** week since it existed:
  50 → 27 → 9 → 23.
- [EVIDENCE] 84% of what's captured is content from elsewhere, not original thought — the gesture
  being served is *forwarding*, not *composing*.
- [EVIDENCE] The one capture field requiring composition — `daily_checkin.note` — is filled 0/25.

### Ladder 2 — be told what matters

`notify-tick` (every 5 min) / urgent-payment push / Dashboard attention feed (#135) / hero carousel
(#159, #160) / "Belangrijkste vandaag" (#182) / finance coach / proactive suggestions (#155) /
the five widgets
→ **function:** surface the one thing that needs Rick now, without him going to look
→ **felt need:** *"Tell me what's urgent so I can stop holding it all in my head."*

- [EVIDENCE] 214 of 342 notifications are `urgent_payment`; a 5-minute cron exists solely to push.
- [EVIDENCE] The homescreen was explicitly rebuilt "around one attention feed instead of 13
  scattered sections" (#135) — Rick's own words for the same need.
- [EVIDENCE] The last major web feature (#182) rebuilt Taken around *urgency* specifically.
- [EVIDENCE] The final week of work went to home-screen widgets — pushing the app's output onto a
  surface he sees without opening anything.
- [INFERENCE] The eight consecutive finance-accuracy fixes on 2026-08-05 suggest the alarm is only
  trusted if the numbers are right; correctness here is load-bearing for the whole need.

### Ladder 3 — evidence that I'm becoming someone

Profiel / self-model interview (#141) / `identity_profile` / gamified RuneScape character
(#175, #176) / Noordster / Kennisbank categories / `profile_facts` / the inference engine
→ **function:** accumulate proof of change over time
→ **felt need:** *"Show me I'm not standing still."*

- [EVIDENCE] `identity_profile` was updated **today** (2026-08-15) — 13KB of interview and
  current-state JSON. It is one of the few single-row tables that is genuinely live.
- [EVIDENCE] `wiki_entries.category` is dominated by `life_lesson` (23) and `way_of_living` (5)
  alongside `business_practice` (20) — the knowledge base is at least half self-directed.
- [EVIDENCE] Every *mechanism* built to serve this need is empty: `goal_milestones` 0,
  `profile_facts` frozen at 8 since 2026-07-30, the quest log built and abandoned in a day.
- [SPECULATION] The gap between a live `identity_profile` and dead milestone/quest scaffolding
  suggests Rick wants the *narrative* of change, not the *metrics* of it. I cannot confirm this
  from artifacts; it is the sharpest open question in §9.

### The need that recurs across all three

Ladders 1 and 2 are the same motion in opposite directions: **hand something off, and be handed
something back.** Ladder 3 is what he hopes accumulates in between. The unifying finding is that
**every surviving feature is one where Rick's total obligation is a single gesture, and the system
does the rest** — capture and it summarises; confirm and it files; a bank CSV lands and it
categorises, budgets and alarms. **Every dying feature is one where the app hands him a ledger and
asks him to keep it.**

> ### The constitution
>
> **Catch what Rick throws at it, do the work of making it useful without him, and tell him the one thing that matters now.**

---

## 7. Consequences

Derived only from §6. Every entry cites §5 or §6.

### Keep

| Feature | Justification |
|---|---|
| **Capture → all six entry points** | Ladder 1's core; only human table written every week since inception (110 rows, last today) |
| **Braindump → Kennisbank confirm loop** | The constitution executing end-to-end: 110 captures → 55 extractions → 45 confirmed (82%), still live 2026-08-15 |
| **Taken** | Only feature *growing* (1→10→24→21/wk); carries the real workload (63% ParkingYou, §5.15) |
| **Finance ingest + urgent-payment push** | Ladder 2's proven core: 667 tx, 214 of 342 notifications; eight correctness fixes show it is trusted infrastructure (§6 Ladder 2) |
| **Machine-fed health/location/screentime** | Zero maintenance burden by construction; writes daily; the ideal shape per §6. `[read-surface]` — value unmeasurable but cost is near-zero |
| **Daily check-in — sliders only** | 25/25 on both sliders across 25 days, never abandoned (§5.7) |
| **Nightly summaries + notify-tick cron** | The "without him" half of the constitution; 36 summaries over 33 days |
| **`identity_profile`** | Updated today; the only live artifact of Ladder 3 (§6) |

### Merge

| Merge | Justification |
|---|---|
| **CRM + Projecten + Bureau + desk kiosk → one work surface** | Three UIs over the same need ("what work is owed"), backed by tables that are 88% dead Notion history (§5.3, §5.4) |
| **Geheugen + Kennisbank + ClaudeLog + Verbanden + Reflectie → one "what I've learned"** | Five Reflect-group screens reading the same braindump/wiki/summaries substrate; only the confirm action produces writes |
| **Gezondheid + Workout + Gewoonten + Schoonmaak → one passive "body & routine"** | All four serve the same need; the three that ask for manual logs are dead (§5.1, §6). Keep only what MacroDroid already sends |
| **Kyra + walks + Locaties → auto-logged** | Walks are already auto-detected; `dog_log` collapsed to zero the moment manual logging was the only path left |
| **Dashboard hero + notifications + Belangrijkste → one urgency surface** | Ladder 2 is currently split across four competing implementations, diluting the single thing it must do well |

### Cut

| Cut | Justification |
|---|---|
| **The Eyes, Dakmeester, SideBusiness** | 294 LOC, zero importers, absent from `nav.ts` since 2026-06-26 (§2) |
| **Pomodoro, desk timer, `project_hours`, hour-based invoicing** | 0 rows ever; ~731 LOC serving a billing model Rick doesn't use (§5.2) |
| **Obsidian vault (5 tables, 2 edge functions)** | 0 rows in all five (§5.12) |
| **Gewoonten** | 8 log rows in 6 weeks; the purest instance of the ledger pattern that always dies (§6) |
| **Schoonmaak — and immediately its `primary` nav slot** | Dead 16 days while holding one of seven bottom-bar slots (§5.1) |
| **Relaties + the 3 Instagram/Pinterest scraping functions** | 2 people (§5.13) |
| **`goal_milestones` + quest log** | 0 rows after an explicit fix; Ladder 3 is not served by metrics (§5.11, §6) |
| **Huis & Admin** | Both tables 0 rows, dead since 2026-07-23 |
| **`daily_checkin.note`, `tasks.checklist`** | 0/25 and 0/56 — fields nobody fills (§5.7, §5.8) |
| **`events` spine as a product idea** | 474k rows, no reader (§5.10). Demote to a cheap audit log or drop; it must not shape screens |
| **Default deadline sort + Achterstallig KPI on Projecten** | Optimises a 94%-empty field (§5.3) |
| **`card_templates`, `braindump_links`, `budget_rules`, `health_condition`** | 0 rows, no live code path |

**Do not cut yet (`[NEW]`):** Outreach, Fiverr intake, Android widgets, TWA. All shipped within
10 days; their empty tables are age, not failure. Re-audit after 2026-09-15.

### Missing

| Missing | Justification |
|---|---|
| **A return path for the Kennisbank** | 45 confirmed insights are written and never resurfaced. The constitution's "tell him" half only fires for money. This is the single largest gap — the app captures and structures, then never gives back (§6) |
| **Triage for unconverted captures** | 59 of 110 braindumps yielded no insight and there is no view of them. Capture without disposal becomes a landfill |
| **One urgency surface spanning money + tasks + clients** | Ladder 2 is proven for payments only; tasks and client follow-ups never reach the alarm (§5.16) |
| **Read telemetry** | Half the screens are read-surfaces whose value is currently unfalsifiable (method note 2). Without it, the next audit will be as blind as this one |
| **Persistence for HEYRA conversations** | 6,744 LOC whose usage cannot be evaluated; and Rick loses every exchange (§5.9) |
| **A ParkingYou surface** | 63% of tasks belong to a business with no screen (§5.15) |

---

## 8. Design Principles

1. **One gesture in the moment, or it will not happen.** Every surviving feature costs Rick a single
   tap; every dead one asks him to keep a ledger on a schedule. *(from §6: braindump alive at 110
   rows vs habits at 8, cleaning dead, workouts dead, hours never logged)* — **Use this to settle:**
   any proposal whose success depends on Rick remembering to update it should be rejected or
   automated.

2. **If a field is empty at 90%, delete the field or delete the feature that reads it.** *(from §5.4
   and §5.3: `last_contacted_at` 7/85 silently disables the whole follow-up engine; deadlines 3/51
   power a permanently-zero overdue KPI)* — **Use this to settle:** arguments about "we just need to
   backfill the data." The data has had seven weeks to arrive.

3. **Capture without return is a landfill.** Nothing may be added to the capture pipeline until the
   existing 45 confirmed insights are surfaced back to Rick somewhere. *(from §7 Missing)* — **Use
   this to settle:** any new intake source proposed before a retrieval surface exists.

4. **Nav prominence is earned by three consecutive weeks of writes, and lost the same way.** *(from
   §5.1: Schoonmaak holds a bottom-bar slot and has been dead 16 days)* — **Use this to settle:**
   placement debates. Placement is a measurement, not an opinion.

5. **Build the read path before the write path.** *(from §5.10: 474,186 events with no reader; §5.12:
   a vault bridge with nothing on the other side)* — **Use this to settle:** any proposal that
   begins with a schema or a spine.

6. **One urgency surface, not four.** Ladder 2 is the app's second-strongest need and is currently
   split across notifications, the hero carousel, Belangrijkste vandaag, and Taken. *(from §5.16,
   §7 Merge)* — **Use this to settle:** where a new alert belongs. It belongs in the existing one.

7. **Adding structure to a working feature is the most likely way to break it.** *(from §5.8:
   checklists 0/56, focus_date 6/56, added to the one feature that was already growing)* — **Use
   this to settle:** enrichment proposals for Taken and Capture. Prefer leaving them crude.

8. **A subsystem that cannot be measured cannot be justified.** *(from §5.9: HEYRA, 6,744 LOC, one
   row of trace)* — **Use this to settle:** whether to instrument before extending. Instrument
   first.

---

## 9. Questions I Cannot Answer From Artifacts

Ordered by how much a different answer would change the constitution in §6.

1. **When you save an Instagram video, what do you actually want to have happen a week later?**
   Nothing currently does. The answer determines whether the Kennisbank becomes a retrieval surface,
   a resurfacing feed, or gets cut — and it is the difference between the constitution's "tell him
   the one thing that matters now" meaning *money* or meaning *everything you've captured*.

2. **Is Ladder 3 about narrative or metrics?** `identity_profile` is live and updated today, while
   every milestone, quest and profile-fact mechanism is empty. If you want a story about who you're
   becoming, the constitution stands. If you want measurable progress, §7 cut the wrong things.

3. **Do you read the Telegram notifications, and do you act on them?** 214 urgent-payment pushes
   fired and nothing records the outcome. If you ignore them, Ladder 2 is an assumption, not a
   finding, and the app's second pillar collapses.

4. **Is ParkingYou the actual centre of your working life?** 63% of tasks say yes; the navigation
   says the centre is PRJCT (CRM, Projecten) and Buurtkaart. One of the two is wrong.

5. **Is the wall-mounted gym tablet real and installed, or was the kiosk speculative?** Determines
   whether Workout is cut (3 sessions logged) or is a read-surface I cannot see.

6. **Do you ever bill by the hour?** `project_hours` is empty and `invoicing.ts` assumes hours. If
   you bill per package (as the Fiverr intake suggests), the timer isn't underused — it's wrong.

7. **Are the 45 `done` Notion projects working data or archived history?** They are 88% of
   Projecten and have no deadlines. If they're history, the screen has ~6 live rows and should be
   built for six, not fifty-one.

8. **Do you use HEYRA daily?** 60 accumulated facts say it's used; nothing else can tell me. This
   decides whether the largest unmeasured subsystem gets instrumented and extended, or retired.

9. **What happened around 2026-07-30?** Cleaning stopped, and within a week so did workouts, then
   dog logs. Was that a change in your life, a bug, or the novelty wearing off? A bug means those
   features aren't dead — they're broken.

10. **Was the RuneScape character screen fun?** Built in one day (#175, #176), never touched again.
    If it was fun and just unfinished, Ladder 3 has a mechanism after all.

11. **Who else will ever use this?** `vaults`/`vault_members` imply sharing. Everything else assumes
    exactly one user. Multi-user would change the constitution's "Rick" to something else entirely.

12. **Would you accept losing a feature that works, but that you only used for two weeks?** §7 cuts
    roughly a third of the app. This document can justify the deletions; it cannot consent to them.

---

*Compiled from live database introspection (2026-08-15), 429 commits of history, and a read-only
survey of 52,382 lines of `src/`. No code, schema or data was modified.*
