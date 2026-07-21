// ── Running balance, with drift correction ───────────────────────────────────
// The naive calc (opening balance + every transaction ever) drifts once the
// import history predates the real starting balance. A manual balance
// checkpoint (BalanceCheckpoint) pins the *actual* balance Rick sees in his
// banking app at a point in time; from then on the balance is that checkpoint
// plus only the real transactions after it. No checkpoint yet → falls back to
// the legacy calc, so this is backward compatible until the first correction.

import type { Transaction, BalanceCheckpoint } from '../types'
import { isTransfer } from './categories'

export interface BalanceResult {
  balance: number
  /** ISO date of the checkpoint used as baseline, or null when falling back to the legacy calc. */
  asOf: string | null
}

/** Real (non-transfer) transactions — the only ones that count toward balance/income/spend sums. */
export function realTransactions(transactions: Transaction[]): Transaction[] {
  return transactions.filter((t) => !isTransfer(t.category))
}

export function latestCheckpoint(checkpoints: BalanceCheckpoint[]): BalanceCheckpoint | null {
  if (!checkpoints.length) return null
  return [...checkpoints].sort((a, b) => (a.asOf < b.asOf ? 1 : -1))[0]
}

export function computeBalance(
  transactions: Transaction[],
  checkpoints: BalanceCheckpoint[],
  openingBalance: number,
): BalanceResult {
  const real = realTransactions(transactions)
  const checkpoint = latestCheckpoint(checkpoints)
  if (!checkpoint) {
    return { balance: openingBalance + real.reduce((a, t) => a + t.amount, 0), asOf: null }
  }
  const after = real.filter((t) => t.date > checkpoint.asOf)
  return { balance: checkpoint.amount + after.reduce((a, t) => a + t.amount, 0), asOf: checkpoint.asOf }
}

/** Same calc as computeBalance, evaluated as of each of several dates — for a running-balance sparkline. */
export function balanceOnDates(
  transactions: Transaction[],
  checkpoints: BalanceCheckpoint[],
  openingBalance: number,
  dates: string[],
): number[] {
  const real = realTransactions(transactions)
  const sorted = [...checkpoints].sort((a, b) => (a.asOf < b.asOf ? 1 : -1))
  return dates.map((date) => {
    const checkpoint = sorted.find((c) => c.asOf <= date) ?? null
    if (!checkpoint) {
      return openingBalance + real.filter((t) => t.date <= date).reduce((a, t) => a + t.amount, 0)
    }
    const after = real.filter((t) => t.date > checkpoint.asOf && t.date <= date)
    return checkpoint.amount + after.reduce((a, t) => a + t.amount, 0)
  })
}
