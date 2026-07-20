# OSLIFE Codebase Map

A structural reference for the entire OSLIFE codebase: every screen, component, hook, domain module, data structure, database table, edge function, and integration, plus how they relate to each other.

This document is the **structural/functional map**. For the *design rationale* behind the event-sourcing backend (event spine, inference engine, memory/retrieval, learning loop), see [`docs/DATA-ARCHITECTURE.md`](./DATA-ARCHITECTURE.md). For credentials/env vars, see [`docs/SECRETS.md`](./SECRETS.md) and `.env.example`. See [§14](#14-related-documentation) for the full map of existing docs.

> This doc reflects the codebase as of the migrations/files present at the time of writing (28 migrations, through `20260714170000_cleaning_schedule.sql`). Treat it as a living document — update it when screens, modules, or the schema change materially.

## Table of contents

1. [Overview](#1-overview)
2. [App shell & routing](#2-app-shell--routing)
3. [Screens](#3-screens)
4. [Reusable components](#4-reusable-components)
5. [Custom hooks](#5-custom-hooks)
6. [Global state (`src/store.ts`)](#6-global-state-srcstorets)
7. [Domain modules](#7-domain-modules)
8. [Shared utilities (`src/lib/*`)](#8-shared-utilities-srclib)
9. [Top-level orchestration files](#9-top-level-orchestration-files)
10. [Cross-module dependency graph](#10-cross-module-dependency-graph)
11. [Data layer / database schema](#11-data-layer--database-schema)
12. [Edge functions](#12-edge-functions)
13. [Integrations](#13-integrations)
14. [Related documentation](#14-related-documentation)

---

## 1. Overview

OSLIFE is a single-user personal life-management app for "Rick" — a "second brain" that ingests signals from many life domains (health, finance, work/CRM, relationships, home admin, behaviour) and turns them into a fast daily-use surface plus a slow reflective/inference layer.

**Stack:** React 18 + TypeScript, Vite, Zustand (single global store, `localStorage`-persisted), Tailwind CSS + shadcn/radix UI, Recharts, Supabase (Postgres + Auth + Realtime + Storage + Edge Functions + `pg_cron`/`pg_net`), deployed as a static PWA on Vercel.

**Architecture in one paragraph:** external systems (Google Sheets via Apps Script, Gmail, Calendar, MacroDroid Android automations, a WordPress plugin, a standalone transcription worker) push or are polled into Supabase via Edge Functions and direct PostgREST writes; Supabase is the single source of truth (Postgres tables + an append-only `events` log + `pg_cron` jobs that run inference/summarization/self-audit); the React SPA reads/writes Supabase directly (`src/lib/supabase.ts`) through one Zustand store (`src/store.ts`) that every screen renders from. There is no separate backend server for the frontend — Supabase (managed Postgres + Edge Functions) *is* the backend. Projects/Clients (the native CRM) are managed entirely in-app with no external sync.

Routing is **not** URL-based (no react-router) — it's a single `useState<View>` in `App.tsx` driven by a central screen registry (`src/nav.ts`).

---

## 2. App shell & routing

- **`index.html`** — Vite SPA shell, single `#root` div, PWA manifest + service worker registration (`/sw.js`), including Android Web Share Target support landing at `/share`.
- **`src/main.tsx`** — React root. Wraps `<App/>` in `ThemeProvider` (light/dark/system) and `ErrorBoundary` (clears `localStorage` + reloads on crash). Registers `public/sw.js`.
- **`src/App.tsx`** — The router. Holds `const [view, setView] = useState<View>('dashboard')` and a `Current: Record<View, JSX.Element>` lookup mapping every `View` id to its screen component. Also:
  - Bootstraps the Supabase auth session (`supabase.auth.getSession()` + `onAuthStateChange`), gating the whole app behind `LoginScreen` (`src/components/LoginScreen.tsx`) until authenticated.
  - Checks `window.location.pathname === '/share'` → renders `ShareIntake` instead of the normal shell (the one place the app reads the URL at all).
  - Calls `store.loadLiveData()` once a session exists, switching the app from seeded/empty mock data to live Supabase data.
  - Renders everything inside `AppShell` (`src/components/layout/app-shell.tsx`), plus overlay modals: `LoopExplainer`, `AppGrid`, `SettingsModal`, `ConfirmDialog` (reset-demo confirmation).
- **`src/nav.ts`** — **Single source of truth for the screen registry.** Exports:
  - `type View` — union of all 27 screen ids (see [§3](#3-screens)).
  - `type ScreenGroup` — `'Surface' | 'Life' | 'Business' | 'Intake' | 'Reflect'`.
  - `interface Screen { id: View; label: string; icon; layer: string; group: ScreenGroup; primary?: boolean; accent: string }`.
  - `SCREENS: Screen[]` — id, Dutch label, lucide-react icon, subtitle (`layer`), group, `primary` (shown in the mobile bottom bar), `accent` (Tailwind color class for the app-grid tile).
  - `GROUP_ORDER` — display order of the 5 groups.
  - Consumed identically by `AppSidebar`, `CommandMenu` (⌘K palette), and `AppGrid` (full-screen app launcher) so none of the three can drift out of sync.
- Navigation is just `onNav={(v) => setView(v as View)}` callbacks threaded down as props — no global router context, no history stack, no deep-linking except the one `/share` special case.

---

## 3. Screens

27 `View`s across 5 `ScreenGroup`s, plus several modal-only screens that aren't in `nav.ts` at all (opened via local component state instead of navigation).

### Surface (daily-use core)

| Screen | File | View id | Purpose |
|---|---|---|---|
| Dashboard | `src/views/Dashboard.tsx` | `dashboard` | One-screen-of-everything home. Reads nearly the whole store (`threads, blocks, habits, nudge, healthDays, projects, goals, milestones, emails, transactions, payments`) plus `useWeather()`. Computes a derived nudge fallback when Reflect hasn't authored one yet. Renders greeting/weather header, `NudgeCard`, "right now" block + vitals rings, and a grid of mini-cards (North Star, Money, Payments due, Projects, Inbox, Open loops, Habits), each with a `SetupHint` empty state linking to the real screen. Actions: complete/skip block, tick habit, toggle milestone, mark email read/payment paid. |
| Today (Vandaag) | `src/views/Today.tsx` | `today` | Daily focus view. Uses `threads, blocks, habits, nudge, activity, projects, projectTasks`. "Vandaag afmaken" section (today-due project tasks, capped at 5) driven by `DopamineBar`. Right column: `CheckinCard`, habit checklist, live "loop activity" feed. |
| Tasks (Taken) | `src/views/Tasks.tsx` | `tasks` | Two-column kanban-lite (Personal vs Werk) over `store.threads`. Quick-add parses free text via `heyra/skills.ts:parseTaskDraft`. Inline edit/close/reopen/delete per `TaskRow`. |
| DayBuilder (Dagplanner) | `src/views/DayBuilder.tsx` | `daybuilder` | Weekly day-plan builder. Reads `weekPlan, weekPlanAt, planningWeek`; calls `generateWeekPlan()` (async → `heyra/planner.ts`). Renders day-grouped `BlockRow`s, lock/dismiss proposals, "Add to Google Calendar" links (`lib/gcal.ts`). |

### Life (personal domains)

| Screen | File | View id | Purpose |
|---|---|---|---|
| Vitals (Gezondheid) | `src/views/Vitals.tsx` | `vitals` | Health dashboard over `healthDays`. Recharts bar/line for steps/sleep/HR, `Ring` components for today's steps/sleep/energy/mood, embeds `CheckinCard` and `HealthConditions`. |
| Habits (Gewoonten) | `src/views/Habits.tsx` | `habits` | CRUD + gamified tracking over `store.habits`. Week bar chart, 30-day heatmap per selected habit, completion %, streaks. |
| Cleaning (Schoonmaak) | `src/views/Cleaning.tsx` | `cleaning` | ADHD-friendly cleaning schedule/gamification. Uses `store.cleaningLog` + pure logic from `src/cleaning/schedule.ts` (daily baseline + weekly zone rotation) and `src/cleaning/gamify.ts` (points/streaks/levels). Week strip lets you log a missed day retroactively. |
| Signals (Signalen) | `src/views/Signals.tsx` | `signals` | Passive behaviour streams feeding Reflect: `screenDays` (screen time/app usage) and `meetingDays` (calendar density), cross-referenced against project deadlines via `derive.ts:deriveDeadlines`. |
| Money (Geld) | `src/views/Money.tsx` | `money` | Full finance module, 4 tabs (Overzicht/Te betalen/Abonnementen/Vendors). Reads `transactions, goals, payments, subscriptions, vendorTags`. CSV import (`finance/csvImport.ts`), category taxonomy (`finance/categories.ts`), AI auto-tagging (`autoTagTransactions` → `heyra/agents/vendorAgent.ts`), per-transaction editor, subscription manager, vendor-memory manager. |
| Dog (Kyra) | `src/views/Dog.tsx` | `dog` | Pet-tracking app-within-app: quick-log buttons (walk/food/water/pee/poop/play/treat/training/vet) with long-press → detail modal (`useLongPress`), weight chart, medical dossier, advice engine, reminders. Reads `dogProfile, dogEntries, dogMedical, dogReminders`. |
| Relaties | `src/views/Relaties.tsx` | `relaties` | Personal relationship/network tracker (distinct from CRM clients). `people, interactions` — add person, log interaction, overdue-contact flag from `cadenceDays`. |
| HuisAdmin (Huis & Admin) | `src/views/HuisAdmin.tsx` | `huisadmin` | Household admin/contract tracker (insurance, warranties, subscriptions-admin) with renewal/notice-period countdown. `adminItems`. |
| Inbox | `src/views/Inbox.tsx` | `inbox` | Gmail-synced inbox viewer. `emails` + local importance classifier (`lib/crm/emailClassify.ts`, ignores the synced `importance` field as unreliable) and domain-tag filter chips. Thread-grouping, mark read/all-read, deep link to Gmail. |
| NorthStar (Noordster) | `src/views/NorthStar.tsx` | `northstar` | Goals + milestones. `goals, milestones, goalProposals`, including HEYRA-authored goal proposals (`proposeGoals()` → `heyra/goals.ts`) that can be accepted/dismissed. |

### Business

| Screen | File | View id | Purpose |
|---|---|---|---|
| CRM | `src/views/CRM.tsx` | `crm` | Business overview: pipeline-by-status, client-status breakdown, follow-up-due list (`lib/crm/followUp.ts:clientHealth`), unified "Berichten" entry point into `Messages.tsx`. Shares `ProjectGridList`/`useProjectBrowserModals` (`components/ProjectBrowser.tsx`) and primitives from `components/crm.tsx` with Projects. |
| Projects (Projecten) | `src/views/Projects.tsx` | `projects` | Full project list with search/sort/status+client filters, grid/list toggle. KPI row (active/pipeline/overdue/delivered). |
| StrategieHQ | `src/views/StrategieHQ.tsx` | `strategiehq` | Business-ideas hub: capture (voice/text) → `idea-elaborate` edge function produces a full strategic write-up (feasibility, milestones, financials, SWOT). No external source — fully native (`business_ideas` table). |
| Buurtkaart | `src/views/Buurtkaart.tsx` | `buurtkaart` | Local advertising business admin (Geldrop Buurtkaart). Live data from a WordPress plugin via the `gbk-overview` edge function; tabs for Edities/Klanten/Facturen; defensive payload normalizers since the WP API shape isn't fixed. |
| Eyes (The Eyes) | `src/views/Eyes.tsx` | `eyes` | Thin config object rendered through the shared `SideBusiness` template. |
| Dakmeester | `src/views/Dakmeester.tsx` | `dakmeester` | Thin config object rendered through the shared `SideBusiness` template. |

`Eyes` and `Dakmeester` both render through **`src/views/SideBusiness.tsx`** (not itself a nav view) — a shared template with badge/callout/stats/KPIs/roadmap checklist/footer, driven purely by local `useState` for roadmap-item toggling (no store dependency).

**Modal-only screens** (opened via local component state from CRM/Projects, not `nav.ts`):
- **`ProjectDetail.tsx`** — Tabbed sheet: Details / Taken / Mijlpalen / Uren / Facturen / Activiteit. Drives `projectTasks, projectMilestones, projectHours, projectInvoices, projectActivity`; one-click invoice generation from unbilled hours (`lib/crm/invoicing.ts`); activity logger uses `lib/crm/activityAnalyzer.ts` to auto-match free text to a task/milestone.
- **`ProjectForm.tsx`** — Create/edit project; auto-suggests template tasks by project type (`lib/crm/projectTemplates.ts`).
- **`ClientDetail.tsx`** — Client sheet: contact info, follow-up health dot, linked projects, linked messages (merges native `messages` + Gmail-derived via `lib/crm/gmailInbox.ts:deriveGmailMessages`).
- **`ClientForm.tsx`** — Create/edit client.
- **`Messages.tsx`** — Unified inbox across email/Fiverr/WhatsApp channels, grouped into conversations; WhatsApp `.txt` export import (`lib/crm/whatsapp.ts` + `store.importWhatsapp`); compose message; per-thread bubble/mail-card rendering.

### Intake

| Screen | File | View id | Purpose |
|---|---|---|---|
| Heyra | `src/views/Heyra.tsx` | `heyra` | The chat assistant. Local message list with brain-first routing via `heyra/router.ts:routeMessage`, dispatching to per-intent agents (`heyra/agents/*.ts`) based on `heyra/skills.ts` keyword triggers. Renders rich reply cards: `TaskCard`, `SearchResultCard`, `DataVizCard`, `ProjectCard`, `ClientIntakeCard`. Contextual suggestion chips from `heyra/suggestions.ts`. Voice input via Web Speech API. Background fact-learning via `store.learnFromExchange` → `heyra/learning.ts`. |
| Capture (Vastleggen) | `src/views/Capture.tsx` | `capture` | "Braindump" universal capture inbox. Text/link/file capture (`store.braindumpCapture`), grid of `BraindumpCard`s with kind/domain filters + search, detail modal `BraindumpDetail` (built-in Markdown renderer), Claude-chat-export importer (`lib/claudeImport.ts` + `store.importClaudeConversations`). |

**`ShareIntake.tsx`** (not a `View`, rendered directly by `App.tsx` when `pathname === '/share'`) — PWA Web Share Target landing page: reads files stashed by `public/sw.js` in a Cache API bucket plus URL/text/title query params, lets the user pick a life-domain, then calls `braindumpCapture` per item.

### Reflect

| Screen | File | View id | Purpose |
|---|---|---|---|
| Inferences (Inferenties) | `src/views/Inferences.tsx` | `inferences` | Review queue for the inference engine (`inferences: InferredItem[]`); confirm/reject cards with a `ConfidenceBar`. |
| Memory (Geheugen) | `src/views/Memory.tsx` | `memory` | 4 tabs over the memory data model: Feiten (`essentials`), Threads (`threads`, close/reopen), Patronen (`patterns`, confidence + trend), Samenvattingen (`summaries`, nightly digests). |
| Reflect (Reflectie) | `src/views/Reflect.tsx` | `reflect` | The "slow loop" cross-domain analysis screen. Computes `computeCorrelations`/`computeAnomalies` (from `src/reflect.ts`) live from `dayLogs, transactions, screenDays, meetingDays, deadlines, habits`. Shows a data-coverage grid, correlation cards, sleep-vs-energy and spend-vs-deadline charts, anomaly list, pattern reinforcement/decay after `runNightlyReflect()`. |
| Mindmap (Verbanden) | `src/views/Mindmap.tsx` | `mindmap` | Custom force-directed graph ("second brain"), hand-rolled physics simulation (no d3/vis-network) — logic split into `src/graph.ts` (`buildBrain`) and `src/graph/simulation.ts` (layout/physics/camera). Fully custom SVG renderer with pointer/wheel gestures, progressive disclosure (category → entity → record), category filter chips, cross-domain edge toggle. |
| SyncStatus (Databronnen) | `src/views/SyncStatus.tsx` | `sync` | Connection-health dashboard. Uses `lib/syncStatus.ts:fetchSyncStatus()` to report per-source (health/sleep/weight/finance/gmail/calendar/projects/clients/…) last-sync age and row counts, with up/slow/down/empty status pills. |

---

## 4. Reusable components

### Layout shell — `src/components/layout/*`

| Component | File | Role |
|---|---|---|
| `AppShell` | `app-shell.tsx` | Composes `SidebarProvider` + `AppSidebar` + `AppHeader` + `<main>` + `CommandMenu`; owns the ⌘K/Ctrl+K keybinding. |
| `AppSidebar` | `app-sidebar.tsx` | Renders `SCREENS` grouped by `GROUP_ORDER` into shadcn `Sidebar` primitives; header has the `Orb` (tap → Heyra, long-press → AppGrid) + live/mock data-source dot; footer has "De twee loops" (`LoopExplainer`), "Run reflect", Instellingen, Reset demo. |
| `AppHeader` | `app-header.tsx` | Sticky top bar: screen title/layer subtitle, search button (opens command menu), `ThemeToggle`, `ProfileDropdown`. |
| `CommandMenu` | `command-menu.tsx` | ⌘K palette over `SCREENS` (grouped) + theme switcher, built on shadcn `Command*`. |
| `ProfileDropdown` | `profile-dropdown.tsx` | Avatar menu: settings, sign out (`supabase.auth.signOut`). |
| `ThemeProvider` / `ThemeToggle` | `theme-provider.tsx` / `theme-toggle.tsx` | Light/dark/system theme context + toggle, persisted to `localStorage`. |

### Design-system primitives (shadcn/radix) — `src/components/ui/*.tsx`

`avatar, badge, button (cva variants), card, collapsible, command (cmdk), dialog, dropdown-menu, input, scroll-area, separator, sheet, sidebar (753 lines — the full shadcn sidebar system), skeleton, tooltip`. All follow the standard shadcn pattern (Radix primitive + `cva` + `cn()` from `lib/utils.ts`).

### Custom domain UI primitives — `src/components/ui.tsx`

A separate flat file (not the shadcn folder) of OSLIFE-specific primitives: `DomainChip, SentimentChip, KindChip, Pill, ConfidenceBar, SectionTitle, Ring` (SVG progress ring), `Overlay` (shared scrim+panel wrapper, 3 tones), `ConfirmDialog` (styled `window.confirm` replacement), `Empty`, `SetupHint` (empty-state-with-CTA).

### CRM-specific shared primitives — `src/components/crm.tsx`

`FollowUpDot`; status/color maps (`CRM_STATUS, STATUS_HEX, CLIENT_HEX, CLIENT_STATUS_NL, PRIO_HEX, DOMAIN_OPTIONS, PROJECT_TYPE_OPTIONS`); modal shells `SheetShell`/`Sheet` (bottom-sheet-on-mobile, tracks nested-sheet count for body-scroll-lock); form fields (`Field, TextInput, TextArea, SelectInput, PrimaryBtn`); shared cards `Kpi, StatusBadge, ProjectCard, ProjectRow, ClientCard`.

### Notable standalone domain components

| Component | File | Used by |
|---|---|---|
| `AppGrid` | `AppGrid.tsx` | Full-screen app launcher grid (all `SCREENS` grouped), opened by Orb long-press. |
| `ProjectBrowser` (`FilterViewBar`, `ProjectGridList`, `useProjectBrowserModals`) | `ProjectBrowser.tsx` | Shared status filter/grid-list + modal open/close state — reused by both CRM and Projects. |
| `NudgeCard` | `NudgeCard.tsx` | Dashboard, Today — renders the daily nudge; `storeNudgeToDash()` adapts a raw `store.nudge` into the richer `DashNudge` shape. |
| `CheckinCard` | `CheckinCard.tsx` | Vitals, Today — energy/mood 1-5 slider check-in, feeds Reflect. |
| `DopamineBar` | `DopamineBar.tsx` | Today — progress bar + celebratory state for "today's tasks done". |
| `HealthConditions` | `HealthConditions.tsx` | Vitals — read-only auto-promoted health-condition dossiers (subject `'rick'|'kyra'`) with a "forget" (hard-delete + tombstone) flow. |
| `LocationWeather` | `LocationWeather.tsx` | Dashboard — weather/location card, consumes `useWeather()`. |
| `LoginScreen` | `LoginScreen.tsx` | App.tsx — Supabase email/password sign-in gate. |
| `LoopExplainer` | `LoopExplainer.tsx` | Sidebar footer — animated SVG explainer of the "two loops" (fast/slow) architecture. |
| `Orb` | `Orb.tsx` | Sidebar header — the HEYRA orb button (tap vs. long-press via pointer events + timer). |
| `SettingsModal` | `SettingsModal.tsx` | App.tsx overlay — Telegram notification linking + per-category toggle/time settings + hourly rate (invoicing). |
| `TaskCard`, `ProjectCard`, `SearchResultCard`, `ClientIntakeCard`, `DataVizCard` | (individual files) | Heyra chat — one rich reply-card type per agent. |
| `BraindumpCard` (+ `BraindumpDetail`) | `BraindumpCard.tsx` | Capture — capture-grid card + detail modal with a built-in minimal Markdown renderer. |
| `chart.ts` | `chart.ts` | Shared recharts style constants (`CHART_TIP`, `AXIS_TICK_10/11`) reused across every chart-bearing screen (Vitals, Signals, Reflect, Habits, Dog, Money). |

---

## 5. Custom hooks

| Hook | File | Purpose |
|---|---|---|
| `useIsMobile()` | `src/hooks/use-mobile.ts` | matchMedia-based mobile breakpoint (768px) flag, used by the shadcn sidebar. |
| `useWeather()` | `src/hooks/useWeather.ts` | Client-only geolocation → Open-Meteo (weather) + BigDataCloud (reverse geocode) fetcher; 15-min auto-refresh; falls back to Geldrop home coords on denial/failure; exposes `weatherMeta(code, isDay)` icon/label resolver. No Supabase dependency. |
| `usePersistedState<T>(key, initial)` | `src/lib/usePersistedState.ts` | `useState` mirrored to `localStorage` (used by Inbox/Messages filter state). |
| `useLongPress(onShort, onLong, delay=500)` | `src/lib/useLongPress.ts` | Pointer/touch long-press gesture helper (Dog quick-log buttons, Orb). |

---

## 6. Global state (`src/store.ts`)

`src/store.ts` (~2,200 lines) is the **single global state container for the entire application** — no other zustand stores exist. Defined as `useStore = create<State>()(persist(...))`, persisted to `localStorage`, with a custom rehydration-repair function `applyPersistDefaults()` that seeds demo data back into empty persisted slices and resets transient in-flight flags (`proposingGoals`, `planningWeek`) on reload.

**State shape** — one flat interface holding essentially every domain's data:
`items, essentials, threads, patterns, dayLogs, transactions, habits, cleaningLog, blocks, nudge, lastDigest, reflectCount, planAdapted, activity, healthDays, checkins, notificationPrefs, screenDays, meetingDays, projects, clients, messages, projectMilestones, projectTasks, projectHours, projectInvoices, projectActivity, goals, milestones, goalProposals, proposingGoals, weekPlan, weekPlanAt, planningWeek, emails, payments, subscriptions, dogProfile, dogEntries, dogMedical, dogReminders, learnedFacts, vendorTags, braindumpEntries, inferences, people, interactions, adminItems, healthConditions, summaries, settings, dataSource ('mock'|'live'), isLoading`.

**Action groups** (each following an "optimistic local update + fire-and-forget Supabase write" pattern via shared helpers `swapTempId`/`patchSlice`/`removeFromSlice`):
- Capture/braindump/Claude-import: `capture`, `braindumpCapture`, `deleteBraindumpEntry`, `retryBraindumpEntry`, `importClaudeConversations`.
- Tasks/threads: `addTask`, `closeThread`, `reopenThread`, `updateThread`, `deleteThread`.
- Habits: `tickHabit`, `addHabit`, `deleteHabit`.
- Cleaning: `toggleCleaningTask`.
- Day-blocks/plan: `completeBlock`, `skipBlock`, `resetBlock`, `moveBlock`, `acceptPlan`, `generateWeekPlan`, `lockPlanBlock`.
- Check-ins/notifications: `logCheckin`, `setNotificationPrefs`.
- Nightly reflect: `runNightlyReflect`.
- Live data: `loadLiveData` (fetches every table, opens one Supabase Realtime channel, torn down/rebuilt on repeat calls).
- Inference engine (Slice 1): `loadInferences`, `resolveInference`.
- People/interactions/admin items (Slice 2): `addPerson`, `updatePerson`, `deletePerson`, `logInteraction`, admin-item CRUD.
- Goals: `proposeGoals`, `acceptGoalProposal`, milestone toggling.
- Email: `markEmailRead`.
- CRM: `addClient`/`updateClient`/`linkSenderToClient`, message CRUD, WhatsApp import.
- Projects: `createProjectWithTemplate` (via `projectTemplates.ts`), `createClientIntake`, milestones/tasks/hours/invoices/activity CRUD, `generateInvoiceFromHours` (via `invoicing.ts`), `logActivity` (via `activityAnalyzer.ts`).
- Finance: `addTransactions`/`importTransactions`, `autoTagTransactions` (via `vendorAgent.ts` + `categories.ts`), `setVendorTag`.
- Dog tracker: entry/medical/reminder CRUD.
- Subscriptions: CRUD.
- `resetDemo()`.

**Data-source dependencies wired together by the store:**
- `src/lib/supabase.ts` — the Supabase client + the entire write-back layer (see [§8](#8-shared-utilities-srclib)).
- `src/heyra/**` — brain/agent logic.
- `src/reflect.ts` — correlation/anomaly computation + nightly digest builder.
- `src/derive.ts` — derives essentials/threads/dayLogs/baseline-patterns/nudge from live data.
- `src/finance/categories.ts`, `src/lib/crm/*.ts` — domain logic consumed by store actions.
- `src/mockData.ts` — seed/demo data (`seed()`), used until a live session loads real data.
- `src/domains.ts` — cross-cutting domain metadata used by nearly every screen.
- `src/types.ts` — the canonical TypeScript types for every entity in the store.

---

## 7. Domain modules

### `src/finance/` — personal/business finance (leaf module — depends only on `types.ts`/`domains.ts`)

- **`categories.ts`** — the spending taxonomy, shared by the CSV guesser, the store's auto-tagger, and the `categorize-vendor` edge function.
  - `TX_CATEGORIES` — fixed category list (Groceries, Takeout, Convenience, Transport, Dog, Health, Subscriptions, Software, Gear, Utilities, Housing, Shopping, Entertainment, Cash, Fees, Taxes, Client income, Stock media, Other).
  - `type TxCategory`; `CATEGORY_DOMAIN: Record<string, Domain>` — default life-domain per category.
  - `domainForCategory(category, amount): Domain` — best-guess domain (income leans `prjct`).
  - `isUntagged(category): boolean`; `vendorKey(merchant): string` — normalizes a merchant string into a stable vendor-cache key.
- **`csvImport.ts`** — ABN AMRO + generic bank-CSV parser.
  - `guessCategory(desc, amount): string` — regex/word-boundary rule-based category guess.
  - `cleanMerchant(desc): string`; `parseAmount(raw): number` (NL-locale, `,` decimal); `splitCsvLine`, `detectDelimiter`, `toIsoDate(raw): string|null`.
  - `parseCsv(text): Transaction[]` — full pipeline: header/column detection or heuristic fallback, returns `Transaction[]`.
- Tests: `categories.test.ts`, `csvImport.test.ts`.

### `src/lib/crm/` — CRM / client-communication module (leaf module besides internal `gmailInbox.ts` → `emailClassify.ts`)

- **`activityAnalyzer.ts`** — matches free-text activity notes against a project's open tasks/milestones. `analyzeActivity(body, tasks, milestones): ActivityAnalysis` (tokenizes, scores overlap, detects done/progress intent, returns action + confidence + Dutch reason).
- **`emailClassify.ts`** — in-app reclassification of Gmail sync data. `type Importance`, `ALL_EMAIL_TAGS`, `emailTags(email)`, `classifyImportance(email): Importance` (Fiverr-split → noise detection → reply-thread detection → money keywords → default `med`).
- **`followUp.ts`** — "object permanence" client follow-up health. `type FollowUpHealth`, `nextFollowUp(client)`, `clientHealth(client, today): FollowUpHealth`, `FOLLOWUP_META`.
- **`gmailInbox.ts`** — derives the unified CRM inbox from synced Gmail data. `buildMatcher(clients, projects): ClientProjectMatcher` (strong/weak matching by email/domain/name), `deriveGmailMessages(emails, clients, projects): Message[]` (read-only).
- **`invoicing.ts`** — invoice-from-hours math shared by store + UI preview. `unbilledBillableHours`, `sumHours`, `invoiceAmountFromHours(hours, rate)` (rounded to cents).
- **`projectTemplates.ts`** — `TEMPLATE_TASKS: Record<string, string[]>` per project type; `templateTasksFor(types): string[]` (deduped union).
- **`whatsapp.ts`** — WhatsApp plain-text export parser. `parseWhatsapp(raw, meNames, opts): WhatsappImport` (iOS bracket + Android dash formats, multi-line folding, "me" detection by frequency, stable `externalId`s to prevent duplicate re-import).

### `src/cleaning/` — ADHD-proof cleaning schedule + gamification (leaf module besides `domains.ts`)

- **`schedule.ts`** — static content. `DAILY_BASELINE` (3 always-present tasks), `ZONES` (one zone per weekday: Mon Bathrooms → Tue Kitchen → Wed Living area → Thu Bedrooms → Fri Trash/reset → Sat rest → Sun Inventory), `zoneForDay`/`zoneForDate`, `tasksForDate(iso)`.
- **`gamify.ts`** — `type CleaningLog = Record<string, boolean>` keyed `${onDate}__${taskKey}`; `logKey`; `POINTS_PER_TASK=10`, `ZONE_CLEAR_BONUS=40`; `totalPoints`, `currentStreak` (anchors on yesterday if today isn't finished); `LEVELS` — 6 hotel-themed ranks (Front Desk Trainee → Housekeeping Pro → Suite Specialist → Head of Housekeeping → General Manager → Five-Star Legend); `levelFor(points): LevelInfo`.
- Only the store (`logKey`) imports from this module; it persists to `cleaning_log` via `persistCleaningTick`/`fetchCleaningLog`.

### `src/heyra/` + `src/heyra/agents/` — the HEYRA conversational agent subsystem

Rule-based-first, LLM-second ("brain-first with rule-based fallback"): every network call funnels through `brainClient.ts`'s `askBrain()`, which proxies to the `heyra-brain` edge function (a Claude API proxy) and **always** resolves to `null` on failure — no call site ever throws; every agent has a deterministic fallback.

**Core infrastructure:**
- **`brainClient.ts`** — `askBrain(system, prompt, opts?)`, `brainRecentlyFailed()` (session-only flag, 6s default timeout).
- **`brainJson.ts`** — `parseBrainJson(raw)` extracts a fenced ```json block from a brain reply.
- **`router.ts`** — the dispatcher. `detectAgentRuleBased` (legacy keyword fallback), `detectAgent(input, memory)` (one brain call picks agent + classifies domain/kind/sentiment/summary), `routeMessage(input, ctx)` (top-level entry: builds a `StructuredItem`, fires `store.capture()`, runs the chosen agent), `AGENTS: Record<AgentId, Agent>` registry, `CAPTURE_ONLY_AGENTS`.
- **`skills.ts`** — `SKILLS` (id/label/blurb per agent), `detectSkill(text)` (keyword-trigger scoring), `parseTaskDraft(text): TaskDraft` (combines `datetime.ts` + `understand.ts` classification + priority detection).
- **`memory.ts`** — session-only conversation memory. `emptyMemory()`, `remember()`, `transcript()`.
- **`learning.ts`** — durable cross-session "learn as we speak" memory. `type FactCategory`, `LearnedFact`, `MAX_FACTS=60`, `mergeFacts` (dedupe + cap + newest-first), `extractFacts(userText, heyraText, existing)` (brain call, `[]` on failure), `renderLearnedFacts(facts)`.
- **`context.ts`** — context-assembly recipe that keeps `tier=geheim` data out of any cloud-AI call. `assembleContext(message, snap, search, opts?)`, `renderContext(ctx)`.
- **`datetime.ts`** — NL+EN natural-language date/time parser. `parseWhen(text): ParsedWhen` (relative days, "over N dagen/weken", weekday names, month names, times), `relativeDue(iso)` (human label like "morgen", "2d te laat").
- **`cards.ts`** — dynamic reply-card builders. `buildSearchCard`, `buildChartCard` (picks metric matching the question: spend/energy/steps/habit-streak/open-loops-by-domain), `findProject`.
- **`suggestions.ts`** — proactive chip suggestions. `contextualSuggestions(ctx)` (10 candidate prompts scored from live data), `followUpSuggestions(topic, ctx, extra?)`.
- **`goals.ts`** — North Star goal proposer. `proposeGoals(ctx)` (brain-first, falls back to `ruleBasedProposals`: revenue-doubling from top domain, sleep goal, "open loops under 5").
- **`planner.ts`** — day/week planner. `ruleBasedDayPlan(date, ctx)`, `generateAIPlan(dates, ctx)` (brain call, validated against fixed events/bounds/dedup), `buildWeekPlan(dates, ctx)` (brain first, rule-based fallback), `weekDates(fromIso)`.

**The 12 agents (`src/heyra/agents/`)** — shared contract in **`types.ts`**: `Store`, `AgentContext { store, memory, item }`, `AgentResult { text, topic, draft?, search?, chart?, project?, clientIntake?, entity?, fromBrain? }`, `type Agent = (input, ctx) => Promise<AgentResult>`.

| Agent | File | Role |
|---|---|---|
| Assistant | `assistantAgent.ts` | General-purpose "Claude-inside-OSLIFE" for open questions/writing, unconstrained by stored data. |
| Briefing | `briefingAgent.ts` | Synthesizes nudge + top-3 open loops + last Reflect digest into one prioritized paragraph. |
| Chart | `chartAgent.ts` | Thin wrap of `buildChartCard`. |
| Chat | `chatAgent.ts` | Default "Geheugen" agent — rule-based branches for open-loop/task-note/vent, else grounds a brain answer in `buildMemorySnapshot()`. |
| Client intake | `clientIntakeAgent.ts` | Extracts client/project/budget/deadline/deliverables from a pasted client message; brain suggestion validated against real `store.clients` (never invents a match). |
| Finance | `financeAgent.ts` | Summarizes open outgoing/incoming payments; brain only phrases real numbers from `store.payments`. |
| Memory context | `memoryContext.ts` | `buildMemorySnapshot(store, opts?)` — compact factual Dutch snapshot grounding chat/briefing agents. |
| Project | `projectAgent.ts` | Resolves a project reference via `findProject()` → last-mentioned entity → brain-assisted exact-name match. |
| Search | `searchAgent.ts` | Wraps `buildSearchCard`; brain only tightens the intro sentence. |
| Signal | `signalAgent.ts` | Narrates real `computeCorrelations`/`computeAnomalies` output via the brain; never invents percentages. **This agent depends on `reflect.ts`/`derive.ts`.** |
| Task | `taskAgent.ts` | Thin wrap of `parseTaskDraft` — no brain call (deliberately instant). |
| Vendor | `vendorAgent.ts` | `categorizeVendor(vendor, opts)` — calls the `categorize-vendor` edge function (Haiku + web search); validates against `finance/categories.ts`. **This is HEYRA's one hard dependency on the finance module.** |

Test files: `context.test.ts`, `datetime.test.ts`, `planner.test.ts`, `skills.test.ts`.

### `src/graph.ts` + `src/graph/simulation.ts` — the "second brain" knowledge graph

- **`graph.ts`** — builds the hierarchical hub-and-web memory graph rendered by Mindmap.
  - Types: `CatId`, `GFlag`, `BKind`, `BNode`, `BEdge`, `CatLink`, `GSuggestion`, `Brain { categories, nodes, edges, catLinks, suggestions }`.
  - `CATEGORIES` — 6 root hub categories (WORK/MONEY/HEALTH/HABITS/GOALS/MIND).
  - `buildBrain(items, threads, payments, projects, emails, patterns, transactions, dayLogs, habits, goals, milestones, healthDays): Brain` — creates category hubs, a "record" node per real item, aggregates spend/health metrics, builds goal/milestone hub nodes, fuzzy-matches **entity hubs** (clients/people/merchants) across projects/payments/threads/emails, computes cross-category links via `computeCorrelations()` (from `reflect.ts`) plus topic-anchor keyword matching, and produces `GSuggestion[]` (action/insight/watch cards).
  - This is the one module that structurally depends on almost every other domain's *shaped data* (via `types.ts`), though it never calls finance/CRM functions directly — only `reflect.ts`.
- **`graph/simulation.ts`** — framework-free force-directed layout + camera math (extracted from `Mindmap.tsx`), fully independent of `graph.ts` (pure geometry, no domain imports).
  - `computeHomeLayout(nodes, childrenOf)` — radial layout, categories on a ring, children fanned recursively.
  - `physicsStep(opts)` — one physics tick (category-pinning, repulsion, edge springs, damped integration, idle sine-wave drift), **mutates in place by design**.
  - `fitCamera`, `stepCameraToward`, `zoomCameraAround`, `hitTestNode`.
  - Test: `graph/simulation.test.ts`.

---

## 8. Shared utilities (`src/lib/*`)

- **`supabase.ts`** (~1,800 lines) — the Supabase client + the **entire data-access layer**. Exports `supabase` (the `createClient()` instance), `currentUserId()`, `isDbId()`, and ~90 `fetch*`/`create*Row`/`update*Row`/`delete*Row`/`persist*`/`upsert*` functions — one CRUD group per domain table (finance, CRM/projects, cleaning, habits, goals, braindump, dog, health, checkins, notifications, screentime, meetings, blocks, brain-state, learned-facts, people, interactions, admin-items, health-conditions, summaries, inferences), plus generic `forgetRecord(table, id)` and `searchMemory(query, limit)`. This is the single integration point every domain module reads/writes through — it has no business logic of its own, only thin row-shaping.
- **`braindump.ts`** — `extractUrl`, `detectUrlKind`, `detectFileKind`, `detectTextShare` (classify a shared payload); `invokeBraindumpIngest(entryId)` (fires the `braindump-ingest` edge function, best-effort); `braindumpThumbUrl(path)` (signed URL for a stored thumbnail).
- **`claudeImport.ts`** — `parseClaudeExport(raw): ClaudeImportRecord[]` — tolerant of both legacy (`text` string) and new (`content[]` block array) message shapes, caps markdown at 16,000 chars, skips malformed conversations rather than throwing.
- **`dates.ts`** — `daysUntil`, `overdueLabel`, `deadlineInfo(iso, today?)` (CRM project-card badge style), `dueLabel(iso, opts?)` (compact dashboard/task/payment row style).
- **`datetimeLocal.ts`** — `isoToDatetimeLocal(iso)`, `nowDatetimeLocal()` — for `<input type="datetime-local">`.
- **`format.ts`** — canonical euro formatters: `eur(n)` (2-decimal ledger), `eur0(n)` (0-decimal summary), `eurK(n)` (abbreviated, e.g. `€1.5k`).
- **`gcal.ts`** — Google Calendar deep-link builder (no OAuth): `googleCalendarUrl(d: TaskDraft)`, `googleCalendarUrlForBlock(b: PlanBlock)`.
- **`syncStatus.ts`** — health check for every ingestion pipeline. `SYNC_SOURCES` (one entry per pipeline with warn/down age thresholds), `fetchSyncStatus()`, `humanizeAge`, `formatAbsolute`, `HEALTH_META`.
- **`useLongPress.ts`**, **`usePersistedState.ts`** — see [§5](#5-custom-hooks).
- **`utils.ts`** — `cn(...inputs)` — `clsx` + `tailwind-merge` classname helper.

---

## 9. Top-level orchestration files

- **`src/types.ts`** (~790 lines) — the entire domain model, grouped by layer:
  - **Intake/Understand:** `Domain`, `ItemKind`, `Sentiment`, `CaptureSource`, `RawItem`, `StructuredItem`.
  - **Braindump v2:** `BraindumpSourceKind`, `BraindumpStatus`, `BraindumpEntry`, `BraindumpInput`.
  - **REMEMBER (3 stores):** `Essential`, `Thread`, `Pattern`.
  - **Event spine (PM-201 Slice 0):** `LifeDomain` (a life-area axis distinct from the business `Domain`), `Tier` (`normaal`/`geheim`), `EventSource`, `RecordStatus`, `Envelope` (the universal metadata envelope), `EventRecord` (append-only `events` row), `TypeRegistryEntry`.
  - **Inference engine (Slice 1):** `InferenceDecision`, `InferredItem`.
  - **Slice 2 domains:** `PersonKind`, `Person`, `InteractionChannel`, `Interaction`, `AdminCategory`, `AdminItem`, `HealthConditionStatus`, `HealthCondition`.
  - **Memory & retrieval (Slice 3):** `MemorySummary`, `MemoryHit`.
  - **Passive-sensed substance:** `DayLog`, `Transaction`, `VendorTag`, `Habit`.
  - **Health:** `HealthDay`, `Checkin`.
  - **Notifications:** `NotificationPrefs`.
  - **Behaviour sense:** `AppUse`, `ScreenDay`, `MeetingDay`.
  - **Projects/CRM:** `ProjectStatus`, `Priority`, `TaskDraft`, `Project`, `Recurrence`, `ProjectMilestone`, `ProjectTask`, `HourEntry`, `AppSettings`, `InvoiceStatus`, `Invoice`, `ActivityLink`, `ActivityEntry`, `ClientStatus`, `Client`, `Channel`, `MessageSource`, `Message`.
  - **North Star:** `Goal`, `Milestone`, `GoalProposal`.
  - **Dagplanner:** `PlanBlockKind`, `PlanBlock`.
  - **Payments:** `PaymentDirection`, `PaymentStatus`, `Payment`.
  - **Kyra (dog):** `DogKind`, `DogEntry`, `DogMedicalType`, `DogMedical`, `DogReminder`, `DogProfile`.
  - **Subscriptions:** `Cadence`, `Subscription`.
  - **Inbox:** `EmailItem`.
  - **Surface + Act:** `Block`, `Nudge`.
  - **Reflect digest:** `Correlation`, `Anomaly`, `ReflectDigest`.
  - `src/heyra/agents/types.ts` is a separate, smaller types file scoped only to the agent contract (`Agent`, `AgentContext`, `AgentResult`) — not general schema.
- **`src/domains.ts`** — cross-cutting Domain/date helpers used by nearly every screen: `today()`/`TODAY` (Amsterdam timezone), `DOMAIN_META`, `DOMAIN_HEX`, `KIND_LABEL`, `SENTIMENT_META`, `fmtDate`, `daysBetween`, `habitStreak`.
- **`src/understand.ts`** — Layer 2 "UNDERSTAND" text classification. `Classification { domain, kind, sentiment, summary }`, `validateClassification`, `classify(text, source)` (deterministic keyword-hint scoring — the reference/fallback implementation), `classifyWithBrain(text, source)` (brain-first, falls back to `classify()`).
- **`src/reflect.ts`** — Layer 4 "REFLECT" cross-domain correlation engine, the keystone consumed by `signalAgent`, `graph.ts`, and `derive.ts`'s `buildNudge`.
  - `computeCorrelations(logs, txns, screen?, meetings?, deadlines?, habits?): Correlation[]` — 6 rules (sleep↔energy, spend↔deadlines, energy↔convenience-spend, screentime↔energy, meetings↔energy, habits↔energy), each gated behind an honesty check so nothing is reported without real signal.
  - `computeAnomalies(logs, txns, threads): Anomaly[]` — overdue-thread + outlier-spend anomalies.
  - `applyReflection(prev, evidenced)` — reinforces/decays `Pattern[]` confidence over time.
  - `runReflect(...)` — the nightly pass entry point; `buildNarrativePrompt`, `NARRATIVE_SYSTEM_PROMPT`.
- **`src/derive.ts`** — reconstructs REMEMBER-layer data from live Supabase rows.
  - `deriveEssentials`, `deriveThreads` (open projects + high-potential leads become open loops), `deriveDeadlines`, `applyCheckins`, `deriveDayLogs`, `hasSleepSignal`/`hasEnergySignal` (guard functions reused by `reflect.ts`), `buildNudge(threads, projects, correlations, anomalies, reflectCount?)` (single most-important prompt: overdue loop → blocked project → strongest correlation → next deadline → calm default), `deriveBaselinePatterns`.
- **`src/mockData.ts`** — all-empty seed constants (the app is live-data-only; typed empty arrays/defaults) plus `STORAGE_KEY`, `OPENING_BALANCE`.

---

## 10. Cross-module dependency graph

```
finance/            leaf — only types.ts / domains.ts
lib/crm/             leaf — only types.ts / domains.ts (gmailInbox → emailClassify internally)
cleaning/            leaf — only domains.ts

heyra/agents/vendorAgent.ts  ──► finance/categories.ts     (the one hard cross-domain-module edge)
heyra/agents/signalAgent.ts  ──► reflect.ts, derive.ts
heyra/router.ts, skills.ts   ──► understand.ts

graph.ts             ──► reflect.ts (computeCorrelations); reads shaped data from types.ts
graph/simulation.ts   independent — pure geometry, no domain imports at all

reflect.ts   ◄──►  derive.ts   (reflect.ts uses hasSleepSignal/hasEnergySignal from derive.ts;
                                 derive.ts's buildNudge consumes Correlation[] from reflect.ts —
                                 wired together in store.ts)

lib/supabase.ts      the shared persistence backbone every domain module reads/writes through

store.ts             the only file importing from ALL of: finance, crm, cleaning, heyra, lib
                      simultaneously — the central orchestrator
```

heyra does **not** import CRM or cleaning modules directly — only their shaped `types.ts` data via the store.

---

## 11. Data layer / database schema

No `supabase/config.toml` or seed-data files exist in the repo. There is **no Supabase-generated types file** — `src/types.ts` is the hand-maintained canonical schema (kept in sync manually alongside migrations).

All tables are owner-scoped via `user_id` + an `owner` RLS policy. Passively-ingested tables use `REPLICA IDENTITY FULL` for Realtime and idempotent upserts (`UNIQUE` on `external_id`/`dedup_key`).

### Migrations, in order (`supabase/migrations/`, 28 files)

| # | File | Summary |
|---|------|---------|
| 1 | `0001_init.sql` | Initial schema. Enables `pg_cron`, `pgcrypto`. Creates `health_daily_stats`, `finance_tx`, `subscriptions`, `spotify_history` (later dropped), `location_visits` (later dropped), and one table per remaining core data stream (habits, goals, dog_log, projects, clients, gmail_messages, day_blocks, brain_state, etc.). |
| 2 | `20260627220000_pipeline_columns.sql` | Adds `domain`/`source`/`paid_at`/`payment_method` to `finance_tx`; enrichment columns to `spotify_history` (now dead); creates `payments` (expected invoices/calendar events). |
| 3 | `20260628000001_health_sheets_tables.sql` | Extends `health_daily_stats` (distance/calories/duration); creates `health_body_metrics` (weight/body fat) and `health_sleep` (sleep sessions + stage breakdown). |
| 4 | `20260629000000_notion_enrich.sql` | Adds `notion_url`/`type`/`prioriteit`/`start_datum` to `projects`; creates `clients` (mirrors Notion Clients DB). |
| 5 | `20260630120000_drop_unused_sources.sql` | Drops `spotify_history` and `location_visits`. |
| 6 | `20260630140000_screentime_daily.sql` | Creates `screentime_daily` (per-day phone-unlock/pickup counts). |
| 7 | `20260701090000_daily_checkin.sql` | Creates `daily_checkin` (energy 1-5, mood 1-5, note) — the one subjective signal Reflect correlates against sensor data. |
| 8 | `20260701120000_crm_native.sql` | Turns CRM from a read-only Notion mirror into a full native project manager: adds `client_id`/`deliverables`/`scope_text`/`notes`/`archived`/`updated_at` to `projects`; creates `project_milestones`, `project_tasks`, `project_hours`, `project_invoices`, `project_activity`, `client_messages` (unified email/fiverr/whatsapp inbox with dedup index). |
| 9 | `20260701150000_notifications.sql` | Enables `pg_net`. Creates `notification_prefs` (Telegram chat link + per-category toggles/timing) and `notification_log` (idempotency ledger for `notify-tick`). |
| 10 | `20260702120000_heyra_memory.sql` | Creates `heyra_memory` — one JSONB row per user holding durable facts (distinct from `brain_state`). |
| 11 | `20260702160000_vendor_tags.sql` | Creates `vendor_tags` (auto-categorisation cache: vendor→category/domain). Adds `note` to `finance_tx`. |
| 12 | `20260702170000_braindump.sql` | Creates `braindump_entries` (Braindump v2 pipeline: status pending→ready, domain/kind/sentiment/tags/thumb/meta). Creates private `braindump` storage bucket + owner-scoped storage policies. |
| 13 | `20260703120000_normalize_finance_categories.sql` | Data-only backfill: normalizes historical lowercase `finance_tx.category` to the canonical capitalized taxonomy. |
| 14 | `20260703130000_crm_adhd.sql` | Adds `last_contacted_at`/`follow_up_cycle_days` to `clients` (follow-up health indicator); adds `billed` flag to `project_hours`; creates `app_settings` (one row/user, global hourly rate). |
| 15 | `20260704120000_client_messages_dedup_full_unique.sql` | Bug fix: full unique index on `client_messages(user_id, source, external_id)` replacing a broken partial index that couldn't serve as an `ON CONFLICT` arbiter. |
| 16 | `20260704140000_clients_aliases.sql` | Adds `aliases` (text[]) to `clients` — sender emails/domains for in-app Gmail→client attribution. |
| 17 | `20260711120000_ingested_at.sql` | Adds `ingested_at` timestamptz to all purely-ingested tables; backfills historical estimate; installs a `BEFORE INSERT OR UPDATE` trigger (`set_ingested_at()`) for an accurate "last synced" indicator. |
| 18 | `20260711130000_phone_events.sql` | Creates `phone_events` (raw unlock/screen-off/screen-on log from MacroDroid); adds `source` column to `health_sleep` so phone-derived sleep never overwrites real Samsung Health data. |
| 19 | `20260714120000_event_spine.sql` | **PM-201 Slice 0.** Creates `events` (append-only universal envelope log) and `type_registry` (per-type metadata). Adds `tier` to `braindump_entries`, `daily_checkin`, `finance_tx`, `brain_state`, `heyra_memory`. Installs `emit_event()` trigger on 14 fact tables that mirrors every insert/update into `events`. |
| 20 | `20260714121000_harden_emit_event.sql` | Security hardening: pins `search_path=''` on `emit_event()`. |
| 21 | `20260714130000_inference_engine.sql` | **Slice 1.** Creates `run_inference()` (SECURITY DEFINER, hourly via pg_cron) implementing rules R1/R5/R6/R7. Creates `confirm_inference(event_id, decision)` and a `rule_performance` view. |
| 22 | `20260714131000_harden_inference_functions.sql` | Revokes public/anon/authenticated execute on `run_inference()`; restricts `confirm_inference()` to authenticated + service_role. |
| 23 | `20260714140000_slice2_domains.sql` | **Slice 2.** Creates `person`, `interaction`, `admin_item`, `admin_document`, `health_condition`. Adds rules R3/R4, plus promotion rule P1 (3+ vet visits in 6 weeks → auto health_condition). |
| 24 | `20260714150000_memory_retrieval.sql` | **Slice 3.** Creates `summaries` + `build_summaries()` (nightly rollup, no LLM) and `search_memory(query, limit)` (Postgres full-text search, Dutch config, excludes `tier='geheim'`). |
| 25 | `20260714160000_learning_loop.sql` | **Slice 4.** `rule_suppressed()` + trigger that mutes rules with ≥3 resolutions and ≥70% rejection; `run_self_audit()` (monthly); `forget(table, id)` (hard-delete + tombstone event, right-to-be-forgotten). |
| 26 | `20260714161000_harden_learning_loop.sql` | Restricts execute on `rule_suppressed`/`suppress_muted_inferences` and `forget()`. |
| 27 | `20260714170000_app_sessions.sql` | Creates `app_sessions` (per-app foreground time from a MacroDroid stopwatch macro); derives daily per-app totals into `screentime`. |
| 28 | `20260714170000_cleaning_schedule.sql` | Creates `cleaning_log` (per-task-per-day completion; schedule content itself lives in `src/cleaning/schedule.ts`). |

> Migrations #27 and #28 share the same timestamp prefix — harmless (Postgres/tooling sorts by full filename) but worth flagging if migration tooling ever sorts strictly by numeric prefix.

For the design rationale behind Slices 0-4 (event-sourcing principles, the R1-R9 derivation rules, P1-P5 promotion rules, and the `pg_cron` job schedule), see [`docs/DATA-ARCHITECTURE.md`](./DATA-ARCHITECTURE.md).

---

## 12. Edge functions

`supabase/functions/` — 20 functions + `_shared/` (`anthropic.ts`, `dates.ts`, `http.ts`, `telegram.ts`, `webpage.ts`, `cognee.ts`, `embeddings.ts`, `frontmatter.ts`).

| Function | Trigger | Purpose |
|---|---|---|
| `gbk-overview` | client-invoked (`[verify_jwt]`) | Proxies the Geldrop Buurtkaart WordPress API with server-side `GBK_API_KEY`, consumed by Buurtkaart. |
| `health-sheets-ingest` | webhook (Apps Script) | Upserts Google Sheets health payloads into `health_*` tables. |
| `payments-sheet-ingest` | webhook (Apps Script) | Upserts payments-sheet rows into `payments`/`finance_tx`. |
| `screentime-sheet-ingest` | webhook (Apps Script) | Upserts screentime-sheet rows into `screentime`. |
| `wallet-ingest` | webhook (MacroDroid) | Bank/wallet payment notifications → `finance_tx`, realtime. |
| `phone-events-ingest` | webhook (MacroDroid) | Unlock/screen-off/app-usage events → `phone_events`/`app_sessions`; derives `health_sleep` (source='phone') and `screentime_daily`. |
| `weight-ingest` | webhook (MacroDroid, experimental) | Smart-scale notification parsing → `health_body_metrics`. |
| `heyra-brain` | client-invoked (`[verify_jwt]`) | Thin proxy to the Anthropic Messages API for all HEYRA agents — see `src/heyra/brainClient.ts`. |
| `categorize-vendor` | client-invoked (`[verify_jwt]`) | Claude Haiku + web search → tags a merchant into `vendor_tags` — called by `src/heyra/agents/vendorAgent.ts`. |
| `braindump-ingest` | client-invoked (`[verify_jwt]`) | Braindump v2 pipeline (text/link/image/pdf/social → Markdown via Claude); delegates video/audio to the external worker — called by `src/lib/braindump.ts`. |
| `notify-tick` | cron every 5 min (bearer `CRON_SECRET`, no JWT) | Composes/sends proactive Telegram nudges (briefing, check-in, habit reminders, urgent alerts, inference digest). |
| `telegram-webhook` | webhook (Telegram, `X-Telegram-Bot-Api-Secret-Token`) | Receives Telegram updates (`/start`, `/today`, `/finance`, `/note`, inline confirm/reject buttons). |

---

## 13. Integrations

Architecture per `integrations/README.md`: **Apps Script + Sheets + Geldrop Buurtkaart WordPress API (ingestion) → Supabase (Postgres/Realtime/Edge Functions) → React app.** Everything writes only to the one Supabase project. Projects/Clients (native CRM) have no external sync.

- **`integrations/apps-script/`** — one standalone Apps Script project ("OSLIFE ingest"): `Code.gs` (hub — Gmail→gmail_messages, Calendar→day_blocks, payments calendar→payments via direct PostgREST), `health-sheets.gs`, `payments-sheet.gs`, `screentime-sheet.gs` (sheet readers), `setup-health-sheet.gs`, `appsscript.json`.
- **`integrations/braindump-worker/`** — a small standalone Node service (Dockerfile + `server.mjs`) that does what an Edge Function can't: `yt-dlp` download + `ffmpeg` transcode + Groq Whisper transcription + Claude Haiku → Markdown. Called by `braindump-ingest` via `POST /transcribe` (bearer `WORKER_SECRET`); updates `braindump_entries` via service role.
- **`integrations/macrodroid/`** — setup docs + one exported macro (`oslife-app-timer.macro`) for Android automations: `bank-notifications.md` (→ `wallet-ingest`), `phone-sleep.md` (→ `phone-events-ingest`), `app-timer.md` (per-app stopwatch → `phone-events-ingest`), `weight-notifications.md` (→ `weight-ingest`, experimental).

Finance dedup note: `payments-sheet-ingest` and the in-app ABN AMRO CSV import share `dedup_key = "YYYY-MM-DD|amount"`, deduped via `UNIQUE(user_id, dedup_key)`.

---

## 14. Related documentation

| Doc | Covers | Status |
|---|---|---|
| [`README.md`](../README.md) | Top-level product description, run instructions, architecture diagram, per-module data-source table, native CRM/vendor-categorization/phone-derived-sleep/screen-time prose. | Up to date with latest features; does **not** mention the event-spine/inference/memory/learning-loop system (see `DATA-ARCHITECTURE.md`) — it documents only the current-state projection tables. |
| [`docs/DATA-ARCHITECTURE.md`](./DATA-ARCHITECTURE.md) | The canonical design doc for the PM-201 event-sourcing upgrade (Slices 0-4): event spine, inference engine, new life domains, memory/retrieval, learning loop — principles, the R1-R9 derivation rules, P1-P5 promotion rules, `pg_cron` job schedule. | Current, matches the latest migrations. |
| [`docs/CODEBASE_AUDIT.md`](./CODEBASE_AUDIT.md) | A technical-debt/bloat audit (128 files, ~23,200 LOC at the time) — copy-paste CRUD, dead code, duplicated modal/formatter/deadline logic, the dual live Notion-sync writer as the one live correctness hazard. | **Predates the entire PM-201 event-spine/inference/memory/learning-loop work** (migrations dated 2026-07-14/15) — stale for anything added since 2026-07-03. Not modified as part of this doc. |
| [`docs/RUNBOOK-phase4-cutover.md`](./RUNBOOK-phase4-cutover.md) | Operator checklist: relocate `wallet-ingest`, apply the finance-category-normalization migration, cut over `notion-sync`. | **Superseded** — Notion integration was removed entirely (no cutover; `notion-sync`/`notion-mutate`/`notion-hq` deleted, `Code.gs`'s `syncNotion`/`syncClients` removed) rather than migrated. Kept for history only. |
| [`docs/SECRETS.md`](./SECRETS.md) | Every secret/env-var mapped to its platform (Vercel, Supabase Edge Function secrets, Apps Script Script Properties), plus one-time Telegram bot setup. | Consistent with `.env.example`. |
| [`Google_DataPortability_API_Onderzoek.md`](../Google_DataPortability_API_Onderzoek.md) | Research report evaluating Google's Data Portability API as an ingestion source — concludes Gmail/Calendar/Photos/Drive/Google Fit (the most valuable sources) aren't available through it. | Standalone research artifact, not implemented. |
| **This document** (`docs/CODEBASE_MAP.md`) | Every screen, component, hook, domain module, data structure, database table, edge function, and integration, plus how they relate. | New — keep in sync as screens/modules/schema evolve. |
