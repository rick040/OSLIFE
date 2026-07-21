// ── Monthly income/expense stats, shared by the Overview tab and the coach ──
import type { Transaction } from '../types'
import { realTransactions } from './balance'

export function prevMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(y, m - 2, 1) // m is 1-indexed; -2 lands on the previous month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export interface MonthStats {
  earned: number
  spent: number // positive number
  byCategory: { cat: string; v: number }[]
}

export function monthStats(transactions: Transaction[], monthKey: string): MonthStats {
  const tx = realTransactions(transactions).filter((t) => t.date.slice(0, 7) === monthKey)
  const earned = tx.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0)
  const spent = -tx.filter((t) => t.amount < 0).reduce((a, t) => a + t.amount, 0)
  const byCat = new Map<string, number>()
  tx.forEach((t) => {
    if (t.amount < 0) byCat.set(t.category, (byCat.get(t.category) ?? 0) + Math.abs(t.amount))
  })
  const byCategory = [...byCat.entries()].map(([cat, v]) => ({ cat, v: Math.round(v) })).sort((a, b) => b.v - a.v)
  return { earned, spent, byCategory }
}
