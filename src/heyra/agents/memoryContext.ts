// ── HEYRA · memory snapshot ────────────────────────────────────────────────────
// Assembles a compact, factual Dutch summary of "everything relevant right now"
// from the live store — open loops, project deadlines, milestones, payments and
// agenda load within a horizon (default 7 days), plus the current nudge and
// habit status. Used to ground open-ended brain answers (chatAgent, briefing)
// in real data instead of guessing. Every line traces to a real row in the
// store; nothing here is invented — same honesty rule as reflect.ts.

import { TODAY, daysBetween, fmtDate } from '../../domains'
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

  if (store.nudge?.text) parts.push(`Huidige nudge: ${store.nudge.text}`)

  if (store.habits.length) {
    const doneToday = store.habits.filter((h) => h.doneToday).length
    parts.push(`Gewoontes: ${doneToday}/${store.habits.length} vandaag afgerond.`)
  }

  return parts.join('\n')
}

export const MEMORY_SYSTEM_PROMPT =
  'Je bent HEYRA, het ene geheugen van OSLIFE (ParkingYou, PRJCT Agency, Buurtkaart en persoonlijk leven van de gebruiker). Je krijgt een feitelijke momentopname uit het echte geheugen en een Nederlandse vraag. Beantwoord de vraag kort en concreet (max 4 zinnen) met ALLEEN wat in de momentopname staat. Als de momentopname het antwoord niet dekt, zeg dat eerlijk in plaats van iets te verzinnen. Spreek Nederlands, informeel, direct.'
