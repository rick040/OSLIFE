// Object-permanence follow-up health for CRM clients.
//
// ADHD-signature feature: a client you last spoke to weeks ago quietly falls out
// of mind. This turns "when did I last contact them?" into a green/yellow/red dot
// measured against each client's own follow-up cadence, so the ones slipping past
// their cycle surface instead of disappearing.
import { daysBetween } from '../../domains'
import type { Client } from '../../types'

export type FollowUpHealth = 'green' | 'yellow' | 'red' | 'none'

/** Default cadence when a client has no explicit follow_up_cycle_days. */
export const DEFAULT_CYCLE_DAYS = 30
/** How many days before the due date a client turns yellow. */
export const YELLOW_WINDOW_DAYS = 3

/** The date the next follow-up is due (last contact + cycle), or null if never contacted. */
export function nextFollowUp(client: Client): string | null {
  if (!client.lastContactedAt) return null
  const cycle = client.followUpCycleDays ?? DEFAULT_CYCLE_DAYS
  const base = new Date(client.lastContactedAt.slice(0, 10) + 'T00:00:00')
  base.setDate(base.getDate() + cycle)
  // Format with local getters — NOT toISOString(), which converts local midnight
  // to UTC and lands a day early in Europe/Amsterdam (UTC+1/+2).
  const y = base.getFullYear()
  const mo = String(base.getMonth() + 1).padStart(2, '0')
  const d = String(base.getDate()).padStart(2, '0')
  return `${y}-${mo}-${d}`
}

/**
 * Follow-up health for a client relative to `today`:
 *  - none:   never contacted — no baseline to measure against
 *  - red:    past the follow-up due date (last contact + cycle)
 *  - yellow: within YELLOW_WINDOW_DAYS of the due date
 *  - green:  safely inside the cycle
 */
export function clientHealth(client: Client, today: string): FollowUpHealth {
  const due = nextFollowUp(client)
  if (!due) return 'none'
  const daysLeft = daysBetween(today, due) // due − today; negative = overdue
  if (daysLeft < 0) return 'red'
  if (daysLeft <= YELLOW_WINDOW_DAYS) return 'yellow'
  return 'green'
}

/** Presentation for each health state — dot colour + short Dutch label. */
export const FOLLOWUP_META: Record<FollowUpHealth, { hex: string; label: string }> = {
  green:  { hex: '#34D399', label: 'Op schema' },
  yellow: { hex: '#FBBF24', label: 'Opvolgen binnenkort' },
  red:    { hex: '#F87171', label: 'Opvolging te laat' },
  none:   { hex: '#8C9080', label: 'Nog geen contact' },
}
