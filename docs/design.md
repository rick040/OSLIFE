# OSLIFE Design

This doc has two parts:

- **Part 1 — Current design reference.** A factual inventory of every card/component in the app today and its design specs, so you have something concrete to react to ("keep this", "change that").
- **Part 2 — Redesign template.** Blank, for you to fill in with the new direction. Nothing in Part 2 is prescriptive — it's just a checklist of the decisions a redesign touches.

---

## Part 1 — Current Design Reference

### Stack

React + Vite + TypeScript + Tailwind CSS + shadcn/ui (`components.json`: style `default`, baseColor `neutral`, cssVariables `true`, icons `lucide`). Two layers:

- **shadcn primitives** (`src/components/ui/*`) — mostly stock Radix components.
- **OSLIFE's own design language** — a `.card` / `.card-hero` / `.chip` / `.btn` utility layer defined in `src/index.css` on top of custom color tokens (`canvas`, `surface`, `sunken`, `line`, `ink`, domain colors). **This is what's actually used everywhere** — 107+ occurrences of `.card` across 25 view files. The stock shadcn `<Card>` exists but is rarely used directly.

### Color tokens (`src/index.css`, HSL, light `:root` / dark `.dark`)

| Token | Role | Light | Dark |
|---|---|---|---|
| `--canvas` | app background | `68.6 22.6% 93.9%` (warm paper) | `80 10% 8%` (warm charcoal) |
| `--surface` | card background | `0 0% 100%` (white) | `84 9% 12%` |
| `--sunken` | insets, ghost buttons, hover | `68.6 25.9% 94.7%` | `84 8% 16%` |
| `--line` | hairlines, dividers, default border | `70.9 20% 89.2%` | `84 7% 20%` |
| `--line-strong` | hover/active edge | `70.9 14% 78%` | `84 8% 30%` |
| `--scrim` | modal overlay base | `77.1 18.9% 7.3%` | `77 18% 5%` |
| `--ink` | primary text | `80 11.5% 10.2%` | `68 12% 92%` |
| `--ink-soft` | secondary text | `77.1 10.8% 25.5%` | `70 10% 72%` |
| `--muted-foreground` | tertiary text | `77.6 9.6% 34.7%` | `75 8% 62%` |
| `--faint` | quietest text (WCAG AA tuned) | `75 6.7% 41%` | `75 7% 55%` |
| `--forest` | brand primary (deep green) | `85 36.7% 19.2%` | `88 34% 42%` |
| `--forest-hi` | brand primary hover | `85.7 37.4% 25.7%` | `88 36% 50%` |
| `--lime` | hero accent | `70.3 70% 59.4%` | `70.3 65% 60%` |
| `--lime-hi` | hero accent gradient stop | `70.5 73.3% 66.3%` | `70.5 68% 66%` |
| `--destructive` | error/delete | `0 84.2% 60.2%` | `0 62% 46%` |

**Domain colors** (fixed hex, same both themes — used to tag content by "life domain"):

| Domain | Base | Deep (light text) | Deep (dark text) |
|---|---|---|---|
| `parkingyou` | `#6E8CA8` | `#3f586e` | `#b7cce0` |
| `prjct` | `#9385B0` | `#5c4f79` | `#d2c9e3` |
| `buurtkaart` | `#6FA07C` | `#44694f` | `#b8d9be` |
| `personal` | `#C6A05B` | `#856325` | `#ead1a0` |
| `cross` | `#C58392` | `#8a5260` | `#e9c0c8` |

`.deep` inverts per theme (dark saturated text on a light pastel tint in light mode → light pastel text in dark mode) to avoid dark-on-dark contrast failure.

### Typography

- Font: **Figtree** (400/500/600/700/800), loaded via Google Fonts `<link>` in `index.html`. Fallback `ui-sans-serif, system-ui, sans-serif`.
- `font-feature-settings: 'cv11', 'ss01'` globally, antialiased.
- No fixed heading scale — sizes applied ad hoc: page headers `text-xl font-semibold`, section labels `text-xs uppercase tracking-wider font-semibold text-muted`, card titles `text-base font-semibold leading-snug`, KPI values `text-lg`/`text-2xl font-bold tabular-nums`, hero numbers `text-4xl font-semibold`.
- `tabular-nums` used consistently on numeric stats.

### Shape, elevation, motion

- Border radius: `--radius: 0.75rem` (12px) base. Tailwind extends: `lg` = var, `md` = var−2px, `sm` = var−4px, `4xl` = `2rem` (32px, used for modal sheets/big cards).
- Shadows (theme-aware CSS vars): `shadow-card` (subtle), `shadow-card-lg` (deeper), `shadow-pop`. Dark mode adds a 1px inset white-alpha rim so cards visually lift off the dark canvas.
- Animations: `fade-up` (entrance), `pulse-ring` (celebratory pulse), `flow-dash` (chart line dash flow), plus shadcn accordion keyframes. All collapse under `prefers-reduced-motion: reduce`.
- Dark mode: class-based (`darkMode: ['class']`), 3-way toggle (light/dark/system) via `ThemeProvider`, persisted to `localStorage`, live-follows OS scheme in "system" mode.

