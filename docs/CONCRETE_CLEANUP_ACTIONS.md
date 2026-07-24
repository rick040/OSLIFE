# OSLIFE Concrete Code Cleanup & Optimization Plan

This blueprint outlines high-value concrete actions you can take to streamline, declutter, and optimize your codebase. It is divided into 5 major domains: Pure Deletions, Store & Data-Access Optimization, Component & View Consolidation, External Integrations & Edge Functions, and Visual/UX Harmonization.

---

## 1. Pure Deletions (No Behavior Change, Low Risk)

These actions safely prune dead code, build artifacts, and research files that are cluttering your workspace.

### Action 1.1: Prune Committed Build Artifacts
* **Target Files**:
  - `vite.config.js` (compiled output)
  - `vite.config.d.ts` (compiled declaration types)
* **Rationale**: These are compiled build outputs. Committing build artifacts causes unnecessary Git clutter and drift.
* **Resolution**:
  1. Delete both files: `rm vite.config.js vite.config.d.ts`
  2. Append them to your `.gitignore`:
     ```text
     vite.config.js
     vite.config.d.ts
     ```

### Action 1.2: Delete Dead Components & Imports
* **Target Files**:
  - `src/components/Placeholder.tsx` (Entirely unused skeleton file)
  - `src/views/Messages.tsx` (Contains unused imports like `TODAY`)
* **Rationale**: Orphaned placeholder templates decrease searchability and pollute the component namespace.
* **Resolution**:
  1. Delete `src/components/Placeholder.tsx`.
  2. Remove dead imports and variables from `src/views/Messages.tsx`.

### Action 1.3: Re-locate Root-Level Research Papers
* **Target Files**:
  - `Google_DataPortability_API_Onderzoek.md` (root folder)
* **Rationale**: Technical research files should live inside the centralized `docs/` folder instead of cluttering the project root.
* **Resolution**: Move the file into the docs directory:
  ```bash
  mv Google_DataPortability_API_Onderzoek.md docs/
  ```

---

## 2. Store & Data-Access Optimization

Your Supabase client writes (~1,490 LOC) and Zustand actions (~1,665 LOC) repeat identical, copy-pasted CRUD cycles across dozens of entities.

### Action 2.1: Implement Generic Client-Side CRUD Helpers
* **Target Files**: `src/lib/supabase.ts`
* **Rationale**: Functions like `createSubscriptionRow`, `createGoalRow`, `createPaymentRow`, `createMilestoneRow`, `createProjectTaskRow`, and `createHourRow` repeat identical `insertRow` shapes. Updates repeat camelCase-to-snake_case property assignments. Deletes repeat the exact same `deleteRow` calls.
* **Resolution**:
  1. Define a mapping dictionary of Column Mappings at the top of `src/lib/supabase.ts` for entities:
     ```typescript
     const COLUMN_MAPS = {
       subscriptions: { name: 'name', amount: 'amount', cadence: 'cadence', nextCharge: 'next_charge_on', active: 'active', notes: 'notes' },
       goals: { title: 'title', domain: 'domain', target: 'target_value', metric: 'unit', deadline: 'due_on' },
       admin_item: { title: 'title', category: 'category', provider: 'provider', renewalOn: 'renewal_on', noticePeriodDays: 'notice_period_days', amount: 'amount', cancellable: 'cancellable', notes: 'notes', tier: 'tier' },
       // and so on...
     };
     ```
  2. Implement standardized generic signatures:
     ```typescript
     async function insertEntity<T>(table: string, row: Partial<T>): Promise<string | null>;
     async function updateEntity<T>(table: string, id: string, patch: Partial<T>): Promise<boolean>;
     ```
  3. Refactor entity-specific functions to delegate directly to these generic wrappers. This alone deletes **300+ lines of redundant boilerplate**.

### Action 2.2: Consolidate Zustand Store Optimistic Actions
* **Target Files**: `src/store.ts`
* **Rationale**: The Zustand store implements optimistic array push, patch, and filter actions separately for ~15 tables, adding ~450 LOC of identical code blocks.
* **Resolution**:
  1. Optimize and use your existing functional micro-helpers:
     ```typescript
     const swapTempId = (set: StoreSet, slice: IdSliceKey, tempId: string) => (realId: string | null) => ...
     const patchSlice = (set: StoreSet, slice: IdSliceKey, id: string, patch: object) => ...
     const removeFromSlice = (set: StoreSet, slice: IdSliceKey, id: string) => ...
     ```
  2. Go through each store action (`deletePayment`, `deleteHolding`, `updateGoal`, `toggleSubscription`) and verify they are fully routed through these micro-helpers. This deletes **~150 LOC** and creates standard, bulletproof rollback/optimistic updates.

