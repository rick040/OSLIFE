// Invoice-from-hours math — shared by the store (generateInvoiceFromHours) and
// the ProjectDetail preview so the amount shown and the amount billed can't drift.
import type { HourEntry, Invoice, Project } from '../../types'

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

/**
 * "Nog te factureren" — the CRM/Projecten pipeline number: every non-done
 * project's value minus whatever's already been paid on it, floored at 0 so a
 * fully-paid invoice (even on a project that isn't marked "done") drops out.
 * Single source of truth for the "Pipeline" KPI (Projects.tsx) and the
 * finance "Nog te ontvangen" tile (BillsTab.tsx) — they must not drift.
 */
export function projectPipeline(projects: Project[], invoices: Invoice[]): number {
  return projects
    .filter((p) => p.status !== 'done')
    .reduce((a, p) => {
      const paid = invoices
        .filter((i) => i.projectId === p.id && i.status === 'paid')
        .reduce((sum, i) => sum + i.amount, 0)
      return a + Math.max((p.value ?? 0) - paid, 0)
    }, 0)
}
