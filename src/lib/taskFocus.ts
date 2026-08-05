// Shared task urgency + focus model.
//
// Two screens now answer "what should I actually do today" from the same
// tasks: the Taken list (grouped by how late something is) and the dashboard's
// "Belangrijkste vandaag" block (the three things worth ticking off today).
// Both read the ranking from here, so a task that reads as urgent on one
// screen can never read as relaxed on the other.
//
// Everything takes an explicit `today` so the logic is testable without the
// wall clock, defaulting to the app's TODAY.
import { TODAY, fmtDate } from '../domains'
import { daysUntil, overdueLabel } from './dates'
import type { Priority, Thread } from '../types'

/** How late/soon a task is — the axis the Taken list groups on. */
export type TaskUrgency = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none'

/** Buckets in the order they're shown: most on fire first, undated last. */
export const URGENCY_ORDER: TaskUrgency[] = ['overdue', 'today', 'tomorrow', 'week', 'later', 'none']

export interface UrgencyMeta {
  /** Bucket heading in the grouped Taken list. */
  label: string
  /** Tinted pill (background + readable text) for a due badge. */
  pill: string
  /** Left accent rail on a task row — the at-a-glance urgency signal. */
  rail: string
  /** Solid dot next to a bucket heading. */
  dot: string
  /** Heading text colour, so an overdue bucket reads red before you parse it. */
  text: string
}

export const URGENCY_META: Record<TaskUrgency, UrgencyMeta> = {
  overdue: { label: 'Te laat', pill: 'bg-cross/15 text-cross-deep', rail: 'bg-cross', dot: 'bg-cross', text: 'text-cross-deep' },
  today: { label: 'Vandaag', pill: 'bg-personal/15 text-personal-deep', rail: 'bg-personal', dot: 'bg-personal', text: 'text-personal-deep' },
  tomorrow: { label: 'Morgen', pill: 'bg-parkingyou/15 text-parkingyou-deep', rail: 'bg-parkingyou', dot: 'bg-parkingyou', text: 'text-parkingyou-deep' },
  week: { label: 'Deze week', pill: 'bg-buurtkaart/15 text-buurtkaart-deep', rail: 'bg-buurtkaart', dot: 'bg-buurtkaart', text: 'text-buurtkaart-deep' },
  later: { label: 'Later', pill: 'bg-sunken text-muted', rail: 'bg-line-strong', dot: 'bg-line-strong', text: 'text-muted' },
  none: { label: 'Geen deadline', pill: 'bg-sunken text-muted', rail: 'bg-line', dot: 'bg-line-strong', text: 'text-muted' },
}

export const PRIORITY_ORDER: Priority[] = ['High', 'Medium', 'Low']
export const PRIORITY_RANK: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 }
export const PRIORITY_LABEL: Record<Priority, string> = { High: 'Hoog', Medium: 'Middel', Low: 'Laag' }
export const PRIORITY_STYLE: Record<Priority, string> = {
  High: 'bg-cross/15 text-cross-deep',
  Medium: 'bg-personal/15 text-personal-deep',
  Low: 'bg-sunken text-muted',
}

/** Which urgency bucket a due date falls in. */
export function taskUrgency(due: string | null, today: string = TODAY): TaskUrgency {
  const d = daysUntil(due, today)
  if (d === null) return 'none'
  if (d < 0) return 'overdue'
  if (d === 0) return 'today'
  if (d === 1) return 'tomorrow'
  if (d <= 7) return 'week'
  return 'later'
}

/**
 * Row badge wording: how late ("3d te laat") or how soon ("vandaag", "morgen",
 * "over 4d") a task is — a date alone ("12 aug") makes you do the subtraction
 * yourself, which is exactly the work this screen should be doing for you.
 */
export function urgencyBadge(due: string | null, today: string = TODAY): string {
  const d = daysUntil(due, today)
  if (d === null) return 'geen deadline'
  if (d < 0) return overdueLabel(d)
  if (d === 0) return 'vandaag'
  if (d === 1) return 'morgen'
  if (d <= 7) return `over ${d}d`
  return fmtDate(due)
}

const URGENCY_RANK: Record<TaskUrgency, number> = { overdue: 0, today: 1, tomorrow: 2, week: 3, later: 4, none: 5 }

function priorityRank(p: Priority | null | undefined): number {
  return p ? PRIORITY_RANK[p] : 3
}