### Action 2.3: Delete Dead Zustand Actions
* **Target Files**: `src/store.ts`
* **Rationale**: The actions `persistProjectPatch` (Notion leftover), `mutateNotion`, `setProjectStatus`, and `updateSubscription` are fully defined but have exactly **0 references** across the entire application.
* **Resolution**: Safely excise these unused actions.

---

## 3. Component & View Consolidation

### Action 3.1: Standardize the Twin Side-Business Screens
* **Target Files**:
  - `src/views/Eyes.tsx`
  - `src/views/Dakmeester.tsx`
  - `src/views/SideBusiness.tsx`
* **Rationale**: `Eyes.tsx` and `Dakmeester.tsx` are structurally almost byte-identical. They both wrap `<SideBusiness>` with static JSON data parameters, duplicating identical roadmap renders, CSS structures, and layout wrappers.
* **Resolution**:
  1. Create a config schema in `src/views/SideBusiness.tsx`:
     ```typescript
     export interface SideBusinessConfig {
       badge: { bg: string; fg: string; content: React.ReactNode };
       title: string;
       subtitle: string;
       intro: string;
       callout: { bg: string; border: string; titleColor: string; bodyColor: string; title: string; body: React.ReactNode };
       stats: { label: string; value: string }[];
       kpis: { label: string; value: string; target: string }[];
       roadmap: { label: string; done: boolean; deadline?: string }[];
       revenue: { source: string; share: string; scale: string }[];
     }
     ```
  2. Rewrite `Eyes.tsx` and `Dakmeester.tsx` to export raw, static configuration objects rather than separate React components.
  3. Change the router in `App.tsx` to mount a single `<SideBusiness config={EYES_CONFIG} />` or `<SideBusiness config={DAKMEESTER_CONFIG} />`, reducing code footprint by **~200 LOC**.

### Action 3.2: Extract Financial CSV Parsing
* **Target Files**: `src/views/Money.tsx` → `src/finance/csvImport.ts`
* **Rationale**: The complete multi-regex, line-by-line CSV parsing algorithm is currently embedded inside the rendering loop of the React view `Money.tsx`. This violates "Separation of Concerns" and makes testing the bank import logic impossible.
* **Resolution**:
  1. Extract `parseCsv(txt: string)` and its pure CSV line helpers from `Money.tsx` into a separate file: `src/finance/csvImport.ts`.
  2. Write unit tests inside `src/finance/csvImport.test.ts` to test various bank export formats (e.g., ABN AMRO CSV) with static mock strings.

### Action 3.3: Consolidate Duplicated Modal Modifiers
* **Target Files**: `src/views/Dog.tsx`
* **Rationale**: The `Dog` component includes three different overlaid sub-modals (`DetailLog`, `EditEntry`, and `AddEntry`) that contain copy-pasted layout blocks, form inputs, styling parameters, and validation steps.
* **Resolution**:
  1. Implement a single unified `<EntryModal>` sub-component inside `Dog.tsx` or a separate file.
  2. Pass a dynamic `mode: 'add' | 'edit' | 'detail'` prop.
  3. Drive conditional inputs (such as choosing the activity type during manual addition vs static type headers during edits) dynamically from the mode, deleting **~250 LOC** of identical layout blocks.

### Action 3.4: Streamline Recharts Chart Styling
* **Target Files**: Across 8 view files (including `Dog.tsx`, `Vitals.tsx`, `Dashboard.tsx`, etc.)
* **Rationale**: Customized chart styling configuration options like tooltip `contentStyle={{ background: '#F4F5EE', borderRadius: '12px', border: '1px solid #E7E9DE' }}` or axis tick specs are copy-pasted and duplicated across dozens of Recharts elements.
* **Resolution**:
  1. Extract canonical Recharts style constants into a centralized asset file `src/components/chart.ts`:
     ```typescript
     export const CHART_TOOLTIP_STYLE = { background: '#F4F5EE', borderRadius: '12px', border: '1px solid #E7E9DE' };
     export const CHART_AXIS_STYLE = { fontSize: 11, fill: '#8C9180', fontFamily: 'monospace' };
     ```
  2. Reference these constants globally to shrink your JSX charts and centralize visual customization.

### Action 3.5: Build a Reusable Pill Badge Primitive
* **Target Files**: `src/components/ui.tsx` or `src/components/ui/badge.tsx`
* **Rationale**: The app features a high frequency of pastel pill badges carrying hex colors overlaid with low alpha opacities (e.g., `style={{ color: hex, backgroundColor: hex + '22' }}`). This logic is duplicated inline across 20+ view files.
* **Resolution**:
  1. Export a single standardized component from your UI kit:
     ```typescript
     export function ColoredPill({ hex, label }: { hex: string; label: string }) {
       return (
         <span
           className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
           style={{ color: hex, backgroundColor: `${hex}22` }}
         >
           {label}
         </span>
       );
     }
     ```
  2. Refactor inline styles in view cards to reference `<ColoredPill>` instead of repeating hexadecimal string concat operations.

