import { describe, it, expect } from 'vitest'
import { unbilledBillableHours, sumHours, invoiceAmountFromHours } from './invoicing'
import type { HourEntry } from '../../types'

const h = (patch: Partial<HourEntry>): HourEntry => ({
  id: 'h', projectId: 'p', date: '2026-07-01', hours: 1, note: null, billable: true, billed: false, ...patch,
})

describe('unbilledBillableHours', () => {
  it('keeps only billable, not-yet-billed entries', () => {
    const rows = [
      h({ id: 'a', billable: true, billed: false }),
      h({ id: 'b', billable: false, billed: false }), // not billable
      h({ id: 'c', billable: true, billed: true }),   // already billed
    ]
    expect(unbilledBillableHours(rows).map((r) => r.id)).toEqual(['a'])
  })
})

describe('invoiceAmountFromHours', () => {
  it('sums hours × rate', () => {
    const rows = [h({ hours: 2.5 }), h({ hours: 1.25 })] // 3.75h
    expect(sumHours(rows)).toBe(3.75)
    expect(invoiceAmountFromHours(rows, 80)).toBe(300)
  })
  it('rounds to whole cents', () =>
    expect(invoiceAmountFromHours([h({ hours: 3 })], 33.5)).toBe(100.5))
  it('is 0 with no hours', () =>
    expect(invoiceAmountFromHours([], 80)).toBe(0))
})