### Base CSS component classes (`src/index.css` `@layer components`)

| Class | Definition |
|---|---|
| `.card` | `bg-surface border border-line rounded-3xl shadow-card`. Clickable variants (`button.card`, `a.card`) get hover (`border-line-strong`, `shadow-card-lg`, tinted bg), active, and focus-ring states. |
| `.card-hero` | `rounded-3xl shadow-card-lg`, lime gradient background (`135deg`, `--lime` → `--lime-hi`), forced dark text `#16210f`. **Intentionally used at most once per screen** — the single focal "most important thing" tile (ADHD-friendly single-focal-point pattern). |
| `.chip` | `inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium` |
| `.btn` / `.btn-primary` / `.btn-ghost` / `.btn-lime` | Base button + 3 color variants (forest/sunken/lime), `rounded-2xl`, press scale-down (`active:scale-[0.98]`), focus ring |
| `.input` | `rounded-xl bg-sunken border border-line`, focus ring tinted `personal` |

### Custom card components (`src/components/*.tsx`)

| Component | Purpose | Distinguishing style |
|---|---|---|
| `NudgeCard` | Daily priority/nudge banner on Dashboard; also exports `PriorityList` | Not a bordered card — a ~44px row with a 3px colored left border by tone (urgent `#C58392`, attention `#C6A05B`, calm `#6FA07C`), tone-colored icon, 2-line clamp text, optional chevron CTA |
| `BraindumpCard` + `BraindumpDetail` | Capture-inbox tile for a captured link/image/PDF/video | `.card overflow-hidden`, 16:10 thumbnail (`bg-sunken`), kind-icon chip overlay (`bg-canvas/85 backdrop-blur`), status overlays (spinner/warning/duplicate), domain chip + date footer. Detail view is a full-screen `Overlay` modal |
| `CheckinCard` | Daily energy/mood check-in | `.card p-3/p-4`, two 1–5 numeric "Scale" rows (active `bg-forest text-white`, inactive `bg-sunken`), `btn-primary` save |
| `ClientIntakeCard` | HEYRA-generated CRM intake review | `.card overflow-hidden`; `bg-sunken` header strip with icon + label + language chip; editable fields + chips; `btn-primary`/`btn-ghost` actions |
| `DataVizCard` | HEYRA chart reply (recharts bar/line) | `.card overflow-hidden`; `bg-sunken` header; chart colors hardcoded `#9385B0` primary / `#C7C2D6` compare series |
| `IdeaCaptureCard` | HEYRA idea → Strategie HQ commit card | Same header-strip pattern as ClientIntakeCard |
| `ProjectCard` (top-level) | HEYRA "Projectkaart" live project snapshot | `.card overflow-hidden`; header strip + `StatusBadge`; domain/deadline/value chips; thin progress bar (`bg-line` track, `bg-forest` fill) |
| `SearchResultCard` | HEYRA memory-search reply | `.card overflow-hidden`; header strip; optional tinted "graph insight" box (`bg-sunken`); result rows with domain chips |
| `TaskCard` | HEYRA "Taakkaart" domain-accented task creation | Accent is **data-driven inline hex** (`borderColor: ${accent}55`, header `background: ${accent}14`) rather than Tailwind classes — the one fully dynamic-color card |
| `DopamineBar` | Gamified "today's tasks done" progress (Today/Focus view) | `.card p-4`; icon badge `bg-forest/15` → `bg-buurtkaart/15` + `animate-pulse-ring` on completion; progress bar `bg-forest` → `bg-buurtkaart`; celebratory copy/emoji |
| `LocationWeather` | Dashboard header weather/location tile | `.card p-4`; decorative blurred glow blob (`bg-parkingyou/15 blur-2xl`); 4xl temperature number; 3-col mini-metric pills (`bg-sunken/70`) |
| `HealthConditions` | Per-person health-conditions list | Each row its own `.card p-3`, status pill (`bg-line`), two-step confirm-to-delete |
| `crm.tsx` → `Kpi` | Generic CRM stat tile | `.card p-4`; icon badge (`bg-sunken`, optional tint, or `bg-cross/15` + `border-cross/40` when `alert`); `text-2xl font-bold` value + label |
| `crm.tsx` → `ProjectCard` (grid tile, distinct from top-level `ProjectCard`) | CRM/Projects grid tile | `.card p-3.5 min-h-[150px]`; icon badge, `StatusBadge`, priority/deadline `Pill` chips, bottom value row |
| `crm.tsx` → `ProjectRow` | List-row variant of the grid tile | `.card p-3.5` horizontal layout, same chips |
| `crm.tsx` → `ClientCard` | CRM client tile (horizontal scroller) | `.card p-3.5 w-40 shrink-0`; circular initial avatar tinted to client-status hex, status `Pill`, `FollowUpDot` health indicator |
| `Dashboard.tsx` → `KpiTile` (inline, not exported) | Compact 2/3/4-col "cockpit" stat tile | Icon in tinted `bg-{color}/12` rounded-lg badge, bold value + faint label, optional corner sparkline |
| Ad hoc `.card p-4` blocks | "Nu doen" (focus block), "Levensbalans" (radar chart), "Vandaag afmaken" (task list), "North Star", "Projecten", "Belangrijke mail" | Reuse `.card` base, per-section content, no dedicated component |

