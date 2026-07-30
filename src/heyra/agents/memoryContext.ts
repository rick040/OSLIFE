// ── HEYRA · memory snapshot ────────────────────────────────────────────────────
// Assembles a compact, factual Dutch summary of "everything relevant right now"
// from the live store — open loops, project deadlines, milestones, payments and
// agenda load within a horizon (default 7 days), plus the current nudge and
// habit status. Used to ground open-ended brain answers (chatAgent, briefing)
// in real data instead of guessing. Every line traces to a real row in the
// store; nothing here is invented — same honesty rule as reflect.ts.

import { TODAY, daysBetween, fmtDate } from '../../domains'
import { renderPersonalFacts, renderLearnings } from '../learning'
import { renderRegistrySnapshot } from '../contextRegistry'
import { searchMemory } from '../../lib/supabase'
import { cogneeSearch } from './cognee'
import type { MemoryHit } from '../../types'
import type { Store } from './types'

function withinDays(date: string | null | undefined, days: number): boolean {
  if (!date) return false
  const d = daysBetween(TODAY, date)
  return d >= 0 && d <= days
}

export function buildMemorySnapshot(store: Store, opts: { days?: number } = {}): string {
  const horizon = opts.days ?? 7
  const parts: string[] = [`Vandaag: ${fmtDate(TODAY)}.`]

  // Per-table lines (open loops, projects, clients, project tasks/milestones/
  // invoices, goals, personal contacts, payments, habits, North Star
  // milestones, braindumps) now come from one place — contextRegistry.ts —
  // instead of each being its own hand-written block here. Adding a new
  // table to this snapshot is a registry entry, not an edit to this function.
  parts.push(...renderRegistrySnapshot(store, horizon))

  const upcomingMeetings = store.meetingDays.filter((m) => withinDays(m.date, horizon))
  if (upcomingMeetings.length) {
    parts.push(`Agenda binnen ${horizon} dagen: ${upcomingMeetings.map((m) => `${fmtDate(m.date)}: ${m.count} meeting(s)`).join('; ')}`)
  }

  if (store.nudge?.text) parts.push(`Huidige nudge: ${store.nudge.text}`)

  // Durable facts HEYRA has learned about Rick in earlier conversations — the
  // "learn as we speak" layer folded back in so answers stay personal across
  // sessions (heyra/learning.ts). Kept as two separate blocks: passive facts
  // about Rick vs. confirmed Kennisbank learnings he wants to apply — the
  // same split the Geleerd screen shows, so the two never blur together here
  // either.
  const personal = renderPersonalFacts(store.learnedFacts)
  if (personal) parts.push(personal)
  const learnings = renderLearnings(store.learnedFacts)
  if (learnings) parts.push(learnings)

  // Versioned profile facts (generic pattern engine, R11/R12 — see
  // profile_facts in the migration and types.ts's ProfileFact doc comment).
  // Unlike learnedFacts (AI-only, silently overwritten), every entry here was
  // confirm-gated and only ever superseded, never dropped — only the current
  // version is fetched into the store, so this is always the latest state.
  const profileFacts = (store.profileFacts ?? []).filter((f) => f.tier !== 'geheim')
  if (profileFacts.length) {
    parts.push(
      `Bevestigde patronen in je profiel: ${profileFacts.slice(0, 10).map((f) => f.label).join('; ')}`,
    )
  }

  return parts.join('\n')
}

// A slow/unreachable memory-search or cognee worker must never hold up a
// reply by more than this — whichever of the two resolved in time is used,
// the other is silently skipped. Bounded independently of cogneeSearch()'s own
// (much longer) internal timeout, since here it's grounding an answer the
// user is actively waiting on, not a separate additive UI field.
const RECALL_TIMEOUT_MS = 2500

function bounded<T>(p: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    p.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), RECALL_TIMEOUT_MS)),
  ])
}

