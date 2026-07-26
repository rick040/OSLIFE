// ── HEYRA · identity profile synthesizer ─────────────────────────────────────
// Two brain-first/rule-fallback syntheses, same honesty contract as goals.ts
// and reflect.ts (never invent — say less when there's not enough signal):
//
//  - synthesizeCurrentProfile: reads what's actually known about Rick (learned
//    facts, reinforced patterns, recurring braindump themes, habit streaks)
//    and distills a current-state read — traits, strengths, weaknesses
//    ("potholes"), accelerators.
//  - synthesizeLandscape: given the current profile + Rick's own dream-profile
//    text (written by hand, filled in later — never invented here), proposes
//    the environment that bridges the two: the kind of people to be around,
//    habits to build, structural/environment changes. Never names real
//    contacts — only archetypes/roles, since the goal is a description of
//    environment, not a to-do list naming people from `people`/`clients`.

import type { Pattern, ProfileFact, BraindumpEntry, Habit, IdentitySnapshot, Landscape } from '../types'
import type { LearnedFact } from './learning'
import { renderLearnedFacts } from './learning'
import { askBrain } from './brainClient'
import { parseBrainJson } from './brainJson'

export interface CurrentProfileContext {
  learnedFacts: LearnedFact[]
  patterns: Pattern[]
  profileFacts: ProfileFact[]
  braindumpEntries: BraindumpEntry[]
  habits: Habit[]
}

const CURRENT_SYSTEM = `Je bent de introspectie-laag van HEYRA (OSLIFE). Je leest wat er echt over Rick vastligt (geleerde feiten, patronen, terugkerende thema's, braindumps, gewoontes) en vat dat samen tot een eerlijk huidig profiel: wie hij nu is, wat werkt en wat niet.

Regels:
- Baseer je ALLEEN op wat je aangeleverd krijgt — verzin niets. Bij te weinig signaal: geef minder items terug in plaats van te verzinnen.
- summary: 2-3 zinnen, eerlijk en direct, geen fluff.
- traits: 3-6 korte eigenschappen/gedragspatronen die opvallen.
- strengths: 3-6 dingen waar Rick sterk in is / vaardigheden die er echt zijn.
- weaknesses: 3-6 valkuilen ("potholes") — dingen die hem vertragen of tegenwerken.
- accelerators: 2-4 dingen die, wanneer aanwezig, zijn energie/output merkbaar verhogen.
- Elk item is een korte Nederlandse zin, geen enkel woord.

Antwoord ALLEEN met een fenced \`\`\`json blok, geen andere tekst:
{"summary":"...","traits":["..."],"strengths":["..."],"weaknesses":["..."],"accelerators":["..."]}`

function buildCurrentContext(ctx: CurrentProfileContext): string {
  const parts: string[] = []

  const learned = renderLearnedFacts(ctx.learnedFacts)
  if (learned) parts.push(learned)

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

/** Cap + trim a candidate list from the brain into short, non-empty strings. */
function toStringList(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    const s = String(item ?? '').trim()
    if (s && s.length <= 200) out.push(s)
    if (out.length >= max) break
  }
  return out
}

