// ── HEYRA · learned memory (learn-as-we-speak + braindump learnings) ─────────
// HEYRA's conversation memory (heyra/memory.ts) is session-only — it forgets
// everything on reload. This module is the durable half: after every exchange a
// lightweight Haiku call reads the last turn and distills any *durable* fact
// worth remembering across sessions — a preference ("hou reacties kort"), a
// relationship ("Sanne is m'n contact bij Van Dijk"), a working style, a
// standing constraint. Those facts are persisted (heyra_memory table) and folded
// back into every future prompt (memoryContext.ts), so HEYRA gets more
// personalised the more Rick talks to it.
//
// A second source feeds the same store: when Rick confirms a Kennisbank
// (wiki_entries) suggestion distilled from a braindump, its takeaway is turned
// into a LearnedFact too (see store.ts resolveWikiEntry), tagged with one of
// the LEARNING_CATEGORIES below — so a lesson from an article, a business
// system worth copying, or a tip for the dog becomes part of HEYRA's permanent
// knowledge exactly like a fact it picked up mid-conversation.
//
// Honesty rule (same as reflect.ts): a fact is only stored when Rick actually
// stated it (or explicitly confirmed it, for braindump-derived learnings). The
// extractor is told to skip anything transient (today's tasks, deadlines,
// amounts — those already live in the real store) and to invent nothing. On
// any brain failure extraction returns [] and nothing breaks.

import { askBrain } from './brainClient'
import { parseBrainJson } from './brainJson'

/** Extracted live, from a HEYRA conversation. */
export type ChatFactCategory = 'preference' | 'person' | 'context' | 'workflow' | 'goal'

/**
 * Extracted from a confirmed Kennisbank (wiki) entry — the categories Rick
 * asked for when fleshing out braindump learnings: life lessons, ways of
 * living, business systems/practices, implementation ideas, and dog/pet stuff.
 * Must match the check constraint on wiki_entries.category and
 * LEARNING_CATEGORIES in supabase/functions/braindump-ingest/index.ts.
 */
export type LearningCategory =
  | 'life_lesson'
  | 'way_of_living'
  | 'business_system'
  | 'business_practice'
  | 'implementation'
  | 'pet'

export type FactCategory = ChatFactCategory | LearningCategory

const CHAT_FACT_CATEGORIES: ChatFactCategory[] = ['preference', 'person', 'context', 'workflow', 'goal']

export const LEARNING_CATEGORIES: LearningCategory[] = [
  'life_lesson',
  'way_of_living',
  'business_system',
  'business_practice',
  'implementation',
  'pet',
]

/** Label + accent colour for every category, shared by the Geleerd tab and Kennisbank. */
export const CATEGORY_META: Record<FactCategory, { label: string; hex: string }> = {
  preference: { label: 'Voorkeur', hex: '#9385B0' },
  person: { label: 'Persoon', hex: '#7CA9C9' },
  context: { label: 'Context', hex: '#8A9A6B' },
  workflow: { label: 'Werkwijze', hex: '#C6A05B' },
  goal: { label: 'Doel', hex: '#C58392' },
  life_lesson: { label: 'Levensles', hex: '#D08B4C' },
  way_of_living: { label: 'Levensstijl', hex: '#6FA88A' },
  business_system: { label: 'Business-systeem', hex: '#5B7C99' },
  business_practice: { label: 'Business-praktijk', hex: '#B0704A' },
  implementation: { label: 'Implementatie-idee', hex: '#7A8CC4' },
  pet: { label: 'Huisdier', hex: '#CC8A3D' },
}

export interface LearnedFact {
  id: string
  text: string // one short Dutch sentence, e.g. "Werkt het liefst 's ochtends aan Buurtkaart."
  category: FactCategory
  createdAt: string
}

/** Hard cap so the injected block (and the jsonb row) never grows without bound. */
export const MAX_FACTS = 60

