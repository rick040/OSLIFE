// ── HEYRA · identity profile synthesizer ─────────────────────────────────────
// Three brain-first syntheses, same honesty contract as goals.ts and
// reflect.ts (never invent — say less when there's not enough signal):
//
//  - synthesizeCurrentProfile: reads what's actually known about Rick (learned
//    facts, reinforced patterns, recurring braindump themes, habit streaks)
//    and distills a CONCRETE, STRUCTURED current-state read — short discrete
//    items per category (see profile.ts's PERSONA_CATEGORIES), never a
//    narrative paragraph. Falls back to a rule-based bucketing of live
//    patterns/facts/habits when the brain is unavailable.
//  - synthesizeDreamProfile: distills Rick's own free-form dream-profile text
//    (a self-interview he writes by hand, never invented here) into the SAME
//    category shape as the current profile, so the two read as directly
//    comparable versions of one persona. No rule-based fallback — free prose
//    can't be bucketed reliably without the brain — surfaces null on failure
//    so the caller can say so and let Rick retry or edit by hand instead.
//  - synthesizeLandscape: given the current profile + dream profile (dream
//    notes as fallback source if the dream hasn't been distilled into
//    categories yet), proposes the environment that bridges the two —
//    people/habits/time/money/balance/focus/environment (profile.ts's
//    LANDSCAPE_CATEGORIES). Never names real contacts — only archetypes/roles.

import type { Pattern, ProfileFact, BraindumpEntry, Habit, IdentitySnapshot, Landscape } from '../types'
import type { LearnedFact } from './learning'
import { askBrain } from './brainClient'
import { parseBrainJson } from './brainJson'
import { PERSONA_CATEGORIES, LANDSCAPE_CATEGORIES, hasAnyItems } from '../profile'

const MAX_ITEMS_PER_CATEGORY = 6
const MAX_ITEM_LENGTH = 140

