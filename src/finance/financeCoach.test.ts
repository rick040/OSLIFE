import { describe, it, expect } from 'vitest'
import { effectiveUrgent, buildFinancePlanPrompt, type FinanceCoachInput } from './financeCoach'
import { TODAY } from '../domains'
import type { Payment } from '../types'

function addDays(days: number): string {
  const d = new Date(TODAY + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function payment(overrides: Partial<Payment>): Payment {
  return {
    id: 'p1',
    payee: 'Energieleverancier',
    amount: 50,
    due: addDays(1),
    direction: 'outgoing',
    status: 'open',
    domain: 'personal',
    source: 'manual',
    urgent: null,
    ...overrides,
  }
}

const emptyInput: Omit<FinanceCoachInput, 'payments'> = {
  transactions: [],
  subscriptions: [],
  holdings: [],
  balanceCheckpoints: [],
  budgetCaps: [],
}

describe('effectiveUrgent', () => {
  it('defaults to urgent when overdue or due within 3 days, with no manual override', () => {
    expect(effectiveUrgent(payment({ urgent: null, due: addDays(-1) }))).toBe(true)
    expect(effectiveUrgent(payment({ urgent: null, due: addDays(2) }))).toBe(true)
    expect(effectiveUrgent(payment({ urgent: undefined, due: addDays(10) }))).toBe(false)
    expect(effectiveUrgent(payment({ urgent: null, due: null }))).toBe(false)
  })

  it('a manual override always wins over the date heuristic', () => {
    expect(effectiveUrgent(payment({ urgent: true, due: addDays(30) }))).toBe(true)
    expect(effectiveUrgent(payment({ urgent: false, due: addDays(-5) }))).toBe(false)
  })
})

describe('buildFinancePlanPrompt', () => {
  it('returns null when there are no payments worth planning for', () => {
    const routine = payment({ id: 'p1', due: addDays(60), urgent: false })
    expect(buildFinancePlanPrompt({ ...emptyInput, payments: [routine] })).toBeNull()
  })

  it('includes overdue, urgent-flagged and due-soon payments, each with its real id', () => {
    const overdue = payment({ id: 'p-overdue', payee: 'Verhuurder', due: addDays(-3) })
    const flagged = payment({ id: 'p-flagged', payee: 'KPN', due: addDays(60), urgent: true })
    const dueSoon = payment({ id: 'p-soon', payee: 'Zorgverzekering', due: addDays(10) })
    const routine = payment({ id: 'p-routine', payee: 'Sportschool', due: addDays(60), urgent: false })

    const result = buildFinancePlanPrompt({ ...emptyInput, payments: [overdue, flagged, dueSoon, routine] })
    expect(result).not.toBeNull()
    expect(result!.prompt).toContain('id=p-overdue')
    expect(result!.prompt).toContain('id=p-flagged')
    expect(result!.prompt).toContain('id=p-soon')
    expect(result!.prompt).not.toContain('id=p-routine')
    expect(result!.tool.name).toBe('propose_finance_plan')
  })

  it('excludes paid/closed payments even if their date would otherwise qualify', () => {
    const paid = payment({ id: 'p-paid', due: addDays(-3), status: 'paid' })
    expect(buildFinancePlanPrompt({ ...emptyInput, payments: [paid] })).toBeNull()
  })
})