const LEARN_SYSTEM = `Je bent het lange-termijn geheugen van HEYRA (OSLIFE). Je leest het laatste stukje gesprek tussen Rick en HEYRA en haalt er DUURZAME feiten uit die het waard zijn om blijvend te onthouden — dingen die volgende week ook nog waar zijn.

WEL onthouden (als Rick het echt zegt):
- voorkeuren / werkstijl ("hou antwoorden kort", "werkt 's ochtends het best")
- mensen & relaties ("Sanne is m'n contact bij Van Dijk", "m'n boekhouder heet Peter")
- terugkerende context ("ParkingYou draait op abonnementen", "hekel aan facturen sturen")
- vaste doelen / grenzen ("wil max 3 klanten tegelijk", "geen calls op vrijdag")

NIET onthouden:
- eenmalige taken, deadlines, bedragen of datums (die staan al in het echte geheugen)
- dingen die HEYRA zei, alleen wat Rick zelf stelt
- vage of onzekere dingen — bij twijfel: niet opnemen
- iets dat al in "Al bekend" staat (geen duplicaten of lichte herformuleringen)

Verzin NOOIT iets. Meestal is er niets nieuws — geef dan een lege lijst.

Elk feit: één korte Nederlandse zin, category één van: preference, person, context, workflow, goal.

Antwoord ALLEEN met een fenced \`\`\`json blok, geen andere tekst:
{"facts":[{"text":"...","category":"preference"}]}`

function normalize(text: string): string {
  return text.toLowerCase().replace(/[.!?,;:'"()]/g, '').replace(/\s+/g, ' ').trim()
}

/** True when `candidate` is the same fact as one already known (exact-ish or containment). */
function isDuplicate(candidate: string, existing: LearnedFact[]): boolean {
  const c = normalize(candidate)
  if (!c) return true
  return existing.some((f) => {
    const e = normalize(f.text)
    return e === c || e.includes(c) || c.includes(e)
  })
}

/**
 * Merge freshly extracted facts into the existing set: drop duplicates, then
 * keep the newest MAX_FACTS (oldest fall off the end). Returns the merged list
 * plus just the facts that were actually added, so the caller can surface
 * "onthouden: …" only for genuinely new knowledge.
 */
export function mergeFacts(
  existing: LearnedFact[],
  incoming: LearnedFact[],
): { merged: LearnedFact[]; added: LearnedFact[] } {
  const added: LearnedFact[] = []
  const running = [...existing]
  for (const fact of incoming) {
    if (isDuplicate(fact.text, running)) continue
    running.push(fact)
    added.push(fact)
  }
  // newest first, capped
  const merged = running
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, MAX_FACTS)
  return { merged, added }
}

/**
 * Ask the brain to distill durable facts from one exchange. Returns only NEW
 * facts (already deduped against `existing`); [] on any brain failure so
 * learning is best-effort and never blocks or breaks the reply.
 */
export async function extractFacts(
  userText: string,
  heyraText: string,
  existing: LearnedFact[],
): Promise<LearnedFact[]> {
  const known = existing.length
    ? existing.map((f) => `- ${f.text}`).join('\n')
    : '(nog niets)'
  const prompt = `Al bekend:\n${known}\n\nLaatste gesprek:\nrick: ${userText}\nheyra: ${heyraText}`

  const raw = await askBrain(LEARN_SYSTEM, prompt, { maxTokens: 260, timeoutMs: 5000 })
  if (!raw) return []

  const parsed = parseBrainJson(raw)
  const list = parsed && Array.isArray((parsed as { facts?: unknown }).facts)
    ? (parsed as { facts: unknown[] }).facts
    : null
  if (!list) return []

  const now = new Date().toISOString()
  const facts: LearnedFact[] = []
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue
    const text = String((entry as { text?: unknown }).text ?? '').trim()
    if (!text || text.length > 160) continue
    const rawCat = String((entry as { category?: unknown }).category ?? 'context')
    const category = (CHAT_FACT_CATEGORIES as string[]).includes(rawCat) ? (rawCat as FactCategory) : 'context'
    if (isDuplicate(text, existing) || isDuplicate(text, facts)) continue
    facts.push({ id: crypto.randomUUID(), text, category, createdAt: now })
  }
  return facts
}

/** Compact block for prompt injection; empty string when nothing has been learned yet. */
export function renderLearnedFacts(facts: LearnedFact[]): string {
  if (!facts.length) return ''
  const lines = facts
    .slice(0, MAX_FACTS)
    .map((f) => `- [${CATEGORY_META[f.category].label}] ${f.text}`)
    .join('\n')
  return `Wat ik in eerdere gesprekken over Rick heb geleerd:\n${lines}`
}
