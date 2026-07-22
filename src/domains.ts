import type { Domain, ItemKind, Sentiment } from './types'

/** The current Amsterdam calendar date (YYYY-MM-DD), recomputed on every call.
 *  Prefer this over the TODAY constant anywhere the value must stay correct in a
 *  long-lived / always-open session (it would otherwise freeze at load time). */
export function today(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' })
}

/** Amsterdam date at module load. Fine for one-shot reads; use today() for
 *  anything that must survive a midnight rollover in an open tab/PWA. */
export const TODAY = today()

export const DOMAIN_META: Record<
  Domain,
  { label: string; color: string; dot: string; ring: string; soft: string }
> = {
  parkingyou: {
    label: 'ParkingYou',
    color: 'text-parkingyou-deep',
    dot: 'bg-parkingyou',
    ring: 'ring-parkingyou/40',
    soft: 'bg-parkingyou/12 text-parkingyou-deep',
  },
  prjct: {
    label: 'PRJCT Agency',
    color: 'text-prjct-deep',
    dot: 'bg-prjct',
    ring: 'ring-prjct/40',
    soft: 'bg-prjct/12 text-prjct-deep',
  },
  buurtkaart: {
    label: 'Buurtkaart',
    color: 'text-buurtkaart-deep',
    dot: 'bg-buurtkaart',
    ring: 'ring-buurtkaart/40',
    soft: 'bg-buurtkaart/15 text-buurtkaart-deep',
  },
  personal: {
    label: 'Personal',
    color: 'text-personal-deep',
    dot: 'bg-personal',
    ring: 'ring-personal/40',
    soft: 'bg-personal/15 text-personal-deep',
  },
  cross: {
    label: 'Cross-domain',
    color: 'text-cross-deep',
    dot: 'bg-cross',
    ring: 'ring-cross/40',
    soft: 'bg-cross/12 text-cross-deep',
  },
}

/** Raw hex per domain (mid tone), for recharts fills/strokes. */
export const DOMAIN_HEX: Record<Domain, string> = {
  parkingyou: '#60A5FA',
  prjct: '#A78BFA',
  buurtkaart: '#34D399',
  personal: '#FBBF24',
  cross: '#F87171',
}

export const KIND_LABEL: Record<ItemKind, string> = {
  task: 'taak',
  note: 'notitie',
  vent: 'uitlaatklep',
  link: 'link',
  voice: 'spraaknotitie',
  transaction: 'transactie',
  event: 'evenement',
  health: 'gezondheid',
  email: 'e-mail',
  idea: 'idee',
}

export const SENTIMENT_META: Record<Sentiment, { label: string; cls: string }> = {
  positive: { label: 'positief', cls: 'bg-buurtkaart/15 text-buurtkaart-deep' },
  neutral: { label: 'neutraal', cls: 'bg-line text-muted' },
  negative: { label: 'negatief', cls: 'bg-orange-500/15 text-orange-700' },
  stressed: { label: 'gestrest', cls: 'bg-cross/15 text-cross-deep' },
}

/** Short date like "24 jun". */
export function fmtDate(iso: string | null): string {
  if (!iso) return 'geen datum'
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  return d.toLocaleDateString('nl-NL', { month: 'short', day: 'numeric', timeZone: 'Europe/Amsterdam' })
}

/** Days between two ISO dates (b - a). */
export function daysBetween(a: string, b: string): number {
  const da = new Date(a.slice(0, 10) + 'T00:00:00').getTime()
  const db = new Date(b.slice(0, 10) + 'T00:00:00').getTime()
  return Math.round((db - da) / 86400000)
}

/**
 * Consecutive-day streak from a set/array of completed ISO dates, ending today
 * (or yesterday if today isn't ticked yet, so an as-yet-undone today doesn't
 * zero an ongoing run). Derived from history — NOT an incrementing counter, so a
 * missed day correctly resets the streak.
 */
export function habitStreak(history: Iterable<string>, todayStr: string = today()): number {
  const set = history instanceof Set ? history : new Set(history)
  const d = new Date(todayStr + 'T00:00:00')
  const iso = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  if (!set.has(iso(d))) d.setDate(d.getDate() - 1) // today not done yet → anchor on yesterday
  let streak = 0
  while (set.has(iso(d))) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}
