import { describe, it, expect } from 'vitest'
import { buildChartCard } from './cards'
import type { useStore } from '../store'
import type { Transaction, DayLog, HealthDay } from '../types'

type Store = ReturnType<typeof useStore.getState>

// Minimal store double — buildChartCard only reads these fields.
function store(partial: Partial<Store>): Store {
  return { transactions: [], dayLogs: [], healthDays: [], habits: [], threads: [], ...partial } as unknown as Store
}

const tx = (date: string, amount: number): Transaction => ({ id: date + amount, date, amount, merchant: 'x', category: 'Other', domain: 'personal' })
const dayLog = (date: string, energy: number): DayLog => ({ date, sleepHours: 7, energy, mood: 3 })
const healthDay = (date: string, steps: number): HealthDay => ({ date, steps, stepGoal: 10000, sleepHours: 7, restingHR: 60, activeMinutes: 30, energy: 3, mood: 3 })

describe('buildChartCard — comparison ("vergelijk")', () => {
  it('does not add a compare series when the question does not ask for one', () => {
    const chart = buildChartCard('laat mijn uitgaven zien', store({ transactions: [tx('2026-07-01', -10)] }))
    expect(chart.compareLabel).toBeUndefined()
    expect(chart.points.every((p) => p.compareValue === undefined)).toBe(true)
  })

  it('adds a "vorige week" compare series for spend when asked to compare', () => {
    const chart = buildChartCard('vergelijk mijn uitgaven met vorige week', store({ transactions: [tx('2026-07-01', -10)] }))
    expect(chart.compareLabel).toBe('vorige week')
    expect(chart.points).toHaveLength(7)
    expect(chart.points.some((p) => p.compareValue !== undefined)).toBe(true)
  })

  it('skips the compare series for energy when there is less than 2 weeks of history', () => {
    const logs = Array.from({ length: 7 }, (_, i) => dayLog(`2026-07-0${i + 1}`, 3))
    const chart = buildChartCard('vergelijk mijn energie', store({ dayLogs: logs }))
    expect(chart.compareLabel).toBeUndefined()
  })

  it('adds a compare series for steps once there are 2 full weeks of history', () => {
    // 14 consecutive valid calendar dates, June 20 – July 3.
    const dates = [
      '2026-06-20', '2026-06-21', '2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26',
      '2026-06-27', '2026-06-28', '2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02', '2026-07-03',
    ]
    const days = dates.map((d, i) => healthDay(d, 5000 + i * 100))
    const chart = buildChartCard('vergelijk mijn stappen met vorige week', store({ healthDays: days }))
    expect(chart.compareLabel).toBe('vorige week')
    expect(chart.points).toHaveLength(7)
    expect(chart.points[0].compareValue).toBe(5000) // first of the earlier 7-day window
  })

  it('ignores a comparison request for the habit-streak metric (not week-shaped)', () => {
    const chart = buildChartCard('vergelijk mijn gewoontes', store({ habits: [{ id: 'h1', name: 'Lezen', streak: 5, doneToday: true, emoji: '📚' }] }))
    expect(chart.compareLabel).toBeUndefined()
  })
})
