// ── HEYRA · today-block suggestions ───────────────────────────────────────────
// The Dashboard's "Vandaag" row only ever showed blocks that already exist
// (synced calendar events, logged activities like a walk/drive). This engine
// proposes ADDITIONAL blocks for the rest of today — not a fixed template
// repeated every day, but a fresh read of what's actually true right now:
// which habits are still open, which tasks are due, which payments/mail are
// overdue, whether Kyra needs a reminder, and whether last night's sleep
// means the afternoon should be lighter. Every suggestion changes as the
// underlying data changes, so the same two blocks never just repeat forever.
//
// Pure + rule-based, same philosophy as heyra/suggestions.ts: transparent and
// instant, no network call needed. A suggestion already covered by a real
// block today (dedup by keyword) is never proposed twice.

import type { Domain } from '../types'

export interface BlockSuggestion {
  id: string
  title: string
  domain: Domain
  start: string // "HH:MM"
  end: string
  rationale: string
  emoji: string
}

export interface SuggestionHabit {
  id: string
  name: string
  emoji: string
  streak: number
}

export interface SuggestionTask {
  id: string
  name: string
  domain: Domain
}

export interface SuggestionPerson {
  id: string
  name: string
  domain: Domain
}

export interface SuggestionPayment {
  domain: Domain
}

export interface BlockSuggestionContext {
  /** Minutes since local midnight, right now. */
  nowMinutes: number
  /** Every non-skipped block already on today's agenda, as [startMin, endMin]. */
  busy: [number, number][]
  /** Lower-cased titles of today's existing blocks — for keyword dedup. */
  todaysBlockTitles: string[]
  habitsOpen: SuggestionHabit[]
  dogDue: { id: string; title: string }[]
  overduePayments: SuggestionPayment[]
  unreadImportantMailCount: number
  focusTasks: SuggestionTask[]
  clientsNeedingFollowUp: SuggestionPerson[]
  nextMilestone: { title: string; domain: Domain } | null
  /** Last night's sleep in hours, or null when there's no real reading yet. */
  sleepHours: number | null
}

const DAY_START = 6 * 60
// Late enough that a real evening still gets suggestions (a 22:48 check-in
// should still be able to fit a 20-minute block before bed), but not so late
// it proposes starting something at 23:58.
const DAY_END = 23 * 60 + 45

export const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10))
  return (h || 0) * 60 + (m || 0)
}
export const toHHMM = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

const PEAK_END = 12 * 60 + 30

interface Candidate {
  key: string
  title: string
  domain: Domain
  emoji: string
  rationale: string
  durationMin: number
  /** Earliest minute this candidate would ideally start. */
  pref: number
  score: number
  /** Keyword(s) that mean "this is already covered by a real block today". */
  dedupeKeywords: string[]
}

/** First free slot of `durationMin` at/after `earliest`, or null if today has no room left. */
function findSlot(busy: [number, number][], durationMin: number, earliest: number): [number, number] | null {
  let start = Math.max(Math.ceil(earliest / 5) * 5, DAY_START)
  const sorted = [...busy].sort((a, b) => a[0] - b[0])
  // eslint-disable-next-line no-constant-condition
  while (start + durationMin <= DAY_END) {
    const end = start + durationMin
    const clash = sorted.find(([s, e]) => start < e && s < end)
    if (!clash) return [start, end]
    start = clash[1]
  }
  return null
}

const covered = (titles: string[], keywords: string[]): boolean =>
  keywords.some((k) => k && titles.some((t) => t.includes(k)))

/**
 * Proposes up to `max` fresh blocks for the rest of today, placed in whatever
 * free time is left, most-pressing first. Returns [] on a genuinely clear day
 * — never invents filler just to have something to show.
 */
