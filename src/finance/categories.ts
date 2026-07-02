// ── Finance · spending taxonomy ───────────────────────────────────────────────
// One source of truth for transaction categories, the life-domain each maps to,
// and the merchant-normalisation used as the vendor-cache key. Shared by the
// rule-based CSV guesser (Money.tsx), the auto-tagger (store) and the
// categorize-vendor edge function so they never drift apart.

import type { Domain } from '../types'

export const TX_CATEGORIES = [
  'Groceries', 'Takeout', 'Convenience', 'Transport', 'Dog', 'Health',
  'Subscriptions', 'Software', 'Gear', 'Utilities', 'Housing', 'Shopping',
  'Entertainment', 'Cash', 'Fees', 'Taxes', 'Client income', 'Stock media', 'Other',
] as const

export type TxCategory = (typeof TX_CATEGORIES)[number]

/** Default life-domain for each category (a manual edit can still override it). */
export const CATEGORY_DOMAIN: Record<string, Domain> = {
  Groceries: 'personal',
  Takeout: 'personal',
  Convenience: 'personal',
  Transport: 'personal',
  Dog: 'personal',
  Health: 'personal',
  Subscriptions: 'personal',
  Utilities: 'personal',
  Housing: 'personal',
  Shopping: 'personal',
  Entertainment: 'personal',
  Cash: 'personal',
  Fees: 'personal',
  Taxes: 'personal',
  Software: 'prjct',
  Gear: 'prjct',
  'Client income': 'prjct',
  'Stock media': 'parkingyou',
  Other: 'personal',
}

/** Best-guess domain for a category + amount (income always leans business). */
export function domainForCategory(category: string, amount: number): Domain {
  if (CATEGORY_DOMAIN[category]) return CATEGORY_DOMAIN[category]
  return amount > 0 ? 'prjct' : 'personal'
}

/** The "not yet meaningfully categorised" set — what the auto-tagger targets. */
const UNTAGGED = new Set(['', 'other', 'uncategorized', 'uncategorised', 'onbekend'])

export function isUntagged(category: string | null | undefined): boolean {
  return UNTAGGED.has((category ?? '').trim().toLowerCase())
}

/**
 * Normalised merchant → the vendor-cache key. Strips card/terminal noise, casing,
 * punctuation, city suffixes and trailing numbers so "Albert Heijn 1234 EINDHOVEN",
 * "ALBERT HEIJN" and "Albert Heijn BV" all collapse to the same key.
 */
export function vendorKey(merchant: string): string {
  let s = (merchant || '').toLowerCase()
  // drop common Dutch bank/legal noise tokens
  s = s.replace(/\b(bea|gea|betaalpas|apple pay|google pay|ideal|sepa|incasso|pas\d+|nr\s*\d+)\b/g, ' ')
  s = s.replace(/\b(b\.?v\.?|n\.?v\.?|v\.?o\.?f\.?|ltd|inc|gmbh)\b/g, ' ')
  // strip anything that isn't a letter/number/space, then collapse
  s = s.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  // drop a trailing run of digits (store/terminal number) and lone city tails are
  // left in — the first 3 tokens carry the brand and keep it distinct enough.
  s = s.replace(/\s+\d{2,}$/g, '').trim()
  return s.split(' ').slice(0, 3).join(' ')
}
