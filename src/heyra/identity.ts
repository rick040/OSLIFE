// ── HEYRA · identity profile synthesizer ─────────────────────────────────────
// Modeled directly on Rick's own self-model interview (src/selfModel.ts) and
// its own spec for what the answers become. Same honesty contract as goals.ts
// and reflect.ts throughout (never invent — say less when there's not enough
// signal):
//
//  - synthesizeCurrentFromData: reads what's actually known about Rick from
//    live behavioral data (learned facts, reinforced patterns, recurring
//    braindump themes, habit streaks) into the 5 self/current categories
//    (profile.ts's CURRENT_CATEGORIES), tagged `status: 'confirmed'`.
//    Falls back to a rule-based bucketing when the brain is unavailable.
//  - synthesizeCurrentHypotheses: distills the SAME 5 categories from Rick's
//    own interview answers instead — tagged `status: 'hypothesis'`, since
//    self-report isn't yet confirmed by real data. Brain-only, no rule
//    fallback (free prose can't be bucketed reliably without it).
//  - synthesizeDesiredProfile: distills the interview answers into the 3
//    self/desired categories (identity sketch / aspirations / no-gos).
//    Brain-only.
//  - synthesizeTensionsAndLandscape: given current + desired, first derives
//    concrete tensions between them, then proposes the landscape
//    (people/habits/time/money/balance/focus/environment) that bridges the
//    gap, informed by those tensions. One call, two internal brain steps.

import type { Pattern, ProfileFact, BraindumpEntry, Habit, IdentitySnapshot, DesiredProfile, Landscape, ProfileItem } from '../types'
import type { LearnedFact } from './learning'
import { askBrain } from './brainClient'
import { parseBrainJson } from './brainJson'
import { CURRENT_CATEGORIES, DESIRED_CATEGORIES, LANDSCAPE_CATEGORIES } from '../profile'

const MAX_ITEMS_PER_CATEGORY = 6
const MAX_ITEM_LENGTH = 140

function toStringItems(list: unknown): string[] {
  if (!Array.isArray(list)) return []
  const items: string[] = []
  for (const entry of list) {
    const s = String(entry ?? '').trim()
    if (s && s.length <= MAX_ITEM_LENGTH) items.push(s)
    if (items.length >= MAX_ITEMS_PER_CATEGORY) break
  }
  return items
}

