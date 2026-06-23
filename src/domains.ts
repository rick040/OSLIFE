import type { Domain, ItemKind, Sentiment } from './types'

export const TODAY = '2026-06-22' // fixed reference date for this prototype

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
  parkingyou: '#6E8CA8',
  prjct: '#9385B0',
  buurtkaart: '#6FA07C',
  personal: '#C6A05B',
  cross: '#C58392',
}

export const KIND_LABEL: Record<ItemKind, string> = {
  task: 'task',
  note: 'note',
  vent: 'vent',
  link: 'link',
  voice: 'voice note',
  transaction: 'transaction',
  event: 'event',
  health: 'health',
  email: 'email',
  idea: 'idea',
}

export const SENTIMENT_META: Record<Sentiment, { label: string; cls: string }> = {
  positive: { label: 'positive', cls: 'bg-buurtkaart/15 text-buurtkaart-deep' },
  neutral: { label: 'neutral', cls: 'bg-line text-muted' },
  negative: { label: 'negative', cls: 'bg-orange-500/15 text-orange-700' },
  stressed: { label: 'stressed', cls: 'bg-cross/15 text-cross-deep' },
}

/** Short date like "Jun 24". */
export function fmtDate(iso: string | null): string {
  if (!iso) return 'no date'
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Days between two ISO dates (b - a). */
export function daysBetween(a: string, b: string): number {
  const da = new Date(a.slice(0, 10) + 'T00:00:00').getTime()
  const db = new Date(b.slice(0, 10) + 'T00:00:00').getTime()
  return Math.round((db - da) / 86400000)
}
