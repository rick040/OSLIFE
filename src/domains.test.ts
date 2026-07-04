import { describe, it, expect } from 'vitest'
import { habitStreak } from './domains'

describe('habitStreak', () => {
  const today = '2026-07-04'

  it('counts consecutive days ending today', () => {
    expect(habitStreak(['2026-07-02', '2026-07-03', '2026-07-04'], today)).toBe(3)
  })

  it('anchors on yesterday when today is not yet ticked', () => {
    expect(habitStreak(['2026-07-02', '2026-07-03'], today)).toBe(2)
  })

  it('resets after a missed day (not a lifetime counter)', () => {
    // A gap on 07-03 means the run ending today is just today.
    expect(habitStreak(['2026-07-01', '2026-07-02', '2026-07-04'], today)).toBe(1)
  })

  it('is 0 when neither today nor yesterday is done', () => {
    expect(habitStreak(['2026-06-30', '2026-07-01'], today)).toBe(0)
  })

  it('handles an empty history', () => {
    expect(habitStreak([], today)).toBe(0)
  })
})
