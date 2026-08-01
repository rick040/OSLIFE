// Object-permanence signal for Strategie HQ: an elaborated idea sitting in
// 'idea' or 'parked' status with no activity quietly falls out of mind — the
// same failure mode clientHealth (lib/crm/followUp.ts) catches for clients.
import { daysBetween } from '../domains'
import type { BusinessIdea } from '../types'

export type IdeaStaleness = 'none' | 'yellow' | 'red'

const YELLOW_AFTER_DAYS = 14
const RED_AFTER_DAYS = 30

/** Days since the idea was last touched (updatedAt), relative to `today`. */
export function ideaAgeDays(idea: BusinessIdea, today: string): number {
  return daysBetween(idea.updatedAt.slice(0, 10), today)
}

/**
 * Staleness relative to `today` — only 'idea' and 'parked' ideas can go
 * stale (an 'active' idea is being worked, 'archived' is deliberately
 * shelved); only elaborated ideas count (a still-processing capture isn't
 * "stuck", it's just new).
 */
export function ideaStaleness(idea: BusinessIdea, today: string): IdeaStaleness {
  if (idea.elaborationStatus !== 'ready') return 'none'
  if (idea.status !== 'idea' && idea.status !== 'parked') return 'none'
  const age = ideaAgeDays(idea, today)
  if (age >= RED_AFTER_DAYS) return 'red'
  if (age >= YELLOW_AFTER_DAYS) return 'yellow'
  return 'none'
}

export const STALENESS_META: Record<Exclude<IdeaStaleness, 'none'>, { hex: string; label: string }> = {
  yellow: { hex: '#FBBF24', label: 'Loopt stil' },
  red: { hex: '#F87171', label: 'Loopt vast' },
}
