import { describe, it, expect } from 'vitest'
import {
  taskUrgency,
  urgencyBadge,
  sortTasks,
  groupByUrgency,
  taskCounts,
  focusTasksForDay,
} from './taskFocus'
import type { Priority, Thread } from '../types'

// Explicit `today` everywhere so none of this depends on the wall clock.
const today = '2026-08-05'

let seq = 0
function task(over: Partial<Thread> = {}): Thread {
  seq += 1
  return {
    id: `t${seq}`,
    domain: 'personal',
    title: `taak ${seq}`,
    owedTo: 'self (HEYRA)',
    due: null,
    status: 'open',
    // Descending createdAt by construction order, so "newest first" is stable.
    createdAt: `2026-07-${String(30 - seq).padStart(2, '0')}T09:00:00.000Z`,
    priority: null,
    ...over,
  }
}

describe('taskUrgency', () => {
  it('buckets a past deadline as overdue', () => expect(taskUrgency('2026-08-01', today)).toBe('overdue'))
  it('buckets today', () => expect(taskUrgency('2026-08-05', today)).toBe('today'))
  it('buckets tomorrow', () => expect(taskUrgency('2026-08-06', today)).toBe('tomorrow'))
  it('buckets the rest of the week', () => expect(taskUrgency('2026-08-12', today)).toBe('week'))
  it('buckets beyond a week as later', () => expect(taskUrgency('2026-08-13', today)).toBe('later'))
  it('buckets a missing deadline as none', () => expect(taskUrgency(null, today)).toBe('none'))
})

describe('urgencyBadge', () => {
  it('says how late, not the date', () => expect(urgencyBadge('2026-08-02', today)).toBe('3d te laat'))
  it('says vandaag / morgen', () => {
    expect(urgencyBadge('2026-08-05', today)).toBe('vandaag')
    expect(urgencyBadge('2026-08-06', today)).toBe('morgen')
  })
  it('counts down within the week', () => expect(urgencyBadge('2026-08-09', today)).toBe('over 4d'))
  it('falls back to a plain date further out', () => expect(urgencyBadge('2026-09-20', today)).toBe('20 sep'))
  it('handles no deadline', () => expect(urgencyBadge(null, today)).toBe('geen deadline'))
})

describe('sortTasks', () => {
  it('puts the most overdue first and undated last', () => {
    const late = task({ due: '2026-08-01' })
    const veryLate = task({ due: '2026-07-20' })
    const soon = task({ due: '2026-08-06' })
    const undated = task({ due: null })
    expect(sortTasks([undated, soon, late, veryLate], 'urgency', today).map((t) => t.id)).toEqual([
      veryLate.id, late.id, soon.id, undated.id,
    ])
  })

  it('breaks a deadline tie on priority', () => {
    const low = task({ due: '2026-08-05', priority: 'Low' })
    const high = task({ due: '2026-08-05', priority: 'High' })
    expect(sortTasks([low, high], 'urgency', today).map((t) => t.id)).toEqual([high.id, low.id])
  })

  it('priority mode leads on priority but still ranks urgency inside a level', () => {
    const highLater = task({ due: '2026-09-01', priority: 'High' })
    const highNow = task({ due: '2026-08-01', priority: 'High' })
    const mediumNow = task({ due: '2026-08-01', priority: 'Medium' })
    expect(sortTasks([highLater, mediumNow, highNow], 'priority', today).map((t) => t.id)).toEqual([
      highNow.id, highLater.id, mediumNow.id,
    ])
  })

  it('created mode is newest first regardless of deadline', () => {
    const older = task({ createdAt: '2026-07-01T09:00:00.000Z', due: '2026-08-01' })
    const newer = task({ createdAt: '2026-08-04T09:00:00.000Z', due: null })
    expect(sortTasks([older, newer], 'created', today).map((t) => t.id)).toEqual([newer.id, older.id])
  })

  it('does not mutate its input', () => {
    const a = task({ due: '2026-09-01' })
    const b = task({ due: '2026-08-01' })
    const input = [a, b]
    sortTasks(input, 'urgency', today)
    expect(input.map((t) => t.id)).toEqual([a.id, b.id])
  })
})

