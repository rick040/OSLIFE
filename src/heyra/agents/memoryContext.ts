// ── HEYRA · memory snapshot ────────────────────────────────────────────────────
// Assembles a compact, factual Dutch summary of "everything relevant right now"
// from the live store — open loops, project deadlines, milestones, payments and
// agenda load within a horizon (default 7 days), plus the current nudge and
// habit status. Used to ground open-ended brain answers (chatAgent, briefing)
// in real data instead of guessing. Every line traces to a real row in the
// store; nothing here is invented — same honesty rule as reflect.ts.

import { TODAY, daysBetween, fmtDate } from '../../domains'
import { renderLearnedFacts } from '../learning'
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

  const openThreads = store.threads.filter((t) => t.status === 'open')
  const soonThreads = openThreads.filter((t) => withinDays(t.due, horizon))
  parts.push(
    `Open loops (${openThreads.length} totaal): ${
      openThreads.slice(0, 10).map((t) => `${t.title}${t.due ? ` (due ${fmtDate(t.due)})` : ''}`).join('; ') || 'geen'
    }`,
  )
  if (soonThreads.length) {
    parts.push(`Loops met deadline binnen ${horizon} dagen: ${soonThreads.map((t) => `${t.title} — ${fmtDate(t.due!)}`).join('; ')}`)
  }

  const liveProjects = store.projects.filter((p) => p.status !== 'done')
  parts.push(
    `Lopende projecten (${liveProjects.length}): ${
      liveProjects.slice(0, 10).map((p) => `${p.name} (${p.status}${p.deadline ? `, deadline ${fmtDate(p.deadline)}` : ''})`).join('; ') || 'geen'
    }`,
  )

  const dueMilestones = store.milestones.filter((m) => !m.done && withinDays(m.due, horizon))
  if (dueMilestones.length) {
    parts.push(`Mijlpalen binnen ${horizon} dagen: ${dueMilestones.map((m) => `${m.title} — ${fmtDate(m.due!)}`).join('; ')}`)
  }

  const duePayments = store.payments.filter((p) => p.status === 'open' && withinDays(p.due, horizon))
  if (duePayments.length) {
    parts.push(
      `Betalingen binnen ${horizon} dagen: ${duePayments
        .map((p) => `${p.payee} €${p.amount} (${p.direction === 'incoming' ? 'te ontvangen' : 'te betalen'}, ${fmtDate(p.due!)})`)
        .join('; ')}`,
    )
  }

  const upcomingMeetings = store.meetingDays.filter((m) => withinDays(m.date, horizon))
  if (upcomingMeetings.length) {
    parts.push(`Agenda binnen ${horizon} dagen: ${upcomingMeetings.map((m) => `${fmtDate(m.date)}: ${m.count} meeting(s)`).join('; ')}`)
  }

  // Recent braindumps — things Rick shared/captured (links, posts, PDFs, video
  // transcripts) distilled to lightweight notes. Lets HEYRA answer "wat had ik
  // ook alweer opgeslagen over X". Only ready entries; capped for token budget.
  const braindumps = (store.braindumpEntries ?? []).filter((e) => e.status === 'ready' && (e.summary || e.title))
  if (braindumps.length) {
    parts.push(
      `Recente braindumps (${braindumps.length}): ${braindumps
        .slice(0, 12)
        .map((e) => `${e.title || e.summary}${e.tags.length ? ` [${e.tags.slice(0, 3).join(', ')}]` : ''}`)
        .join('; ')}`,
    )
  }

  if (store.nudge?.text) parts.push(`Huidige nudge: ${store.nudge.text}`)

  if (store.habits.length) {
    const doneToday = store.habits.filter((h) => h.doneToday).length
    parts.push(`Gewoontes: ${doneToday}/${store.habits.length} vandaag afgerond.`)
  }

  // Durable facts HEYRA has learned about Rick in earlier conversations — the
  // "learn as we speak" layer folded back in so answers stay personal across
  // sessions (heyra/learning.ts).
  const learned = renderLearnedFacts(store.learnedFacts)
  if (learned) parts.push(learned)

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
  const [hits, graphInsight] = await Promise.all([
    bounded(searchMemory(input, 6), [] as MemoryHit[]),
    bounded(cogneeSearch(input), null as string | null),
  ])
  const lines: string[] = hits.map((h) => `- [${h.source}] ${h.title}: ${h.snippet}`)
  if (graphInsight) lines.push(`- [kennisgraaf] ${graphInsight}`)
  return lines.length ? `Mogelijk relevant (geheugen):\n${lines.join('\n')}` : ''
}

export const MEMORY_SYSTEM_PROMPT =
  'Je bent HEYRA, het ene geheugen van OSLIFE (ParkingYou, PRJCT Agency, Buurtkaart en persoonlijk leven van de gebruiker). Je krijgt een feitelijke momentopname uit het echte geheugen en een Nederlandse vraag. Beantwoord de vraag kort en concreet (max 4 zinnen) met ALLEEN wat in de momentopname staat. Als de momentopname een blok "Wat ik in eerdere gesprekken over Rick heb geleerd" of "Bevestigde patronen in je profiel" bevat, gebruik die feiten en voorkeuren om je antwoord persoonlijk en passend te maken (toon, werkstijl, mensen die hij noemt, terugkerende patronen) — maar verzin nooit iets buiten wat er staat. Als de momentopname het antwoord niet dekt, zeg dat eerlijk in plaats van iets te verzinnen. Spreek Nederlands, informeel, direct. Gebruik markdown-nadruk: zet het belangrijkste getal, datum of feit vooraan in **vet**; som je twee of meer losse punten op, gebruik dan `- ` bullets (of `- [ ]` voor een actiepunt) in plaats van ze in één zin te proppen.'
