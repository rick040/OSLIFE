import { describe, it, expect } from 'vitest'
import { ruleBasedDayPlan, weekDates, dayBounds, PEAK_START, PEAK_END, type PlannerContext } from './planner'
import type { PlanBlock, Habit, Thread, DogReminder, Payment } from '../types'

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS < bE && bS < aE

function ctx(events: PlanBlock[] = [], habits: Habit[] = [], extra: Partial<PlannerContext> = {}): PlannerContext {
  return { events, habits, goals: [], threads: [], patterns: [], ...extra }
}

const habit = (name: string, streak = 0): Habit => ({ id: name, name, streak, doneToday: false, emoji: '✅' })

function calEvent(date: string, start: string, end: string): PlanBlock {
  return { id: `e-${start}`, date, title: 'Afspraak', domain: 'prjct', start, end, rationale: '', kind: 'event', source: 'calendar', locked: true }
}

const thread = (id: string, title: string, due: string | null = null): Thread => ({
  id,
  domain: 'prjct',
  title,
  owedTo: '',
  due,
  status: 'open',
  createdAt: '2026-01-01',
})

const overduePayment = (): Payment => ({
  id: 'p1',
  payee: 'Vendor',
  amount: 100,
  due: '2026-07-01',
  direction: 'outgoing',
  status: 'open',
  domain: 'buurtkaart',
  source: 'manual',
})

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

  it('gives every open habit its own block instead of one lumped routine', () => {
    const plan = ruleBasedDayPlan(WEEKDAY, ctx([], [habit('Mediteren'), habit('Lezen')]))
    const titles = plan.filter((b) => b.kind === 'routine' && b.title !== 'Wandeling met Kyra').map((b) => b.title)
    expect(titles).toEqual(expect.arrayContaining(['✅ Mediteren', '✅ Lezen']))
  })

  it('rotates the focus target across days instead of repeating the same one', () => {
    const threads = [thread('t1', 'Factuur Acme', '2026-07-06'), thread('t2', 'Offerte Bolt', '2026-07-10')]
    const day0 = ruleBasedDayPlan(WEEKDAY, ctx([], [], { threads }), 0)
    const day1 = ruleBasedDayPlan('2026-07-07', ctx([], [], { threads }), 1)
    const focus0 = day0.find((b) => b.kind === 'focus')!.title
    const focus1 = day1.find((b) => b.kind === 'focus')!.title
    expect(focus0).toContain('Factuur Acme')
    expect(focus1).toContain('Offerte Bolt')
    expect(focus0).not.toBe(focus1)
  })

  it('only proposes overdue-payment/mail/client blocks on the nearest day (dateIndex 0)', () => {
    const extra: Partial<PlannerContext> = { overduePayments: [overduePayment()] }
    const today = ruleBasedDayPlan(WEEKDAY, ctx([], [], extra), 0)
    const laterDay = ruleBasedDayPlan('2026-07-07', ctx([], [], extra), 1)
    expect(today.some((b) => b.title.includes('Betalingen'))).toBe(true)
    expect(laterDay.some((b) => b.title.includes('Betalingen'))).toBe(false)
  })

  it('proposes a Kyra block for a reminder due exactly that date', () => {
    const dogReminders: DogReminder[] = [{ id: 'd1', title: 'Vet-afspraak', due: WEEKDAY, kind: 'vet', done: false }]
    const plan = ruleBasedDayPlan(WEEKDAY, ctx([], [], { dogReminders }))
    expect(plan.some((b) => b.title === '🐾 Vet-afspraak')).toBe(true)
  })

  it('always proposes a daily walk even with no dog reminders', () => {
    const plan = ruleBasedDayPlan(WEEKDAY, ctx())
    expect(plan.some((b) => b.title.toLowerCase().includes('wandeling'))).toBe(true)
  })
})

describe('dayBounds', () => {
  it('falls back to the fixed defaults with no sleep data', () => {
    const b = dayBounds(null)
    expect(b.peakStart).toBe(PEAK_START)
    expect(b.peakEnd).toBe(PEAK_END)
    expect(b.dayStart).toBe('06:00')
    expect(b.dayEnd).toBe('23:00')
  })

  it('anchors the day start and focus peak to a real learned wake time', () => {
    const b = dayBounds({ wakeMinutes: toMin('07:30'), bedMinutes: null })
    expect(b.dayStart).toBe('07:30')
    expect(toMin(b.peakStart)).toBe(toMin('07:30') + 120)
  })

  it('anchors the day end to a real learned bedtime', () => {
    const b = dayBounds({ wakeMinutes: null, bedMinutes: toMin('22:15') })
    expect(b.dayEnd).toBe('22:15')
  })

  it('ignores an implausible wake/bed reading and falls back to defaults', () => {
    const b = dayBounds({ wakeMinutes: toMin('03:00'), bedMinutes: toMin('12:00') })
    expect(b.dayStart).toBe('06:00')
    expect(b.dayEnd).toBe('23:00')
  })

  it('plans around a real learned wake/sleep window end to end', () => {
    const plan = ruleBasedDayPlan('2026-07-06', ctx([], [], { sleep: { wakeMinutes: toMin('05:30'), bedMinutes: toMin('21:30') } }))
    for (const b of plan) {
      expect(toMin(b.start)).toBeGreaterThanOrEqual(toMin('05:30'))
      expect(toMin(b.end)).toBeLessThanOrEqual(toMin('21:30'))
    }
    expect(plan.some((b) => b.kind === 'focus' && toMin(b.start) < toMin(PEAK_START))).toBe(true)
  })
})