/** Parse a brain JSON object into a plain string-list category record, keeping only known keys. */
function toCategoryRecord(raw: unknown, defs: { key: string }[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  if (!raw || typeof raw !== 'object') return out
  const obj = raw as Record<string, unknown>
  for (const { key } of defs) {
    const items = toStringItems(obj[key])
    if (items.length) out[key] = items
  }
  return out
}

/** Same as toCategoryRecord, but wraps each item as a ProfileItem with a fixed status. */
function toProfileItemRecord(raw: unknown, defs: { key: string }[], status: ProfileItem['status']): Record<string, ProfileItem[]> {
  const strings = toCategoryRecord(raw, defs)
  const out: Record<string, ProfileItem[]> = {}
  for (const [key, items] of Object.entries(strings)) out[key] = items.map((text) => ({ text, status }))
  return out
}

const CURRENT_KEY_LIST = CURRENT_CATEGORIES.map((c) => c.key).join('", "')
const CURRENT_CATEGORY_GUIDE = `- values: waarden die uit zijn gedrag/keuzes blijken (niet wat hij beweert, maar wat hij doet)
- workstyle: hoe zijn werk er daadwerkelijk uitziet — wat hem trekt, wat hem sleept
- energy_mood: wanneer hij scherp is, wanneer hij crasht, wat hem in flow brengt of leegzuigt
- decision_style: hoe hij beslist, hoe hij vastloopt, en wat dat doorbreekt
- anti_patterns: terugkerende patronen die hem tegenwerken — inclusief dingen waar hij zich een beetje voor schaamt`

// ── Current profile — from live behavioral data (confirmed) ─────────────────

export interface CurrentFromDataContext {
  learnedFacts: LearnedFact[]
  patterns: Pattern[]
  profileFacts: ProfileFact[]
  braindumpEntries: BraindumpEntry[]
  habits: Habit[]
}

const CURRENT_FROM_DATA_SYSTEM = `Je bent de introspectie-laag van HEYRA (OSLIFE). Je leest wat er echt over Rick vastligt (geleerde feiten, patronen, terugkerende thema's, braindumps, gewoontes) en zet dat om in een CONCREET, GESTRUCTUREERD huidig-profiel — geen lopend verhaal, alleen korte losse punten per categorie.

Categorieën (gebruik exact deze keys): "${CURRENT_KEY_LIST}"
${CURRENT_CATEGORY_GUIDE}

Regels:
- Baseer je ALLEEN op wat je aangeleverd krijgt — verzin niets. Te weinig signaal voor een categorie? Laat hem leeg.
- Elk item is kort en concreet (max ~12 woorden) — het feit/de eigenschap zelf, geen verhalende zin.
- 0-6 items per categorie.

Antwoord ALLEEN met een fenced \`\`\`json blok, geen andere tekst:
{"values":["..."],"workstyle":["..."],"energy_mood":["..."],"decision_style":["..."],"anti_patterns":["..."]}`

function buildCurrentFromDataContext(ctx: CurrentFromDataContext): string {
  const parts: string[] = []

  if (ctx.learnedFacts.length) {
    parts.push(`Geleerde feiten:\n${ctx.learnedFacts.map((f) => `- [${f.category}] ${f.text}`).join('\n')}`)
  }

  const strong = ctx.patterns.filter((p) => p.confidence >= 0.5).slice(0, 12)
  if (strong.length) {
    parts.push(
      `Patronen:\n${strong.map((p) => `- ${p.text} (${Math.round(p.confidence * 100)}%, trend ${p.trend ?? 'flat'})`).join('\n')}`,
    )
  }

  const themes = ctx.profileFacts.slice(0, 10)
  if (themes.length) parts.push(`Terugkerende thema's:\n${themes.map((t) => `- ${t.label}`).join('\n')}`)

  const dumps = [...ctx.braindumpEntries]
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    .slice(0, 20)
  if (dumps.length) {
    parts.push(
      `Recente braindumps:\n${dumps
        .map((b) => `- [${b.domain ?? 'onbekend'}] ${b.title || (b.summary ? b.summary.slice(0, 100) : 'notitie')}`)
        .join('\n')}`,
    )
  }

  if (ctx.habits.length) {
    parts.push(`Gewoontes:\n${ctx.habits.slice(0, 10).map((h) => `- ${h.name} (streak: ${h.streak} dagen)`).join('\n')}`)
  }

  return parts.length ? parts.join('\n\n') : '(nog niets vastgelegd)'
}

/** Rule-based fallback when the brain is unavailable — buckets only real signal, never invents. */
function ruleBasedCurrentFromData(ctx: CurrentFromDataContext): Record<string, ProfileItem[]> {
  const categories: Record<string, ProfileItem[]> = {}
  const push = (key: string, text: string) => {
    const list = categories[key] ?? (categories[key] = [])
    if (list.length < MAX_ITEMS_PER_CATEGORY) list.push({ text, status: 'confirmed' })
  }

  for (const p of ctx.patterns.filter((x) => x.confidence >= 0.5)) push('energy_mood', p.text)

  for (const f of ctx.learnedFacts) {
    if (f.category === 'workflow' || f.category === 'business_system' || f.category === 'business_practice' || f.category === 'implementation') {
      push('workstyle', f.text)
    } else if (f.category === 'preference' || f.category === 'way_of_living' || f.category === 'life_lesson' || f.category === 'goal') {
      push('values', f.text)
    }
  }

  for (const h of ctx.habits) {
    if (h.streak >= 7) push('workstyle', `Consistent met "${h.name}" (${h.streak} dagen op rij)`)
  }

  return categories
}

/**
 * Synthesize current-profile items from live behavioral data. Brain-first;
 * falls back to a rule-based bucketing of live patterns/facts/habits on any
 * brain failure. Every returned item is `status: 'confirmed'`.
 */
export async function synthesizeCurrentFromData(ctx: CurrentFromDataContext): Promise<Record<string, ProfileItem[]>> {
  const raw = await askBrain(CURRENT_FROM_DATA_SYSTEM, buildCurrentFromDataContext(ctx), { maxTokens: 700, timeoutMs: 9000 })
  if (raw) {
    const parsed = parseBrainJson(raw)
    const categories = toProfileItemRecord(parsed, CURRENT_CATEGORIES, 'confirmed')
    if (Object.keys(categories).length) return categories
  }
  return ruleBasedCurrentFromData(ctx)
}

// ── Current profile — from the interview (hypotheses) ────────────────────────

function renderInterviewAnswers(answers: Record<string, string>): string {
  const entries = Object.entries(answers).filter(([, text]) => text.trim())
  if (!entries.length) return ''
  return entries.map(([id, text]) => `${id}: ${text.trim()}`).join('\n\n')
}

const CURRENT_HYPOTHESES_SYSTEM = `Je bent de introspectie-laag van HEYRA (OSLIFE). Rick heeft een zelf-interview ingevuld (over identiteit, denken/beslissen, energie, worstelingen, werk). Destilleer daaruit HYPOTHESES voor zijn huidige profiel — dingen die hij zelf beschrijft, nog niet bevestigd door harde gedragsdata.

Categorieën (gebruik exact deze keys): "${CURRENT_KEY_LIST}"
${CURRENT_CATEGORY_GUIDE}

Regels:
- Baseer je UITSLUITEND op de aangeleverde interviewtekst — verzin niets, lees niet tussen de regels door wat er niet staat.
- Elk item is kort en concreet (max ~12 woorden), geen verhalende zin.
- 0-6 items per categorie. Geen signaal voor een categorie? Laat hem leeg.

Antwoord ALLEEN met een fenced \`\`\`json blok, geen andere tekst:
{"values":["..."],"workstyle":["..."],"energy_mood":["..."],"decision_style":["..."],"anti_patterns":["..."]}`

/**
 * Distill current-profile hypotheses from Rick's interview answers. Brain-only
 * — no rule-based fallback, since free prose can't be bucketed reliably
 * without it. Returns an empty record on failure/no signal. Every returned
 * item is `status: 'hypothesis'`.
 */
export async function synthesizeCurrentHypotheses(answers: Record<string, string>): Promise<Record<string, ProfileItem[]>> {
  const text = renderInterviewAnswers(answers)
  if (!text) return {}
  const raw = await askBrain(CURRENT_HYPOTHESES_SYSTEM, text.slice(0, 16000), { maxTokens: 700, timeoutMs: 12000 })
  if (!raw) return {}
  const parsed = parseBrainJson(raw)
  return toProfileItemRecord(parsed, CURRENT_CATEGORIES, 'hypothesis')
}

// ── Desired profile — from the interview ─────────────────────────────────────

const DESIRED_KEY_LIST = DESIRED_CATEGORIES.map((c) => c.key).join('", "')

const DESIRED_SYSTEM = `Je bent de introspectie-laag van HEYRA (OSLIFE). Destilleer uit Ricks zelf-interview zijn DROOMPROFIEL — het gewenste zelfbeeld, niet de huidige staat.

Categorieën (gebruik exact deze keys): "${DESIRED_KEY_LIST}"
- identity_sketch: "ik ben iemand die…" — de aspiratieversie van zichzelf
- aspirations: waar hij consistent naartoe wil groeien, wat hij zou willen (blijven) doen
- no_gos: wie hij nooit wil worden, harde grenzen die hij niet overschrijdt

Regels:
- Baseer je UITSLUITEND op de aangeleverde interviewtekst — verzin niets.
- Elk item is kort en concreet (max ~12 woorden), geen verhalende zin.
- 0-6 items per categorie. Geen signaal voor een categorie? Laat hem leeg.

Antwoord ALLEEN met een fenced \`\`\`json blok, geen andere tekst:
{"identity_sketch":["..."],"aspirations":["..."],"no_gos":["..."]}`

/**
 * Distill the desired/dream profile from Rick's interview answers. Brain-only,
 * same reasoning as synthesizeCurrentHypotheses. Returns null on failure/no
 * signal so the caller can say so rather than silently doing nothing.
 */
export async function synthesizeDesiredProfile(answers: Record<string, string>): Promise<Record<string, string[]> | null> {
  const text = renderInterviewAnswers(answers)
  if (!text) return null
  const raw = await askBrain(DESIRED_SYSTEM, text.slice(0, 16000), { maxTokens: 700, timeoutMs: 12000 })
  if (!raw) return null
  const parsed = parseBrainJson(raw)
  const categories = toCategoryRecord(parsed, DESIRED_CATEGORIES)
  return Object.keys(categories).length ? categories : null
}

// ── Tensions + landscape ──────────────────────────────────────────────────────

const TENSIONS_SYSTEM = `Je bent de introspectie-laag van HEYRA (OSLIFE). Vergelijk Ricks HUIDIGE profiel met zijn DROOMPROFIEL en benoem concrete spanningen — plekken waar zijn huidige gedrag botst met wat hij wil zijn of bereiken.

Regels:
- Baseer je op de aangeleverde profielen — verzin niets.
- Elke spanning is één korte, concrete zin (bv. "Zegt sociaal te zijn, maar verlaat het huis nauwelijks.").
- 0-6 spanningen.

Antwoord ALLEEN met een fenced \`\`\`json blok, geen andere tekst:
{"tensions":["..."]}`

function renderCategories(label: string, categories: Record<string, unknown>): string {
  const entries = Object.entries(categories).filter(([, v]) => Array.isArray(v) && v.length)
  if (!entries.length) return ''
  const line = (items: unknown[]) => items.map((it) => (typeof it === 'string' ? it : (it as ProfileItem).text)).join('; ')
  return `${label}:\n${entries.map(([key, items]) => `- ${key}: ${line(items as unknown[])}`).join('\n')}`
}

async function synthesizeTensions(current: IdentitySnapshot, desired: DesiredProfile): Promise<string[]> {
  const parts: string[] = []
  const currentText = renderCategories('Huidig profiel', current.categories)
  if (currentText) parts.push(currentText)
  const desiredText = renderCategories('Droomprofiel', desired.categories)
  if (desiredText) parts.push(desiredText)
  if (!parts.length) return []

  const raw = await askBrain(TENSIONS_SYSTEM, parts.join('\n\n'), { maxTokens: 500, timeoutMs: 9000 })
  if (!raw) return []
  const parsed = parseBrainJson(raw) as { tensions?: unknown } | null
  return toStringItems(parsed?.tensions)
}

export interface LandscapeContext {
  current: IdentitySnapshot
  desired: DesiredProfile
}

const LANDSCAPE_KEY_LIST = LANDSCAPE_CATEGORIES.map((c) => c.key).join('", "')

const LANDSCAPE_SYSTEM = `Je bent de omgevingsarchitect van HEYRA (OSLIFE). Op basis van Ricks HUIDIGE profiel, zijn DROOMPROFIEL en de spanningen daartussen beschrijf je CONCREET, per categorie, het landschap dat de kloof overbrugt — geen lopend verhaal, losse concrete punten per categorie.

Categorieën (gebruik exact deze keys): "${LANDSCAPE_KEY_LIST}"
- people: type mensen/rollen om je mee te omringen (archetypes/rollen, NOOIT een bestaande naam)
- habits: gewoontes om op te bouwen
- time: hoe tijd gestructureerd moet worden (planning, ritme, prioritering)
- money: hoe financiën/inkomen georganiseerd moeten zijn
- balance: balans tussen werk/rust, actie/reflectie, sociaal/alleen
- focus: waar aandacht/energie primair naartoe moet
- environment: fysieke/structurele omgevingsveranderingen (plek, werkplek, setup)

Regels:
- Baseer je op de aangeleverde profielen/spanningen — verzin geen namen van bestaande contacten.
- Elk item is kort en concreet (max ~12 woorden), geen verhalende zin.
- 0-6 items per categorie.

Antwoord ALLEEN met een fenced \`\`\`json blok, geen andere tekst:
{"people":["..."],"habits":["..."],"time":["..."],"money":["..."],"balance":["..."],"focus":["..."],"environment":["..."]}`

function buildLandscapeContext(ctx: LandscapeContext, tensions: string[]): string {
  const parts: string[] = []
  const current = renderCategories('Huidig profiel', ctx.current.categories)
  if (current) parts.push(current)
  const desired = renderCategories('Droomprofiel', ctx.desired.categories)
  if (desired) parts.push(desired)
  if (tensions.length) parts.push(`Spanningen:\n${tensions.map((t) => `- ${t}`).join('\n')}`)
  return parts.join('\n\n')
}

/**
 * Derive tensions between current and desired, then synthesize the landscape
 * that bridges them — one user-facing action, two internal brain calls, one
 * persisted result. Requires some desired signal — returns null otherwise,
 * since there's nothing yet to bridge toward.
 */
export async function synthesizeTensionsAndLandscape(ctx: LandscapeContext): Promise<Landscape | null> {
  if (!Object.values(ctx.desired.categories).some((items) => items.length)) return null

  const tensions = await synthesizeTensions(ctx.current, ctx.desired)

  const raw = await askBrain(LANDSCAPE_SYSTEM, buildLandscapeContext(ctx, tensions), { maxTokens: 700, timeoutMs: 9000 })
  if (raw) {
    const parsed = parseBrainJson(raw)
    const categories = toCategoryRecord(parsed, LANDSCAPE_CATEGORIES)
    if (Object.keys(categories).length || tensions.length) {
      return { categories, tensions, generatedAt: new Date().toISOString() }
    }
  }
  return tensions.length ? { categories: {}, tensions, generatedAt: new Date().toISOString() } : null
}

// ── Desired profile — auto-expanded from braindumps (no interview needed) ───
// The interview-based synthesizeDesiredProfile above requires Rick to sit down
// and answer questions. This is the passive counterpart: it watches what he
// ALREADY writes in braindumps for explicit "ik wil worden…"/"ik wil
// stoppen met…" statements and folds only those into the same droomprofiel —
// same honesty contract (never infer from mood or tangential remarks, only
// what's explicitly stated), so a stray venting session can't get mistaken
// for a life goal.

export interface DesiredFromSignalContext {
  braindumpEntries: BraindumpEntry[]
  existingDesired: DesiredProfile
}

const DESIRED_FROM_SIGNAL_SYSTEM = `Je bent de introspectie-laag van HEYRA (OSLIFE). Rick schrijft braindumps — losse notities, geen interview. Soms zegt hij daarin EXPLICIET iets over wie hij wil worden of wat hij wil bereiken/vermijden (bv. "ik wil...", "ik zou willen dat ik...", "ik wil stoppen met...", "ik wil nooit meer...", "op termijn wil ik...").

Vind ALLEEN zulke expliciete uitspraken en zet ze om in aanvullingen op zijn droomprofiel.

Categorieën (gebruik exact deze keys): "identity_sketch", "aspirations", "no_gos"
- identity_sketch: "ik ben iemand die…" — de aspiratieversie van zichzelf
- aspirations: waar hij consistent naartoe wil groeien, wat hij zou willen (blijven) doen
- no_gos: wie hij nooit wil worden, harde grenzen die hij niet overschrijdt

Regels:
- ALLEEN expliciete uitspraken uit de tekst — geen interpretatie, geen afleiding uit stemming, toon of zijdelingse opmerkingen.
- Dupliceer NIET wat al in zijn bestaande droomprofiel staat (hieronder gegeven) — sla over wat er al (in andere woorden) staat.
- Elk item kort en concreet (max ~12 woorden), geen verhalende zin, geen citaat.
- Geen expliciete uitspraak gevonden in deze braindumps? Antwoord met lege lijsten — verzin niets.

Antwoord ALLEEN met een fenced \`\`\`json blok, geen andere tekst:
{"identity_sketch":["..."],"aspirations":["..."],"no_gos":["..."]}`

function buildDesiredFromSignalContext(ctx: DesiredFromSignalContext): string {
  const parts: string[] = []

  const existing = renderCategories('Bestaand droomprofiel (niet dupliceren)', ctx.existingDesired.categories)
  parts.push(existing || 'Bestaand droomprofiel: nog leeg.')

  const dumps = [...ctx.braindumpEntries].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  parts.push(
    `Braindumps:\n${dumps
      .map((b) => `- [${b.domain ?? 'onbekend'}] ${(b.title ? `${b.title}: ` : '') + (b.summary || b.markdown || '').slice(0, 400)}`)
      .join('\n')}`,
  )

  return parts.join('\n\n')
}

/**
 * Scan recent braindumps for explicit aspirational statements and propose
 * additions to the desired profile. Brain-only (free text can't be bucketed
 * reliably by rules). Returns null on failure/no braindumps to scan — the
 * caller treats that as "nothing new", not an error.
 */
export async function synthesizeDesiredFromSignal(ctx: DesiredFromSignalContext): Promise<Record<string, string[]> | null> {
  if (!ctx.braindumpEntries.length) return null
  const raw = await askBrain(DESIRED_FROM_SIGNAL_SYSTEM, buildDesiredFromSignalContext(ctx).slice(0, 16000), {
    maxTokens: 500,
    timeoutMs: 12000,
  })
  if (!raw) return null
  const parsed = parseBrainJson(raw)
  const categories = toCategoryRecord(parsed, DESIRED_CATEGORIES)
  return Object.keys(categories).length ? categories : null
}