/** Deadline first, priority as the tie-breaker, newest first after that. */
function byUrgency(a: Thread, b: Thread, today: string): number {
  const ua = URGENCY_RANK[taskUrgency(a.due, today)]
  const ub = URGENCY_RANK[taskUrgency(b.due, today)]
  if (ua !== ub) return ua - ub
  const da = daysUntil(a.due, today)
  const db = daysUntil(b.due, today)
  if (da !== null && db !== null && da !== db) return da - db
  const pa = priorityRank(a.priority)
  const pb = priorityRank(b.priority)
  if (pa !== pb) return pa - pb
  return b.createdAt.localeCompare(a.createdAt)
}

export type SortMode = 'urgency' | 'priority' | 'created'

export const SORT_LABEL: Record<SortMode, string> = {
  urgency: 'Urgentie',
  priority: 'Prioriteit',
  created: 'Nieuwste',
}

/** Non-mutating sort of tasks under one of the three list orderings. */
export function sortTasks(tasks: Thread[], mode: SortMode = 'urgency', today: string = TODAY): Thread[] {
  const list = [...tasks]
  if (mode === 'created') return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  if (mode === 'priority') {
    return list.sort((a, b) => {
      const pa = priorityRank(a.priority)
      const pb = priorityRank(b.priority)
      return pa !== pb ? pa - pb : byUrgency(a, b, today)
    })
  }
  return list.sort((a, b) => byUrgency(a, b, today))
}

export interface UrgencyGroup {
  urgency: TaskUrgency
  tasks: Thread[]
}

/**
 * Tasks split into urgency buckets (empty buckets dropped), each internally
 * sorted by `mode`. Grouping is what turns a flat list of thirty things into
 * "these four are late, these two are today" — the actual manageability win.
 */
export function groupByUrgency(tasks: Thread[], mode: SortMode = 'urgency', today: string = TODAY): UrgencyGroup[] {
  return URGENCY_ORDER.map((urgency) => ({
    urgency,
    tasks: sortTasks(tasks.filter((t) => taskUrgency(t.due, today) === urgency), mode, today),
  })).filter((g) => g.tasks.length > 0)
}

export interface TaskCounts {
  open: number
  overdue: number
  today: number
  week: number
  undated: number
  done: number
}

/** Headline counts for the Taken stat strip (also the strip's filter chips). */
export function taskCounts(tasks: Thread[], today: string = TODAY): TaskCounts {
  const open = tasks.filter((t) => t.status === 'open')
  const count = (u: TaskUrgency) => open.filter((t) => taskUrgency(t.due, today) === u).length
  return {
    open: open.length,
    overdue: count('overdue'),
    today: count('today'),
    week: count('tomorrow') + count('week'),
    undated: count('none'),
    done: tasks.filter((t) => t.status === 'closed').length,
  }
}

export interface FocusPick {
  task: Thread
  /** True when Rick deliberately pinned it for today; false for an auto-suggestion. */
  pinned: boolean
}

/**
 * The day's "Belangrijkste vandaag" shortlist, in the order it's shown:
 *
 *  1. open pins — what Rick deliberately picked for today;
 *  2. suggestions — the most pressing open tasks, filling the empty slots up
 *     to `limit`, so the block still answers "what now" on a day nothing was
 *     pinned;
 *  3. pins already ticked off — kept (at the bottom, out of the way) so the
 *     block shows the day's progress instead of quietly emptying itself.
 *
 * Done pins don't consume a slot: ticking one off pulls the next thing up
 * rather than shrinking the list to nothing.
 */
export function focusTasksForDay(threads: Thread[], today: string = TODAY, limit = 3): FocusPick[] {
  const pinned = threads.filter((t) => t.focusDate === today)
  const openPinned = sortTasks(pinned.filter((t) => t.status === 'open'), 'urgency', today)
  const donePinned = sortTasks(pinned.filter((t) => t.status !== 'open'), 'urgency', today)
  const slotsLeft = Math.max(0, limit - openPinned.length)
  const suggested = slotsLeft
    ? sortTasks(threads.filter((t) => t.status === 'open' && t.focusDate !== today), 'urgency', today).slice(0, slotsLeft)
    : []
  return [
    ...openPinned.map((task) => ({ task, pinned: true })),
    ...suggested.map((task) => ({ task, pinned: false })),
    ...donePinned.map((task) => ({ task, pinned: true })),
  ]
}
