# OSLIFE Codebase Audit — Technical Debt & Bloat Reduction

*Audit date: 2026-07-03 · Baseline commit: `fc517d6` · No behavior changes proposed without an explicit flag.*

## Repo Audit Summary

**Scanned:** 128 source files, ~23,200 LOC
- `src/`: 88 files, 18,314 LOC (TS/TSX)
- `supabase/`: 26 files, 3,461 LOC (edge functions + migrations)
- `integrations/`: 14 files, 1,453 LOC (Apps Script, braindump-worker, wallet-ingest)

**Build health:** `tsc -b` passes clean. **Test coverage: zero test files exist** — this constrains how aggressive refactors can safely be (see plan ordering).

**Top 3 bloat culprits:**
1. **Copy-paste CRUD plumbing** — `src/lib/supabase.ts` (1,490 LOC) hand-writes fetch/create/update/delete for ~13 tables; every field appears in 4 places. `src/store.ts` (1,665 LOC) repeats the same optimistic-update pattern 11×, patch pattern 8×, delete pattern 15×. (~800 LOC)
2. **Dead code** — the entire `src/lib/notion/` directory (532 LOC, zero importers), plus dead store actions, dead exports, and `Placeholder.tsx`. (~620 LOC)
3. **Per-view reinvention** — 8 independent `eur` formatters with 4 incompatible behaviors, 6 modal implementations, 10 hand-rolled "Xd te laat" deadline blocks, 21 hex-tinted pill badges, 5 KPI mini-card clones, triplicated form blocks inside `Dog.tsx`. (~1,100 LOC)