/** Parse a brain JSON object into a category record, keeping only known keys and short discrete items. */
function toCategoryRecord(raw: unknown, defs: { key: string }[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  if (!raw || typeof raw !== 'object') return out
  const obj = raw as Record<string, unknown>
  for (const { key } of defs) {
    const list = obj[key]
    if (!Array.isArray(list)) continue
    const items: string[] = []
    for (const entry of list) {
      const s = String(entry ?? '').trim()
      if (s && s.length <= MAX_ITEM_LENGTH) items.push(s)
      if (items.length >= MAX_ITEMS_PER_CATEGORY) break
    }
    if (items.length) out[key] = items
  }
  return out
}

const CATEGORY_KEY_LIST = PERSONA_CATEGORIES.map((c) => c.key).join('", "')

// ── Current-state profile ────────────────────────────────────────────────────

export interface CurrentProfileContext {
  learnedFacts: LearnedFact[]
  patterns: Pattern[]
  profileFacts: ProfileFact[]
  braindumpEntries: BraindumpEntry[]
  habits: Habit[]
}

const CURRENT_SYSTEM = `Je bent de introspectie-laag van HEYRA (OSLIFE). Je leest wat er echt over Rick vastligt (geleerde feiten, patronen, terugkerende thema's, braindumps, gewoontes) en zet dat om in een CONCREET, GESTRUCTUREERD profiel — geen lopend verhaal, alleen korte losse punten per categorie.

Categorieën (gebruik exact deze keys): "${CATEGORY_KEY_LIST}"
- tools: tools/apps/systemen die Rick daadwerkelijk gebruikt
- habits: terugkerende gewoontes/routines
- strengths: dingen waar Rick aantoonbaar sterk in is
- weaknesses: valkuilen die hem vertragen of tegenwerken
- interests: onderwerpen waar hij oprechte interesse in toont
- character: karaktertrekken / persoonlijkheidsstijl
- workstyle: hoe hij werkt — plant, structureert, beslist
- communication: communicatiestijl — hoe hij praat/schrijft/reageert
- accelerators: dingen die, wanneer aanwezig, zijn energie/output merkbaar verhogen

Regels:
- Baseer je ALLEEN op wat je aangeleverd krijgt — verzin niets. Te weinig signaal voor een categorie? Laat hem leeg.
- Elk item is kort en concreet (max ~12 woorden) — het feit/de eigenschap zelf, geen verhalende zin, geen "want"-redenering.
- 0-6 items per categorie.

Antwoord ALLEEN met een fenced \`\`\`json blok, geen andere tekst:
{"tools":["..."],"habits":["..."],"strengths":["..."],"weaknesses":["..."],"interests":["..."],"character":["..."],"workstyle":["..."],"communication":["..."],"accelerators":["..."]}`

function buildCurrentContext(ctx: CurrentProfileContext): string {
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
function ruleBasedCurrentSnapshot(ctx: CurrentProfileContext): IdentitySnapshot {
  const categories: Record<string, string[]> = {}
  const push = (key: string, text: string) => {
    const list = categories[key] ?? (categories[key] = [])
    if (list.length < MAX_ITEMS_PER_CATEGORY) list.push(text)
  }

  for (const p of ctx.patterns.filter((x) => x.confidence >= 0.5)) {
    if (p.trend === 'up') push('strengths', p.text)
    else if (p.trend === 'down') push('weaknesses', p.text)
    else push('character', p.text)
  }

  for (const f of ctx.learnedFacts) {
    if (f.category === 'workflow' || f.category === 'business_system' || f.category === 'business_practice' || f.category === 'implementation') {
      push('workstyle', f.text)
    } else if (f.category === 'preference') {
      push('interests', f.text)
    } else if (f.category === 'goal') {
      push('accelerators', f.text)
    } else if (f.category === 'way_of_living' || f.category === 'life_lesson') {
      push('character', f.text)
    }
  }

  for (const h of ctx.habits) {
    if (h.streak >= 7) push('habits', `Consistent met "${h.name}" (${h.streak} dagen op rij)`)
  }

  return { categories, generatedAt: new Date().toISOString() }
}

/**
 * Synthesize the current-state identity snapshot. Brain-first; falls back to
 * a rule-based bucketing of live patterns/facts/habits on any brain failure.
 */
export async function synthesizeCurrentProfile(ctx: CurrentProfileContext): Promise<IdentitySnapshot> {
  const raw = await askBrain(CURRENT_SYSTEM, buildCurrentContext(ctx), { maxTokens: 700, timeoutMs: 9000 })
  if (raw) {
    const parsed = parseBrainJson(raw)
    const categories = toCategoryRecord(parsed, PERSONA_CATEGORIES)
    if (Object.keys(categories).length) return { categories, generatedAt: new Date().toISOString() }
  }
  return ruleBasedCurrentSnapshot(ctx)
}

// ── Dream profile — distilled from Rick's own free-form notes ───────────────

const DREAM_SYSTEM = `Je bent de introspectie-laag van HEYRA (OSLIFE). Rick heeft in vrije tekst geschreven over wie hij wil worden en hoe hij wil leven (een zelf-interview). Destilleer dat naar hetzelfde categorie-format als zijn huidige profiel — maar dan het GEWENSTE beeld: wat hij wil ZIJN/HEBBEN/KUNNEN, niet wat hij nu al is.

Categorieën (gebruik exact deze keys): "${CATEGORY_KEY_LIST}"
- tools, habits, strengths, weaknesses, interests, character, workstyle, communication, accelerators — zelfde betekenis als bij het huidige profiel, maar dan de gewenste/aspiratie-versie.

Regels:
- Baseer je UITSLUITEND op de aangeleverde tekst — verzin niets, lees niet tussen de regels door wat er niet staat.
- Elk item is kort en concreet (max ~12 woorden), geen verhalende zin.
- 0-6 items per categorie. Geen signaal in de tekst voor een categorie? Laat hem leeg.

Antwoord ALLEEN met een fenced \`\`\`json blok, geen andere tekst:
{"tools":["..."],"habits":["..."],"strengths":["..."],"weaknesses":["..."],"interests":["..."],"character":["..."],"workstyle":["..."],"communication":["..."],"accelerators":["..."]}`

/**
 * Distill Rick's hand-written dream-profile notes into structured categories.
 * No rule-based fallback — free prose can't be bucketed reliably without the
 * brain — returns null on failure so the caller can surface an error and let
 * Rick retry, or keep editing the categories by hand.
 */
export async function synthesizeDreamProfile(dreamNotes: string): Promise<IdentitySnapshot | null> {
  const text = dreamNotes.trim()
  if (!text) return null
  const raw = await askBrain(DREAM_SYSTEM, text.slice(0, 16000), { maxTokens: 700, timeoutMs: 12000 })
  if (!raw) return null
  const parsed = parseBrainJson(raw)
  const categories = toCategoryRecord(parsed, PERSONA_CATEGORIES)
  if (!Object.keys(categories).length) return null
  return { categories, generatedAt: new Date().toISOString() }
}

// ── Landscape — bridges current → dream ──────────────────────────────────────

export interface LandscapeContext {
  current: IdentitySnapshot
  dream: IdentitySnapshot
  dreamNotes: string
}

const LANDSCAPE_KEY_LIST = LANDSCAPE_CATEGORIES.map((c) => c.key).join('", "')

const LANDSCAPE_SYSTEM = `Je bent de omgevingsarchitect van HEYRA (OSLIFE). Op basis van Ricks HUIDIGE profiel en zijn DROOMPROFIEL beschrijf je CONCREET, per categorie, het landschap dat de kloof overbrugt — geen lopend verhaal, losse concrete punten per categorie.

Categorieën (gebruik exact deze keys): "${LANDSCAPE_KEY_LIST}"
- people: type mensen/rollen om je mee te omringen (archetypes/rollen, NOOIT een bestaande naam)
- habits: gewoontes om op te bouwen
- time: hoe tijd gestructureerd moet worden (planning, ritme, prioritering)
- money: hoe financiën/inkomen georganiseerd moeten zijn
- balance: balans tussen werk/rust, actie/reflectie, sociaal/alleen
- focus: waar aandacht/energie primair naartoe moet
- environment: fysieke/structurele omgevingsveranderingen (plek, werkplek, setup)

Regels:
- Baseer je op de aangeleverde profielen — verzin geen namen van bestaande contacten.
- Elk item is kort en concreet (max ~12 woorden), geen verhalende zin.
- 0-6 items per categorie.

Antwoord ALLEEN met een fenced \`\`\`json blok, geen andere tekst:
{"people":["..."],"habits":["..."],"time":["..."],"money":["..."],"balance":["..."],"focus":["..."],"environment":["..."]}`

function renderCategories(label: string, categories: Record<string, string[]>): string {
  const entries = Object.entries(categories).filter(([, items]) => items.length)
  if (!entries.length) return ''
  return `${label}:\n${entries.map(([key, items]) => `- ${key}: ${items.join('; ')}`).join('\n')}`
}

function buildLandscapeContext(ctx: LandscapeContext): string {
  const parts: string[] = []
  const current = renderCategories('Huidig profiel', ctx.current.categories)
  if (current) parts.push(current)
  const dream = renderCategories('Droomprofiel (gestructureerd)', ctx.dream.categories)
  if (dream) parts.push(dream)
  if (!dream && ctx.dreamNotes.trim()) parts.push(`Droomprofiel (ruwe notities):\n${ctx.dreamNotes.trim().slice(0, 8000)}`)
  return parts.join('\n\n')
}

/**
 * Synthesize the landscape that bridges current → dream. Requires some dream
 * signal (structured categories or raw notes) — returns null otherwise, since
 * there's nothing yet to bridge toward.
 */
export async function synthesizeLandscape(ctx: LandscapeContext): Promise<Landscape | null> {
  if (!hasAnyItems(ctx.dream.categories) && !ctx.dreamNotes.trim()) return null

  const raw = await askBrain(LANDSCAPE_SYSTEM, buildLandscapeContext(ctx), { maxTokens: 700, timeoutMs: 9000 })
  if (raw) {
    const parsed = parseBrainJson(raw)
    const categories = toCategoryRecord(parsed, LANDSCAPE_CATEGORIES)
    if (Object.keys(categories).length) return { categories, generatedAt: new Date().toISOString() }
  }
  return null
}