---

## 4. External Integrations & Edge Functions

These operations address integration redundancy and clean up background processing.

### Action 4.1: Retire Redundant Notion Sync Paths
* **Target Files**: `integrations/apps-script/Code.gs` and `supabase/functions/notion-sync/`
* **Rationale**: Notion synchronization currently runs through two independent, parallel, and redundant execution pathways. `Code.gs` syncs on a timed 15-minute Google trigger, while `supabase/functions/notion-sync/` is also deployed. Running both creates a data-writer race condition, wastes API tokens, and risks data synchronization drift.
* **Resolution**:
  1. Retain the Supabase Edge Function `notion-sync` as the single source of truth (as it supports relations like *Client* fields better).
  2. Remove the legacy sync functions (`syncNotionToSupabase`) from your Google Apps Script `Code.gs`.
  3. Set up the Edge Function to trigger on a stable Postgres cron schedule (`pg_cron`) inside Supabase.

### Action 4.2: Move the Wallet Ingestion Script inside Supabase
* **Target Files**: `integrations/edge-functions/wallet-ingest.ts`
* **Rationale**: `wallet-ingest` is a deployable Supabase Edge Function, but it currently resides under `integrations/` instead of `supabase/functions/wallet-ingest/`. This separates it from your core migrations and local development environment.
* **Resolution**:
  1. Relocate the directory: `mv integrations/edge-functions/wallet-ingest.ts supabase/functions/wallet-ingest/index.ts`
  2. Align category cases: `wallet-ingest` uses lowercase fields (e.g., `'fuel'`), while the canonical `TX_CATEGORIES` definitions use capitalized formats (e.g., `'Transport'`). Standardize categories to capital-case at ingestion time.

### Action 4.3: Unify Duplicate Anthropic SDK Boilerplate
* **Target Files**:
  - `supabase/functions/braindump-ingest/index.ts`
  - `supabase/functions/categorize-vendor/index.ts`
  - `supabase/functions/heyra-brain/index.ts`
* **Rationale**: Every function contacting Anthropic duplicates helper scripts for extracting raw text from Claude responses, parsing enclosed JSON blocks, and declaring model configurations.
* **Resolution**:
  1. Extract shared Anthropic parsing logic into a reusable helper script under `supabase/functions/_shared/anthropic.ts`.
  2. Import `extractJSONBlock` and default model constants from `_shared/anthropic.ts` into each Edge Function.

---

## 5. Visual & UX Harmonization

Unifying your user experience across pages by consolidating visual formats.

### Action 5.1: Create a Single Canonical Currency Formatter
* **Target Files**: Standardized in `src/lib/format.ts` and imported across all views.
* **Rationale**: The codebase contains **8 independent definitions** of currency formatters. This causes visual drift: the Dashboard shows `€880` while the Money view displays `€880,00` for the same values.
* **Resolution**:
  1. Define unified, exportable helpers in `src/lib/format.ts`:
     ```typescript
     export function formatEur(amount: number): string {
       return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount);
     }
     export function formatEur0(amount: number): string {
       return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
     }
     ```
  2. Replace individual, inlined `.toFixed(2)` string constructs with your canonical formatters to achieve consistent financial presentation.

### Action 5.2: Replace Raw `window.confirm` with `<ConfirmDialog>`
* **Target Files**: Across 5 views (including `Money.tsx` and settings pages).
* **Rationale**: Some views use native browser `window.confirm` alerts, while others load the customized Tailwind `<ConfirmDialog>` component. The mixture breaks UX continuity.
* **Resolution**:
  1. Ensure `<ConfirmDialog>` from your UI library is mounted inside `App.tsx` or imported inline within views.
  2. Wire up the confirmation triggers using state flags inside the view (as seen in `Money.tsx`) instead of calling the blocking native browser modal.

### Action 5.3: Centralize Deadline and Overdue Math
* **Target Files**: 10 views (including `CRM.tsx`, `Projects.tsx`, `Dog.tsx`, and `Vitals.tsx`).
* **Rationale**: Calculations of how many days remain until a deadline, or whether a date is overdue, are implemented independently across different screens, resulting in divergent threshold labels (e.g., "1 dag over tijd" vs "1d te laat").
* **Resolution**:
  1. Utilize the existing `deadlineInfo()` function inside `src/components/crm.tsx` or move it to a centralized path like `src/lib/dates.ts`.
  2. Refactor each page rendering milestone/project deadlines to map dates through `deadlineInfo()`, ensuring standard thresholds and localization are displayed uniformly across the app.
