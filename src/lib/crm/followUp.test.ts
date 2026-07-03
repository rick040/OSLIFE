import { describe, it, expect } from 'vitest'
import { clientHealth, nextFollowUp } from './followUp'
import type { Client } from '../../types'

// All helpers take an explicit `today` so tests don't depend on the wall clock.
const today = '2026-07-03'
const base: Client = { id: 'c1', name: 'Test', domain: 'prjct', clientStatus: 'Active' }
const c = (patch: Partial<Client>): Client => ({ ...base, ...patch })

describe('clientHealth', () => {
  it('is none when never contacted', () => {
    expect(clientHealth(c({ lastContactedAt: null }), today)).toBe('none')
    expect(clientHealth(c({}), today)).toBe('none')
  })
  it('is green safely inside the cycle', () =>
    expect(clientHealth(c({ lastContactedAt: '2026-07-01', followUpCycleDays: 30 }), today)).toBe('green'))
  it('is green just outside the yellow window (4 days to due)', () =>
    // due 2026-07-07 → 4 days out
    expect(clientHealth(c({ lastContactedAt: '2026-06-07', followUpCycleDays: 30 }), today)).toBe('green'))
  it('is yellow within 3 days of the due date', () =>
    // due 2026-07-06 → 3 days out
    expect(clientHealth(c({ lastContactedAt: '2026-06-06', followUpCycleDays: 30 }), today)).toBe('yellow'))
  it('is yellow on the due date itself', () =>
    // due 2026-07-03 → 0 days out
    expect(clientHealth(c({ lastContactedAt: '2026-06-03', followUpCycleDays: 30 }), today)).toBe('yellow'))
  it('is red past the due date', () =>
    // due 2026-07-01 → overdue
    expect(clientHealth(c({ lastContactedAt: '2026-06-01', followUpCycleDays: 30 }), today)).toBe('red'))
  it('respects a custom shorter cycle', () =>
    // due 2026-06-27 → overdue
    expect(clientHealth(c({ lastContactedAt: '2026-06-20', followUpCycleDays: 7 }), today)).toBe('red'))
  it('defaults to a 30-day cycle when unset', () =>
    expect(clientHealth(c({ lastContactedAt: '2026-07-01' }), today)).toBe('green'))
})

describe('nextFollowUp', () => {
  it('is last contact + cycle', () =>
    expect(nextFollowUp(c({ lastContactedAt: '2026-07-01', followUpCycleDays: 30 }))).toBe('2026-07-31'))
  it('is null when never contacted', () =>
    expect(nextFollowUp(c({ lastContactedAt: null }))).toBeNull())
})