describe('groupByUrgency', () => {
  it('drops empty buckets and keeps the on-fire ones first', () => {
    const groups = groupByUrgency(
      [task({ due: null }), task({ due: '2026-08-01' }), task({ due: '2026-08-05' })],
      'urgency',
      today,
    )
    expect(groups.map((g) => g.urgency)).toEqual(['overdue', 'today', 'none'])
    expect(groups.every((g) => g.tasks.length === 1)).toBe(true)
  })
})

describe('taskCounts', () => {
  it('counts open work by urgency and closed work separately', () => {
    const counts = taskCounts(
      [
        task({ due: '2026-08-01' }),
        task({ due: '2026-08-05' }),
        task({ due: '2026-08-06' }),
        task({ due: '2026-08-10' }),
        task({ due: null }),
        task({ due: '2026-08-01', status: 'closed' }),
      ],
      today,
    )
    expect(counts).toEqual({ open: 5, overdue: 1, today: 1, week: 2, undated: 1, done: 1 })
  })
})

describe('focusTasksForDay', () => {
  it('leads with pinned tasks, then tops up with the most urgent open ones', () => {
    const pinned = task({ focusDate: today, due: null })
    const veryLate = task({ due: '2026-07-25' })
    const later = task({ due: '2026-09-01' })
    const picks = focusTasksForDay([later, veryLate, pinned], today, 3)
    expect(picks.map((p) => p.task.id)).toEqual([pinned.id, veryLate.id, later.id])
    expect(picks.map((p) => p.pinned)).toEqual([true, false, false])
  })

  it('keeps a pinned task that is already done, at the end, so progress stays visible', () => {
    const done = task({ focusDate: today, status: 'closed' })
    const open = task({ focusDate: today, due: '2026-08-05' })
    const picks = focusTasksForDay([done, open], today, 3)
    expect(picks.map((p) => p.task.id)).toEqual([open.id, done.id])
  })

  it('sinks a done pin below the live suggestions, never above them', () => {
    const done = task({ focusDate: today, status: 'closed', due: '2026-07-01' })
    const openPin = task({ focusDate: today, due: '2026-09-01' })
    const suggestion = task({ due: '2026-08-02' })
    const picks = focusTasksForDay([done, openPin, suggestion], today, 3)
    expect(picks.map((p) => p.task.id)).toEqual([openPin.id, suggestion.id, done.id])
  })

  it('does not count a done pin against the open slots', () => {
    const done = task({ focusDate: today, status: 'closed' })
    const a = task({ due: '2026-08-01' })
    const b = task({ due: '2026-08-02' })
    const c = task({ due: '2026-08-03' })
    const picks = focusTasksForDay([done, a, b, c], today, 3)
    expect(picks.filter((p) => !p.pinned)).toHaveLength(3)
  })

  it('never suggests beyond the limit once enough is pinned', () => {
    const pins = [task({ focusDate: today }), task({ focusDate: today }), task({ focusDate: today })]
    const picks = focusTasksForDay([...pins, task({ due: '2026-07-01' })], today, 3)
    expect(picks).toHaveLength(3)
    expect(picks.every((p) => p.pinned)).toBe(true)
  })

  it('shows every pin even past the limit — an explicit choice is never hidden', () => {
    const pins = Array.from({ length: 5 }, () => task({ focusDate: today }))
    expect(focusTasksForDay(pins, today, 3)).toHaveLength(5)
  })

  it("ignores yesterday's pins", () => {
    const stale = task({ focusDate: '2026-08-04', due: '2026-09-01' })
    const urgent = task({ due: '2026-08-01' })
    const picks = focusTasksForDay([stale, urgent], today, 3)
    expect(picks[0].task.id).toBe(urgent.id)
    expect(picks.every((p) => !p.pinned)).toBe(true)
  })

  it('is empty when there is nothing open to do', () => {
    expect(focusTasksForDay([task({ status: 'closed' })], today, 3)).toEqual([])
  })
})

describe('priority handling', () => {
  it('treats a missing priority as below Low', () => {
    const none = task({ due: '2026-08-05', priority: null })
    const low = task({ due: '2026-08-05', priority: 'Low' as Priority })
    expect(sortTasks([none, low], 'urgency', today).map((t) => t.id)).toEqual([low.id, none.id])
  })
})