/** Rule-based fallback when the brain is unavailable — derives only what real signal supports. */
function ruleBasedCurrentSnapshot(ctx: CurrentProfileContext): IdentitySnapshot {
  const strengths: string[] = []
  const weaknesses: string[] = []
  const traits: string[] = []
  const accelerators: string[] = []

  for (const p of ctx.patterns.filter((x) => x.confidence >= 0.5)) {
    if (p.trend === 'up') strengths.push(p.text)
    else if (p.trend === 'down') weaknesses.push(p.text)
    else traits.push(p.text)
  }

  for (const f of ctx.learnedFacts) {
    if (f.category === 'workflow') traits.push(f.text)
    if (f.category === 'goal') accelerators.push(f.text)
  }

  for (const h of ctx.habits) {
    if (h.streak >= 7) strengths.push(`Consistent met "${h.name}" (${h.streak} dagen op rij)`)
  }

  const hasSignal = strengths.length || weaknesses.length || traits.length || accelerators.length
  return {
    summary: hasSignal
      ? 'Automatisch samengesteld uit patronen, feiten en gewoontes — nog niet door HEYRA doorgesproken.'
      : 'Nog niet genoeg vastgelegd om een profiel te schetsen — leg meer braindumps, patronen en gewoontes vast en probeer het opnieuw.',
    traits: traits.slice(0, 6),
    strengths: strengths.slice(0, 6),
    weaknesses: weaknesses.slice(0, 6),
    accelerators: accelerators.slice(0, 4),
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Synthesize the current-state identity snapshot. Brain-first; falls back to
 * a rule-based read of live patterns/facts/habits on any brain failure.
 */
export async function synthesizeCurrentProfile(ctx: CurrentProfileContext): Promise<IdentitySnapshot> {
  const raw = await askBrain(CURRENT_SYSTEM, buildCurrentContext(ctx), { maxTokens: 700, timeoutMs: 9000 })
  if (raw) {
    const parsed = parseBrainJson(raw) as Record<string, unknown> | null
    if (parsed) {
      const summary = String(parsed.summary ?? '').trim().slice(0, 400)
      const traits = toStringList(parsed.traits, 6)
      const strengths = toStringList(parsed.strengths, 6)
      const weaknesses = toStringList(parsed.weaknesses, 6)
      const accelerators = toStringList(parsed.accelerators, 4)
      if (summary || traits.length || strengths.length || weaknesses.length) {
        return { summary, traits, strengths, weaknesses, accelerators, generatedAt: new Date().toISOString() }
      }
    }
  }
  return ruleBasedCurrentSnapshot(ctx)
}

export interface LandscapeContext {
  current: IdentitySnapshot
  dreamMd: string
}

const LANDSCAPE_SYSTEM = `Je bent de omgevingsarchitect van HEYRA (OSLIFE). Op basis van Ricks HUIDIGE profiel en zijn DROOMPROFIEL (het profiel dat hij nodig heeft om te leven zoals hij wil) beschrijf je het landschap dat de kloof overbrugt.

Regels:
- Baseer je op de aangeleverde profielen — verzin geen namen van bestaande contacten; beschrijf archetypes/rollen (bv. "een mentor die al ondernemer is"), nooit een echte naam.
- summary: 2-3 zinnen die de kloof tussen huidig en droom samenvatten en de aanpak schetsen.
- people: 3-5 type mensen/rollen om je mee te omringen.
- habits: 3-6 concrete gewoontes om op te bouwen.
- environment: 3-5 omgevings- of structuurveranderingen (werk, geld, plek, routine) die het verschil maken.

Antwoord ALLEEN met een fenced \`\`\`json blok, geen andere tekst:
{"summary":"...","people":["..."],"habits":["..."],"environment":["..."]}`

function buildLandscapeContext(ctx: LandscapeContext): string {
  const parts: string[] = []
  parts.push(
    `Huidig profiel:\n${ctx.current.summary || '(nog geen samenvatting)'}` +
      (ctx.current.traits.length ? `\nEigenschappen: ${ctx.current.traits.join('; ')}` : '') +
      (ctx.current.strengths.length ? `\nSterke punten: ${ctx.current.strengths.join('; ')}` : '') +
      (ctx.current.weaknesses.length ? `\nValkuilen: ${ctx.current.weaknesses.join('; ')}` : ''),
  )
  parts.push(`Droomprofiel (het doel):\n${ctx.dreamMd.trim()}`)
  return parts.join('\n\n')
}

/**
 * Synthesize the landscape that bridges current → dream. Requires a non-empty
 * dream profile — returns an empty (ungenerated) landscape otherwise, since
 * there's nothing yet to bridge toward.
 */
export async function synthesizeLandscape(ctx: LandscapeContext): Promise<Landscape | null> {
  if (!ctx.dreamMd.trim()) return null

  const raw = await askBrain(LANDSCAPE_SYSTEM, buildLandscapeContext(ctx), { maxTokens: 700, timeoutMs: 9000 })
  if (raw) {
    const parsed = parseBrainJson(raw) as Record<string, unknown> | null
    if (parsed) {
      const summary = String(parsed.summary ?? '').trim().slice(0, 400)
      const people = toStringList(parsed.people, 5)
      const habits = toStringList(parsed.habits, 6)
      const environment = toStringList(parsed.environment, 5)
      if (summary || people.length || habits.length || environment.length) {
        return { summary, people, habits, environment, generatedAt: new Date().toISOString() }
      }
    }
  }

  return {
    summary: 'HEYRA kon dit nu niet genereren — probeer het zo nog eens.',
    people: [],
    habits: [],
    environment: [],
    generatedAt: new Date().toISOString(),
  }
}
