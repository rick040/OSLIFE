import { describe, it, expect } from 'vitest'
import { dailyBodyMetrics, deltaOver, fmtDelta, fmtMetric, latestValue, measuredMetrics, seriesFor } from './bodyComposition'
import type { BodyMetric } from '../types'

const EMPTY: Omit<BodyMetric, 'at'> = {
  weightKg: null,
  bodyFatPct: null,
  bmi: null,
  muscleMassKg: null,
  musclePct: null,
  skeletalMuscleKg: null,
  skeletalMusclePct: null,
  fatFreeMassKg: null,
  bodyWaterPct: null,
  boneMassKg: null,
  proteinPct: null,
  subcutaneousFatPct: null,
  visceralFat: null,
  bmrKcal: null,
  metabolicAge: null,
}

const reading = (at: string, fields: Partial<BodyMetric>): BodyMetric => ({ ...EMPTY, at, ...fields })

describe('dailyBodyMetrics', () => {
  it('merges same-day readings, later non-null values winning', () => {
    const days = dailyBodyMetrics([
      reading('2026-10-01T06:00:05Z', { weightKg: 82.4, bodyFatPct: 18.2, bodyWaterPct: 55 }),
      reading('2026-10-01T06:00:00Z', { weightKg: 82.3 }),
      reading('2026-10-01T06:00:09Z', { weightKg: null, musclePct: 41.5 }),
    ])
    expect(days).toHaveLength(1)
    expect(days[0]).toMatchObject({ date: '2026-10-01', weightKg: 82.4, bodyFatPct: 18.2, bodyWaterPct: 55, musclePct: 41.5 })
    expect(days[0].at).toBe('2026-10-01T06:00:09Z')
  })

  it('buckets by Amsterdam date, not UTC', () => {
    // 23:30 UTC on 30 Sep is 01:30 on 1 Oct in Amsterdam (CEST).
    const days = dailyBodyMetrics([reading('2026-09-30T23:30:00Z', { weightKg: 80 })])
    expect(days[0].date).toBe('2026-10-01')
  })

  it('derives muscle % from muscle mass when the scale only reports kg', () => {
    const [d] = dailyBodyMetrics([reading('2026-10-01T06:00:00Z', { weightKg: 80, muscleMassKg: 34, skeletalMuscleKg: 30 })])
    expect(d.musclePct).toBe(42.5)
    expect(d.skeletalMusclePct).toBe(37.5)
  })

  it('keeps a reported muscle % over the derived one', () => {
    const [d] = dailyBodyMetrics([reading('2026-10-01T06:00:00Z', { weightKg: 80, muscleMassKg: 34, musclePct: 40 })])
    expect(d.musclePct).toBe(40)
  })
})

describe('latestValue / deltaOver / seriesFor', () => {
  const days = dailyBodyMetrics([
    reading('2026-08-01T06:00:00Z', { weightKg: 85 }),
    reading('2026-09-01T06:00:00Z', { weightKg: 84, musclePct: 40 }),
    reading('2026-09-20T06:00:00Z', { weightKg: 83 }),
    reading('2026-10-04T06:00:00Z', { weightKg: 82.5, musclePct: 41 }),
  ])

  it('finds the latest non-null value per metric', () => {
    expect(latestValue(days, 'weightKg')).toEqual({ value: 82.5, date: '2026-10-04' })
    expect(latestValue(days, 'bodyWaterPct')).toBeNull()
  })

  it('compares against the last reading at least spanDays old', () => {
    const d = deltaOver(days, 'weightKg', 30)
    expect(d?.sinceDate).toBe('2026-09-01')
    expect(d?.delta).toBeCloseTo(-1.5)
  })

  it('falls back to the oldest reading when history is shorter than the span', () => {
    const d = deltaOver(days, 'musclePct', 90)
    expect(d).toEqual({ delta: 1, sinceDate: '2026-09-01' })
  })

  it('has no delta with a single reading', () => {
    expect(deltaOver(days.slice(0, 1), 'weightKg', 30)).toBeNull()
  })

  it('windows a series to the last N days', () => {
    expect(seriesFor(days, 'weightKg', 30, '2026-10-05').map((p) => p.date)).toEqual(['2026-09-20', '2026-10-04'])
  })

  it('lists only measured metrics', () => {
    expect(measuredMetrics(days)).toEqual(['weightKg', 'musclePct'])
  })
})

describe('formatting', () => {
  it('uses a Dutch decimal comma and per-metric decimals', () => {
    expect(fmtMetric('weightKg', 82.35)).toBe('82,4')
    expect(fmtMetric('bmrKcal', 1834.6)).toBe('1.835')
  })

  it('signs deltas with a typographic minus and shows ±0 for no change', () => {
    expect(fmtDelta('weightKg', -1.25)).toBe('−1,3')
    expect(fmtDelta('weightKg', 0.4)).toBe('+0,4')
    expect(fmtDelta('weightKg', 0.01)).toBe('±0')
  })
})
