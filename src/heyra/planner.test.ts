import { describe, it, expect } from 'vitest'
import { ruleBasedDayPlan, weekDates, PEAK_START, PEAK_END, type PlannerContext } from './planner'
import type { PlanBlock, Habit } from '../types'

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS < bE && bS < aE

function ctx(events: PlanBlock[] = [], habits: Habit[] = []): PlannerContext {
  return { events, habits, goals: [], threads: [], patterns: [] }
}

const habit = (name: string): Habit => ({ id: name, name, streak: 0, doneToday: false, emoji: '✅' })

function calEvent(date: string, start: string, end: string): PlanBlock {
  return { id: `e-${start}`, date, title: 'Afspraak', domain: 'prjct', start, end, rationale: '', kind: 'event', source: 'calendar', locked: true }
}

describe('weekDates', () => {
  it('runs from the given day through the coming Sunday inclusive', () => {
    const w = weekDates('2026-07-06') // Monday
    expect(w[0]).toBe('2026-07-06')
    expect(w).toHaveLength(7)
    expect(w[w.length - 1]).toBe('2026-07-12') // Sunday
    expect(new Date(w[w.length - 1] + 'T00:00:00').getDay()).toBe(0)
  })

  it('returns just today when today is Sunday', () => {
    const w = weekDates('2026-07-05') // Sunday
    expect(w).toEqual(['2026-07-05'])
  })

  it('returns consecutive dates', () => {
    const w = weekDates('2026-07-08') // Wednesday
    for (let i = 1; i < w.length; i++) {
      const prev = new Date(w[i - 1] + 'T00:00:00')
      const cur = new Date(w[i] + 'T00:00:00')
      expect(cur.getTime() - prev.getTime()).toBe(86400000)
    }
  })
})

describe('ruleBasedDayPlan', () => {
  const WEEKDAY = '2026-07-06' // Monday

  it('produces non-overlapping blocks that never collide with fixed events', () => {
    const events = [calEvent(WEEKDAY, PEAK_START, PEAK_END)] // busy across the whole focus peak
    const plan = ruleBasedDayPlan(WEEKDAY, ctx(events, [habit('Sporten')]))

    // nothing proposed overlaps the fixed calendar event
    for (const b of plan) {
      expect(overlaps(toMin(b.start), toMin(b.end), toMin(PEAK_START), toMin(PEAK_END))).toBe(false)
    }
    // proposed blocks don't overlap each other
    const sorted = [...plan].sort((a, b) => a.start.localeCompare(b.start))
    for (let i = 1; i < sorted.length; i++) {
      expect(toMin(sorted[i].start)).toBeGreaterThanOrEqual(toMin(sorted[i - 1].end))
    }
  })

  it('plans a focus block inside the energy peak when it is free', () => {
    const plan = ruleBasedDayPlan(WEEKDAY, ctx([], [habit('Lezen')]))
    const focusInPeak = plan.find(
      (b) => b.kind === 'focus' && b.start >= PEAK_START && b.start < PEAK_END,
    )
    expect(focusInPeak).toBeTruthy()
  })

  it('all proposed blocks are unlocked and non-calendar', () => {
    const plan = ruleBasedDayPlan(WEEKDAY, ctx())
    expect(plan.length).toBeGreaterThan(0)
    for (const b of plan) {
      expect(b.locked).toBe(false)
      expect(b.source).toBe('rule')
      expect(b.date).toBe(WEEKDAY)
    }
  })

  it('gives a lighter plan on weekends (no deep-work focus blocks)', () => {
    const plan = ruleBasedDayPlan('2026-07-05', ctx([], [habit('Wandelen')])) // Sunday
    expect(plan.some((b) => b.kind === 'focus')).toBe(false)
  })
})
