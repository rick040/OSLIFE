import { describe, it, expect } from 'vitest'
import { daysUntil, overdueLabel, deadlineInfo, dueLabel } from './dates'

// All helpers take an explicit `today` so tests don't depend on the wall clock.
const today = '2026-07-03'

describe('daysUntil', () => {
  it('is negative for past dates', () => expect(daysUntil('2026-06-30', today)).toBe(-3))
  it('is 0 for today', () => expect(daysUntil('2026-07-03', today)).toBe(0))
  it('is positive for future dates', () => expect(daysUntil('2026-07-10', today)).toBe(7))
  it('is null without a date', () => expect(daysUntil(null, today)).toBeNull())
})

describe('overdueLabel', () => {
  it('renders "Xd te laat"', () => expect(overdueLabel(-3)).toBe('3d te laat'))
})

describe('deadlineInfo (badge style)', () => {
  it('returns null without a date', () => expect(deadlineInfo(null, today)).toBeNull())
  it('flags overdue deadlines', () =>
    expect(deadlineInfo('2026-06-28', today)).toEqual({ label: '5d te laat', color: '#F87171', urgent: true }))
  it('flags today', () =>
    expect(deadlineInfo('2026-07-03', today)).toEqual({ label: 'Vandaag', color: '#FBBF24', urgent: true }))
  it('flags deadlines within a week as "over Xd"', () =>
    expect(deadlineInfo('2026-07-10', today)).toEqual({ label: 'over 7d', color: '#FBBF24', urgent: true }))
  it('shows the short date beyond a week, not urgent', () =>
    expect(deadlineInfo('2026-07-11', today)).toEqual({ label: '11 jul', color: '#a3a3a3', urgent: false }))
})

describe('dueLabel (row style)', () => {
  it('shows "Xd te laat" when overdue', () =>
    expect(dueLabel('2026-07-01', { today })).toEqual({ label: '2d te laat', overdue: true }))
  it('shows the prefixed short date when not overdue', () =>
    expect(dueLabel('2026-07-05', { prefix: 'deadline ', today })).toEqual({ label: 'deadline 5 jul', overdue: false }))
  it('shows the date for today (not overdue)', () =>
    expect(dueLabel('2026-07-03', { today })).toEqual({ label: '3 jul', overdue: false }))
  it('falls back to the none label without a date', () => {
    expect(dueLabel(null, { today })).toEqual({ label: 'geen datum', overdue: false })
    expect(dueLabel(null, { none: '–', today })).toEqual({ label: '–', overdue: false })
  })
  it('keeps the plain date for inactive (done/closed) items even when past due', () =>
    expect(dueLabel('2026-07-01', { prefix: 'deadline ', active: false, today })).toEqual({
      label: 'deadline 1 jul',
      overdue: false,
    }))
})
