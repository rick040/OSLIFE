import { describe, it, expect } from 'vitest'
import { tasksForDate } from './schedule'
import { logKey, isDayComplete, totalPoints, currentStreak, levelFor } from './gamify'

// 2026-07-13 is a Monday → the bathroom zone (baseline + 6 tasks = 9 total).
const monday = '2026-07-13'

function completeDay(iso: string) {
  const log: Record<string, boolean> = {}
  for (const t of tasksForDate(iso)) log[logKey(iso, t.key)] = true
  return log
}

describe('isDayComplete', () => {
  it('is false with an empty log', () => expect(isDayComplete({}, monday)).toBe(false))
  it('is false with only some tasks done', () => {
    const tasks = tasksForDate(monday)
    const log = { [logKey(monday, tasks[0].key)]: true }
    expect(isDayComplete(log, monday)).toBe(false)
  })
  it('is true once every task for that date is checked off', () => {
    expect(isDayComplete(completeDay(monday), monday)).toBe(true)
  })
})

describe('totalPoints', () => {
  it('is 0 for an empty log', () => expect(totalPoints({})).toBe(0))
  it('is 10 per completed task, plus a 40 zone-clear bonus once the day is full', () => {
    const tasks = tasksForDate(monday)
    expect(totalPoints(completeDay(monday))).toBe(tasks.length * 10 + 40)
  })
  it('ignores toggled-back-off (false) entries', () => {
    const log = { [logKey(monday, 'mon-clear')]: false }
    expect(totalPoints(log)).toBe(0)
  })
})

describe('currentStreak', () => {
  it('is 0 with no completed days', () => expect(currentStreak({}, monday)).toBe(0))
  it('counts back-to-back fully-cleared days ending today', () => {
    const sunday = '2026-07-12' // day before, inventory zone
    const log = { ...completeDay(sunday), ...completeDay(monday) }
    expect(currentStreak(log, monday)).toBe(2)
  })
  it('anchors on yesterday when today is not finished yet, without zeroing the run', () => {
    const sunday = '2026-07-12'
    expect(currentStreak(completeDay(sunday), monday)).toBe(1)
  })
  it('resets after a missed day', () => {
    const saturday = '2026-07-11'
    // Sunday (the day between) is left incomplete.
    const log = { ...completeDay(saturday), ...completeDay(monday) }
    expect(currentStreak(log, monday)).toBe(1)
  })
})

describe('levelFor', () => {
  it('starts at the base level with a next target', () => {
    const info = levelFor(0)
    expect(info.level.name).toBe('Front Desk Trainee')
    expect(info.next?.name).toBe('Housekeeping Pro')
    expect(info.progress).toBe(0)
  })
  it('promotes once points clear a threshold', () => {
    expect(levelFor(200).level.name).toBe('Housekeeping Pro')
  })
  it('caps progress at 1 for the top level', () => {
    const info = levelFor(10_000)
    expect(info.next).toBeNull()
    expect(info.progress).toBe(1)
  })
})