Other views (`Money.tsx`, `Habits.tsx`, `Vitals.tsx`, `NorthStar.tsx`, `Tasks.tsx`, `Cleaning.tsx`, `CRM.tsx`, `StrategieHQ.tsx`, …) mostly reuse the same `.card` base with per-view padding/content rather than defining new card components. `Money.tsx` uses `card-hero` for its balance tile and `card divide-y` for transaction list rows.

### Base UI primitives (`src/components/ui/*` — shadcn/Radix, mostly stock)

`alert-dialog`, `avatar`, `badge` (variants: default/secondary/destructive/outline), `button` (variants: default/destructive/outline/secondary/ghost/link; sizes: default/sm/lg/icon), `card` (stock, rarely used directly), `collapsible`, `command` (⌘K palette), `dialog`, `dropdown-menu`, `input`, `scroll-area`, `separator`, `sheet`, `sidebar` (full collapsible/floating system), `skeleton`, `tabs`, `tooltip`.

**Custom shared primitives** (`src/components/ui.tsx`, hand-rolled, not shadcn): `DomainChip`, `SentimentChip`, `KindChip`, `Pill` (hex-tinted chip with WCAG-contrast auto text color), `ConfidenceBar`, `SectionTitle`, `Ring` (SVG donut progress), `Overlay` (Radix-Dialog-based scrim+panel, tones: `black`/`black-blur`/`scrim-blur`), `ConfirmDialog`, `Empty`, `SetupHint`, `SegmentedProgress` (discrete-dot progress, max 12 segments), `Sparkline` (inline SVG trend line).

Other shared building blocks: `crm.tsx` (`SheetShell`, `Sheet`, `Field`, `TextInput`, `TextArea`, `SelectInput`, `PrimaryBtn`, `StatusBadge`, `FollowUpDot`), `chart.ts` (shared recharts tooltip/axis constants).

---

## Part 2 — Redesign Template

Fill in whatever's relevant. Leave the rest blank — nothing here is required.

### 1. Direction

- **What's driving this redesign?**
- **What should stay exactly as-is?**
- **What's the one thing that must change no matter what?**
- **Reference apps / sites / screenshots for the target feel:**

### 2. Brand & voice

- Name / wordmark treatment:
- Tone (playful, calm, clinical, warm, …):
- Any mascot / illustration style:

### 3. Color

- Canvas / background:
- Surface (card bg):
- Primary / brand color:
- Secondary accent:
- Hero/focal accent (replacing `--lime`?):
- Domain colors (parkingyou / prjct / buurtkaart / personal / cross) — keep, rename, or restructure?
- Destructive / warning / success:
- Dark mode: keep parity approach, or redesign independently?

### 4. Typography

- Font family (keep Figtree / change):
- Heading scale (h1–h6 sizes, weights):
- Body text size/line-height:
- Numeric/stat display treatment (keep `tabular-nums`?):

### 5. Shape & elevation

- Border radius scale:
- Shadow/elevation style (flat, soft, neumorphic, bordered-only, …):
- Border usage (hairline everywhere vs. borderless + shadow-only):

### 6. Spacing & layout

- Base spacing unit:
- Card padding defaults:
- Grid/column conventions per breakpoint:

### 7. Motion

- Entrance animation style:
- Micro-interactions to keep/add/remove:
- Reduced-motion behavior (keep current collapse-to-instant approach?):

### 8. Component-by-component redesign notes

For each, note: keep as-is / restyle / rebuild from scratch, plus any specifics.

- [ ] `.card` base style
- [ ] `.card-hero` (single-focal-point hero tile)
- [ ] `.chip` / domain chips / `Pill`
- [ ] Buttons (`.btn-primary` / `.btn-ghost` / `.btn-lime`)
- [ ] Inputs / forms
- [ ] `NudgeCard` / `PriorityList`
- [ ] `BraindumpCard` / `BraindumpDetail`
- [ ] `CheckinCard`
- [ ] `DopamineBar`
- [ ] `LocationWeather`
- [ ] `HealthConditions`
- [ ] KPI tiles (`Kpi`, `KpiTile`)
- [ ] CRM cards (`ProjectCard`, `ProjectRow`, `ClientCard`)
- [ ] HEYRA reply cards (`ClientIntakeCard`, `DataVizCard`, `IdeaCaptureCard`, `SearchResultCard`, `TaskCard`)
- [ ] Charts (recharts styling, sparklines, rings)
- [ ] Sidebar / navigation
- [ ] Modals / overlays (`Overlay`, `Sheet`, `ConfirmDialog`)
- [ ] Empty states (`Empty`, `SetupHint`)

### 9. Open questions / notes

-