**One live correctness hazard (not just bloat):** Notion→Supabase sync runs through **two independent, parallel implementations** — `integrations/apps-script/Code.gs:342-473` (on a 15-min trigger) *and* `supabase/functions/notion-sync/`. Same tables, same mappings, currently aligned by luck (Code.gs doesn't handle relation-type Client fields; notion-sync does).

## Findings Table

| File/Module | Issue | Impact | Risk | Proposed Fix |
|---|---|---|---|---|
| `src/lib/notion/` (3 files, 532 LOC) | Entirely dead — zero importers; self-described "blueprint" for edge functions that can't import it (different runtime) | HIGH | None | Delete directory |
| `src/lib/supabase.ts:345-1490` | ~19 `fetch*` + 12 `create*Row` + 9 `update*Row` + 13 `delete*Row` functions, all mechanically identical per table | HIGH | Low | Generic `fetchRows`/`insertRow`/`updateRow`/`deleteRow` + per-entity column maps (−280–350 LOC) |
| `src/store.ts:412-1423` | Optimistic create ×11, patch ×8, filter-delete ×15, `persistBrainState` call ×7 — all copy-paste | HIGH | Low | `optimisticCreate`/`patchSlice`/`deleteFromSlice` helpers (−120–150 LOC) |
| `src/store.ts` dead actions | `persistProjectPatch`+`mutateNotion` (imported, never called), `setProjectStatus`, `markMessageRead`, `updateSubscription`, `updateProjectTask`, `addDogReminder`, `export TODAY` — all 0 refs | MED | None | Delete (~90 LOC incl. supabase.ts halves) |
| `src/views/Dog.tsx:120-607` | Three modals (`DetailLog`/`EditEntry`/`AddEntry`) carry the same per-kind field blocks copy-pasted 3× (~250 LOC); also hosts generic `useLongPress`, `Overlay`, photo/date helpers | HIGH | Low | One `EntryModal({mode})` + shared `EntryFields`; move hook/helpers to `src/lib` (−280 LOC) |
| `src/views/Money.tsx:48-192` | Full ABN AMRO CSV parser (7 pure functions, zero React) inside the view; plus 3 sub-features in one 963-LOC file | MED | Very low | Extract to `src/finance/csvImport.ts` — becomes unit-testable |
| 8 files | 8 `eur`/`eur0` definitions, **4 incompatible formats** (Dashboard shows `€880`, Money `€880,00`) | MED | Low ⚠️ | Canonical `src/lib/format.ts`. **Flag: unifying formats is an intentional visual behavior change** |
| 8 files, 10 sites | Hand-rolled `"Xd te laat"` deadline logic; `crm.tsx:133 deadlineInfo()` already exists but 9 sites reimplement it (with slightly drifting thresholds) | MED | Med ⚠️ | Adopt `deadlineInfo()` everywhere. **Flag: threshold wording varies per site — verify each** |
| 10 files | 6 modal/overlay shells (3 visual styles), 2 body-scroll-lock copies, 4th confirm mechanism next to 5 `window.confirm` calls | MED | Med | Adopt `Sheet` (crm.tsx) as the one modal; `ConfirmDialog`. **Flag: `confirm()`→dialog is a UX change** |
| `views/Eyes.tsx` + `views/Dakmeester.tsx` | Structural twins: byte-identical `Section` helper, identical roadmap/KPI blocks (~290 LOC combined) | MED | Low | One data-driven view + 2 config objects (−140 LOC) |
| `views/CRM.tsx` + `views/Projects.tsx` | Duplicated `STATUS_FILTERS`, grid/lijst toggle, `openClientById`, modal wiring | MED | Med | Shared `ProjectBrowser` component/hook (−90 LOC) |
| 7 files, 29 charts | Recharts tooltip `contentStyle` inlined 9×, axis tick style ~20× | MED | Low | `chartTip`/`axisTick` constants + thin wrappers (−120 LOC) |
| 8 files, 21 sites | Hex pill `style={{color:hex, background:hex+'22'}}` | LOW | Low | `<Pill hex>` primitive in `ui.tsx` (−80 LOC) |
| `supabase/functions/*` (10 of 12) | Identical `CORS`+`json()` helper per function; 3 auth idioms each reimplementing parsing; `createClient`+env preamble ×7 | MED | Low | `_shared/http.ts` (−120–150 LOC) |
| `supabase/functions/notion-mutate/index.ts:26-60` | Third in-repo copy of the Notion client, inlined with a false justification (siblings import `_shared/notion.ts` fine) | LOW | Low | Import from `_shared/notion.ts` (−35 LOC) |
| `Code.gs:342-473` vs `notion-sync/` | **Dual live Notion→Supabase sync paths** — drift hazard, double API traffic | HIGH | Med ⚠️ | Retire Code.gs sync, schedule `notion-sync` via pg_cron (same pattern as notify-tick). **Flag: operational change — needs cron + secret setup** |
| `integrations/edge-functions/wallet-ingest.ts` | Deployable edge function living outside `supabase/functions/`; private lowercase category map (`'fuel'`) conflicting with canonical `TX_CATEGORIES` (`'Transport'`); `payments-sheet-ingest:76` defaults `'other'` vs `'Other'` | MED | Med ⚠️ | Move to `supabase/functions/wallet-ingest/`; align categories. **Flag: existing DB rows keep old casing — needs one-off data normalization** |
| Anthropic plumbing ×4 | `extractText` + fenced-JSON parser + API consts duplicated in `braindump-ingest`, `categorize-vendor`, `heyra-brain`, worker `server.mjs` | MED | Low | `_shared/anthropic.ts` (−60–80 LOC; worker copy stays — different runtime) |
| `telegram-webhook` + `notify-tick` | `amsterdamToday`/`daysBetween`/`fmtDateNL` + `Thread` type duplicated | LOW | Low | `_shared/dates.ts` (−40–50 LOC) |
| `components/Placeholder.tsx`, `views/Messages.tsx:5` | Dead component (22 LOC); dead `TODAY` import | LOW | None | Delete |
| `vite.config.js` + `vite.config.d.ts` | Compiled output of `vite.config.ts` committed to the repo | LOW | None | Delete both, add `vite.config.js`/`*.d.ts` to `.gitignore` |
| `src/store.ts:1465-1613` | `loadLiveData`'s 25-fetcher list + 22 near-identical Realtime handlers name every fetcher twice | MED | Med ⚠️ | One `SLICE_SYNC` config array drives both. **Flag: per-table overwrite/recompute side-effects are subtle — highest-care refactor** |
| `src/store.ts` persist middleware | Persists server-owned slices to localStorage; 30-guard `onRehydrateStorage` exists solely to patch the resulting staleness | MED | Med ⚠️ | `partialize` to persist only local-only slices. **Flag: changes offline/first-paint behavior — do deliberately, or skip** |
| `types.ts` + tsconfig | Dead `Task` interface, ~7 unreferenced exported aliases; `noUnusedLocals/Parameters: false` is what let dead imports accumulate | LOW | None | De-export/delete; flip both flags to `true` |
| Stale comments | `telegram-webhook:353` claims `habit_log` lacks a unique constraint that `0001_init.sql:143` declares (justifying a non-atomic delete-then-insert); `screentime-sheet.gs:9` says unlocks are skipped but code sends them | LOW | Low ⚠️ | Verify prod schema matches migrations, then simplify to `upsert`. **Flag: touches write path** |
| `Google_DataPortability_API_Onderzoek.md` (502 LOC, repo root) | Research note in root | LOW | None | Move to `docs/` |

Also noted, not bloat but worth knowing: hardcoded Supabase anon-key fallback in `src/lib/supabase.ts:41-43` silently masks env misconfiguration; `persistAllEmailsRead` (supabase.ts:144) relies purely on RLS for user scoping, inconsistent with siblings; Dashboard/Money money-math kept consistent "by copy-paste and a comment" (Dashboard.tsx:78) instead of a shared selector.

## Refactor Plan (ordered: safe wins → risky)

**Phase 0 — Safety net (do first, ~1 day)**
Zero tests exist. Before any risky phase: add Vitest + a handful of pure-logic tests for the code being touched — CSV parser (after extraction), `derive.ts`/`reflect.ts` selectors, `deadlineInfo`, the new generic CRUD helpers. Also flip `noUnusedLocals`/`noUnusedParameters` to `true` so deletions stay honest.

**Phase 1 — Pure deletion (no behavior change, ~700 LOC, trivial risk)**
1. Delete `src/lib/notion/` (−532)
2. Delete dead store actions + `persistProjectPatch`/`mutateNotion` + dead type exports/imports (−~130)
3. Delete `components/Placeholder.tsx`, `vite.config.js`, `vite.config.d.ts` (−~30)
4. Verify with `tsc -b && vite build`.

**Phase 2 — Extract & consolidate, no visual change (~900 LOC, low risk)**
5. `_shared/http.ts`, `_shared/dates.ts`, `_shared/anthropic.ts` for edge functions; `notion-mutate` imports `_shared/notion.ts` (−260, mechanical, test each function after deploy)
6. Generic CRUD helpers in `supabase.ts` + optimistic-update helpers in `store.ts` (−450; copy column maps verbatim — no behavior change if mechanical)
7. Extract Money.tsx CSV parser → `src/finance/csvImport.ts` + tests; extract Mindmap physics → `src/graph/simulation.ts` (net 0 LOC, big maintainability win)
8. Unify Dog.tsx's three modals (−280); merge Eyes/Dakmeester (−140); `<Pill>` primitive (−80); chart constants (−120)

**Phase 3 — Consolidation with visible/UX effects (⚠️ flagged behavior changes, ~300 LOC)**
9. Canonical `eur` formatters — **intentionally changes decimal rendering on some screens**; pick the format per-context deliberately
10. One modal system + `ConfirmDialog` replacing `window.confirm` — **UX change**
11. `deadlineInfo()` everywhere — verify each site's threshold wording first
12. Merge CRM/Projects shared parts (−90)

**Phase 4 — Structural/operational (highest care, do last, needs Phase 0 tests)**
13. `SLICE_SYNC` config array for loadLiveData + Realtime handlers (−80; subtle per-table side-effects)
14. Retire `Code.gs` Notion sync, schedule `notion-sync` edge function via pg_cron — **eliminates the dual-writer drift hazard**; operational change (cron + secret), roll back by re-enabling the trigger
15. Move `wallet-ingest.ts` into `supabase/functions/` + normalize `finance_tx` category casing (one-off data migration)
16. Optional: `partialize` the persist middleware; split `store.ts` into Zustand slice files (net 0 LOC, big navigability win)

**Explicitly not recommended:** extracting the `notify-tick` ↔ `derive.ts` `buildNudge` duplication (different runtimes, small, already documented); rewriting anything — every issue above is refactorable in place.

## Deps Check

`package.json` is exemplary — **all 6 runtime deps and all 8 dev deps are used and necessary.** Verified: `recharts` (7 files), `zustand` (store), `lucide-react` (30+ files), `@supabase/supabase-js` (client + edge functions). No unused, no redundant, no duplicate-purpose packages. Recommend *adding* one: `vitest` (dev) for Phase 0.

## Est. Impact

- **Projected LOC reduction: ~2,600–3,000 of ~23,200 (≈12%)** — Phases 1–2 alone deliver ~1,600 LOC at low risk with zero behavior change.
- **Complexity reduction (matters more than raw LOC):**
  - `src/lib/supabase.ts` 1,490 → ~1,100; `src/store.ts` 1,665 → ~1,350; `Dog.tsx` 997 → ~700; `Money.tsx` 963 → ~600; `Mindmap.tsx` 721 → ~380
  - New-entity cost drops from ~120 lines across 4 places to a column map + 3 one-liners
  - Eliminates the dual Notion-sync writer (live drift hazard), the 4-way currency-format inconsistency, and the finance category-casing drift
  - Pure logic (CSV import, physics sim, deadline math) becomes unit-testable for the first time
