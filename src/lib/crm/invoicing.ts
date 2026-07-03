// Invoice-from-hours math — shared by the store (generateInvoiceFromHours) and
// the ProjectDetail preview so the amount shown and the amount billed can't drift.
import type { HourEntry } from '../../types'

/** Hours eligible to invoice: billable and not yet billed. */
export function unbilledBillableHours(hours: HourEntry[]): HourEntry[] {
  return hours.filter((h) => h.billable && !h.billed)
}

/** Sum of the given hour entries' hours. */
export function sumHours(hours: HourEntry[]): number {
  return hours.reduce((a, h) => a + h.hours, 0)
}

/** Invoice amount for a set of hour entries at a rate, rounded to whole cents. */
export function invoiceAmountFromHours(hours: HourEntry[], rate: number): number {
  return Math.round(sumHours(hours) * rate * 100) / 100
}