export function suggestTodayBlocks(ctx: BlockSuggestionContext, max = 4): BlockSuggestion[] {
  const titles = ctx.todaysBlockTitles
  const candidates: Candidate[] = []

  if (ctx.overduePayments.length && !covered(titles, ['betal'])) {
    candidates.push({
      key: 'money',
      title: `Betalingen wegwerken (${ctx.overduePayments.length})`,
      domain: ctx.overduePayments[0].domain,
      emoji: '💳',
      rationale: `${ctx.overduePayments.length} betaling${ctx.overduePayments.length > 1 ? 'en staan' : ' staat'} al te laat — 20 minuten scheelt een hoop rente/gedoe.`,
      durationMin: 20,
      pref: ctx.nowMinutes,
      score: 96,
      dedupeKeywords: ['betal'],
    })
  }

  if (ctx.unreadImportantMailCount > 0 && !covered(titles, ['mail'])) {
    candidates.push({
      key: 'mail',
      title: `Mail beantwoorden (${ctx.unreadImportantMailCount} belangrijk)`,
      domain: 'cross',
      emoji: '📬',
      rationale: `${ctx.unreadImportantMailCount} belangrijke mail${ctx.unreadImportantMailCount > 1 ? 's wachten' : ' wacht'} nog op antwoord.`,
      durationMin: Math.min(45, 15 + ctx.unreadImportantMailCount * 10),
      pref: ctx.nowMinutes,
      score: 88,
      dedupeKeywords: ['mail'],
    })
  }

  ctx.focusTasks.slice(0, 2).forEach((t, i) => {
    const kw = t.name.toLowerCase()
    if (covered(titles, [kw])) return
    candidates.push({
      key: `task-${t.id}`,
      title: `Diep werk: ${t.name}`,
      domain: t.domain,
      emoji: '🎯',
      rationale: 'Deze taak is vandaag aan de beurt — plan er een blok focustijd voor.',
      durationMin: 45,
      pref: ctx.nowMinutes < PEAK_END ? Math.max(ctx.nowMinutes, 9 * 60 + 30) : ctx.nowMinutes,
      score: 92 - i * 4,
      dedupeKeywords: [kw],
    })
  })

  ctx.habitsOpen.slice(0, 2).forEach((h, i) => {
    const kw = h.name.toLowerCase()
    if (covered(titles, [kw])) return
    candidates.push({
      key: `habit-${h.id}`,
      title: `${h.emoji} ${h.name}`,
      domain: 'personal',
      emoji: h.emoji,
      rationale: h.streak > 0 ? `Nog niet afgevinkt vandaag — houd je reeks van ${h.streak} dag(en) erin.` : 'Nog niet afgevinkt vandaag.',
      durationMin: 15,
      pref: ctx.nowMinutes,
      score: 66 + Math.min(10, h.streak) - i,
      dedupeKeywords: [kw],
    })
  })

  if (ctx.dogDue.length) {
    const r = ctx.dogDue[0]
    const kw = r.title.toLowerCase()
    if (!covered(titles, ['wandel', 'kyra', 'hond', 'walk', kw])) {
      candidates.push({
        key: `dog-${r.id}`,
        title: `🐾 ${r.title}`,
        domain: 'personal',
        emoji: '🐾',
        rationale: 'Staat open voor Kyra — nog niet als blok op vandaag gezet.',
        durationMin: 30,
        pref: Math.max(ctx.nowMinutes, 17 * 60),
        score: 78,
        dedupeKeywords: ['wandel', 'kyra', 'hond', kw],
      })
    }
  }

  if (ctx.clientsNeedingFollowUp.length) {
    const cl = ctx.clientsNeedingFollowUp[0]
    const kw = cl.name.toLowerCase()
    if (!covered(titles, [kw])) {
      candidates.push({
        key: `client-${cl.id}`,
        title: `Bel ${cl.name}`,
        domain: cl.domain,
        emoji: '📞',
        rationale: 'Opvolging is verlopen — een kort belletje houdt het warm.',
        durationMin: 20,
        pref: Math.max(ctx.nowMinutes, 13 * 60 + 15),
        score: 72,
        dedupeKeywords: [kw],
      })
    }
  }

  if (
    ctx.nextMilestone &&
    !ctx.focusTasks.length &&
    !covered(titles, [ctx.nextMilestone.title.toLowerCase(), 'diep werk'])
  ) {
    candidates.push({
      key: 'milestone',
      title: `Werk aan: ${ctx.nextMilestone.title}`,
      domain: ctx.nextMilestone.domain,
      emoji: '🚀',
      rationale: 'Eerstvolgende mijlpaal richting je doel — nog geen blok voor gepland.',
      durationMin: 45,
      pref: ctx.nowMinutes < PEAK_END ? Math.max(ctx.nowMinutes, 9 * 60 + 30) : ctx.nowMinutes,
      score: 64,
      dedupeKeywords: [ctx.nextMilestone.title.toLowerCase()],
    })
  }

  if (ctx.sleepHours != null && ctx.sleepHours > 0 && ctx.sleepHours < 6.5 && !covered(titles, ['rust', 'powernap'])) {
    candidates.push({
      key: 'rest',
      title: 'Powernap / korte rust',
      domain: 'personal',
      emoji: '😴',
      rationale: `Je sliep maar ${ctx.sleepHours}u — bouw een korte rustpauze in plaats van door te stomen.`,
      durationMin: 20,
      pref: Math.max(ctx.nowMinutes, 14 * 60 + 30),
      score: 55,
      dedupeKeywords: ['rust', 'powernap'],
    })
  }

  const busy: [number, number][] = [...ctx.busy]
  const out: BlockSuggestion[] = []
  for (const c of candidates.sort((a, b) => b.score - a.score)) {
    if (out.length >= max) break
    const slot = findSlot(busy, c.durationMin, c.pref)
    if (!slot) continue
    busy.push(slot)
    out.push({
      id: `sugg-${c.key}`,
      title: c.title,
      domain: c.domain,
      start: toHHMM(slot[0]),
      end: toHHMM(slot[1]),
      rationale: c.rationale,
      emoji: c.emoji,
    })
  }

  return out.sort((a, b) => a.start.localeCompare(b.start))
}