// cogneeSearch() is configured with its own, much longer 15s timeout
// (heyra/agents/cognee.ts) because graph traversal is genuinely slower than
// a plain completion — but here it's racing against RECALL_TIMEOUT_MS
// (2.5s), so there was no visibility into how often the graph's real answer
// actually made it into grounding vs. got silently cut off. Lightweight,
// console-only observation (this app's existing logging convention, see
// e.g. lib/supabase.ts's warnWrite) of the SAME promise passed into
// bounded() below — never awaited here, so it adds no latency and can never
// affect the race's outcome, just reports on it after the fact.
function logCogneeRace(cognee: Promise<string | null>): void {
  const startedAt = Date.now()
  cognee.then((insight) => {
    const elapsedMs = Date.now() - startedAt
    const madeItInTime = elapsedMs <= RECALL_TIMEOUT_MS
    console.info(
      `[OSLIFE] cognee recall race: ${madeItInTime ? 'won' : 'LOST'} (${elapsedMs}ms vs ${RECALL_TIMEOUT_MS}ms ceiling), ${insight ? 'had' : 'no'} insight`,
    )
  })
  // No .catch: cogneeSearch() never rejects (null-on-any-failure contract,
  // see cognee.ts) — a rejection here would mean that contract broke, and
  // is exactly the kind of thing worth an unhandled-rejection surfacing.
}

/**
 * Best-effort semantic (hybrid full-text + vector) and knowledge-graph recall
 * for a specific question, meant to be appended to buildMemorySnapshot()'s
 * always-on structural snapshot. Unlike the snapshot (a capped dump of live
 * store slices), this actually searches — surfacing older braindumps,
 * interactions and summaries the snapshot's short horizon would otherwise
 * miss entirely. Empty string on no signal, no match, or any failure —
 * grounding degrades, it never blocks or throws.
 */
export async function buildRecallSection(input: string): Promise<string> {
  if (!input.trim()) return ''
  const cognee = cogneeSearch(input)
  logCogneeRace(cognee)
  const [hits, graphInsight] = await Promise.all([
    bounded(searchMemory(input, 6), [] as MemoryHit[]),
    bounded(cognee, null as string | null),
  ])
  const lines: string[] = hits.map((h) => `- [${h.source}] ${h.title}: ${h.snippet}`)
  if (graphInsight) lines.push(`- [kennisgraaf] ${graphInsight}`)
  return lines.length ? `Mogelijk relevant (geheugen):\n${lines.join('\n')}` : ''
}

export const MEMORY_SYSTEM_PROMPT =
  'Je bent HEYRA, het ene geheugen van OSLIFE (ParkingYou, PRJCT Agency, Buurtkaart en persoonlijk leven van de gebruiker). Je krijgt een feitelijke momentopname uit het echte geheugen en een Nederlandse vraag. Beantwoord de vraag kort en concreet (max 4 zinnen) met ALLEEN wat in de momentopname staat. Als de momentopname een blok "Wat ik in eerdere gesprekken over Rick heb geleerd", "Lessen en systemen die Rick wil toepassen op zijn leven of bedrijf" of "Bevestigde patronen in je profiel" bevat, gebruik die feiten, voorkeuren en lessen om je antwoord persoonlijk en passend te maken (toon, werkstijl, mensen die hij noemt, terugkerende patronen) — hou daarbij feiten over wie Rick IS gescheiden van lessen/systemen die hij nog wil TOEPASSEN, dat zijn geen synoniemen. Verzin nooit iets buiten wat er staat. Als de momentopname het antwoord niet dekt, zeg dat eerlijk in plaats van iets te verzinnen. Spreek Nederlands, informeel, direct. Gebruik markdown-nadruk: zet het belangrijkste getal, datum of feit vooraan in **vet**; som je twee of meer losse punten op, gebruik dan `- ` bullets (of `- [ ]` voor een actiepunt) in plaats van ze in één zin te proppen.'
