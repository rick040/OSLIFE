// Shared deadline/due-date presentation.
// One core computation (days until a due date) with two presentation styles:
//  - deadlineInfo(): badge style ("Xd te laat" / "Vandaag" / "over Xd" / date)
//    used on CRM project cards and ProjectDetail tasks/milestones.
//  - dueLabel(): compact row style ("Xd te laat" when overdue, otherwise an
//    optionally prefixed short date) used in dashboard/task/payment lists.
import { TODAY, daysBetween, fmtDate } from '../domains'

/** Days from `today` until `iso` (negative = overdue), or null when no date. */
export function daysUntil(iso: string, today?: string): number
export function daysUntil(iso: string | null, today?: string): number | null
export function daysUntil(iso: string | null, today: string = TODAY): number | null {
  return iso ? daysBetween(today, iso) : null
}

/** Canonical overdue wording for a negative days-until value: "3d te laat". */
export function overdueLabel(days: number): string {
  return `${-days}d te laat`
}

export interface DeadlineInfo {
  label: string
  color: string
  urgent: boolean
}

/**
 * Deadline badge: "Xd te laat" (overdue) / "Vandaag" / "over Xd" (within a
 * week) / short date. `urgent` covers everything up to and including 7 days.
 */
export function deadlineInfo(iso: string | null, today: string = TODAY): DeadlineInfo | null {
  const d = daysUntil(iso, today)
  if (d === null) return null
  if (d < 0) return { label: overdueLabel(d), color: '#C58392', urgent: true }
  if (d === 0) return { label: 'Vandaag', color: '#C6A05B', urgent: true }
  if (d <= 7) return { label: `over ${d}d`, color: '#C6A05B', urgent: true }
  return { label: fmtDate(iso), color: '#8C9080', urgent: false }
}

/**
 * Compact row label: "Xd te laat" when overdue, otherwise `prefix` + short
 * date; `none` when there is no date. Pass `active: false` for done/closed
 * items so they keep the plain date even when past due.
 */
export function dueLabel(
  iso: string | null,
  opts: { prefix?: string; none?: string; active?: boolean; today?: string } = {},
): { label: string; overdue: boolean } {
  const { prefix = '', none = 'geen datum', active = true, today = TODAY } = opts
  const d = daysUntil(iso, today)
  if (d === null) return { label: none, overdue: false }
  if (active && d < 0) return { label: overdueLabel(d), overdue: true }
  return { label: `${prefix}${fmtDate(iso)}`, overdue: false }
}
