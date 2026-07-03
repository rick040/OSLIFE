// Canonical euro formatters — the single source of truth for currency rendering.
//
// Policy:
// - `eur`  — ledger/transaction-level amounts (2 decimals, minus sign before €: -€64,20)
// - `eur0` — summary/KPI/goal numbers (0 decimals, rounded, nl-NL sign placement: €-64)
// - `eurK` — abbreviated amounts for dense CRM surfaces (€1.5k above a thousand)

/** Two decimals, sign before the euro symbol: 1234.5 → "€1.234,50", -64.2 → "-€64,20". */
export const eur = (n: number) =>
  `${n < 0 ? '-' : ''}€${Math.abs(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Zero decimals, rounded, nl-NL native sign placement: 1234.5 → "€1.235", -64 → "€-64". */
export const eur0 = (n: number) => `€${n.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}`

/** Abbreviates to €k above a thousand: 1500 → "€1.5k", 2000 → "€2k", 950 → "€950", null → "–". */
export const eurK = (n: number | null | undefined) => {
  if (n == null) return '–'
  if (Math.abs(n) >= 1000) return `€${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return `€${n.toLocaleString('nl-NL')}`
}
