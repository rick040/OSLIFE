// ── Finance · spending taxonomy ───────────────────────────────────────────────
// One source of truth for transaction categories, the life-domain each maps to,
// and the merchant-normalisation used as the vendor-cache key. Shared by the
// rule-based CSV guesser (Money.tsx), the auto-tagger (store) and the
// categorize-vendor edge function so they never drift apart.

import type { Domain } from '../types'

export const TX_CATEGORIES = [
  'Groceries', 'Takeout', 'Convenience', 'Transport', 'Dog', 'Health',
  'Subscriptions', 'Software', 'Gear', 'Utilities', 'Housing', 'Shopping',
  'Entertainment', 'Cash', 'Fees', 'Taxes', 'Salary', 'Client income', 'Stock media', 'Other',
  'Internal transfer',
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
  // Default for 'Salary' — the Belastingdienst case (tax refund / toeslag).
  // ParkingYou salary overrides to the 'parkingyou' domain explicitly, since
  // one category can't map to two domains here — see guessDomain() in
  // csvImport.ts, the only place that actually assigns a Salary transaction's
  // domain.
  Salary: 'personal',
  Software: 'prjct',
  Gear: 'prjct',
  'Client income': 'prjct',
  'Stock media': 'parkingyou',
  Other: 'personal',
  'Internal transfer': 'personal',
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

/** Money moving between the user's own accounts — excluded from every
 *  income/spend total (balance, monthly sums, category charts, HEYRA
 *  insights), but still visible in the transaction list. */
const TRANSFER = new Set(['internal transfer'])

export function isTransfer(category: string | null | undefined): boolean {
  return TRANSFER.has((category ?? '').trim().toLowerCase())
}

/** Counterparties known to be the user's own accounts, matched by the
 *  initial-form name ABN's own transfer confirmations use ("R VAN MIERLO",
 *  "R.J. van Mierlo") plus the generic Dutch bank wording for a same-owner
 *  transfer ("eigen rekening", "naar uzelf"). Deliberately NOT a bare
 *  "van mierlo" match — Rick's KNAB business account sends real client
 *  income under his full name ("Rick van Mierlo"), which must NOT be
 *  swept into Internal transfer just because it shares his surname. The
 *  "R " initial prefix is what's actually different between the two in
 *  practice (confirmed against real transaction data): ABN-to-ABN transfers
 *  render as "R VAN MIERLO", KNAB income as "Rick van Mierlo". IBAN-based
 *  isTransferIban() below is the precise, name-independent signal — prefer
 *  extending that over loosening this regex. Used to auto-tag new
 *  transactions as 'Internal transfer' at ingest/import time.
 *  MUST match TRANSFER_COUNTERPARTIES in supabase/functions/wallet-ingest/index.ts. */
const TRANSFER_COUNTERPARTIES = [
  /\br\.?\s*van\s*mierlo\b/i,
  /prjct agency/i,
  /eigen\s*rekening/i,
  /naar\s*(mijzelf|uzelf|jezelf)/i,
  /tussen\s*(mijn\s*)?(eigen\s*)?rekening/i,
]

export function isTransferCounterparty(name: string | null | undefined): boolean {
  const s = (name ?? '').trim()
  return s !== '' && TRANSFER_COUNTERPARTIES.some((re) => re.test(s))
}

/**
 * Rick's own ABN AMRO accounts — a transfer to/from either one is money moving
 * between his own pockets, not income or spend. Confirmed by Rick directly:
 *   NL36 ABNA 0574 8561 53  = lopende rekening (checking)
 *   NL62 ABNA 0468 0641 17  = spaarrekening (savings)
 * Deliberately does NOT include his KNAB business account (NL62 KNAB 0606 8007
 * 19) — money from that account to the checking account is real client income,
 * not a transfer, per Rick.
 * MUST match TRANSFER_IBANS in supabase/functions/wallet-ingest/index.ts.
 */
const TRANSFER_IBANS = new Set(['NL36ABNA0574856153', 'NL62ABNA0468064117'])

// Dutch IBAN, tolerant of the space-grouped display form ("NL36 ABNA 0574
// 8561 53") as well as the unspaced form embedded in SEPA description tags
// ("/IBAN/NL36ABNA0574856153/").
const IBAN_PATTERN = /\bNL\d{2}\s?[A-Z]{4}\s?\d{4}\s?\d{4}\s?\d{2}\b/gi

function extractIbans(text: string): string[] {
  return (text.match(IBAN_PATTERN) ?? []).map((s) => s.replace(/\s+/g, '').toUpperCase())
}

/** True if any IBAN embedded in the given text (description, "Naam
 *  tegenpartij" column, notification body, ...) is one of Rick's own
 *  transfer accounts — see TRANSFER_IBANS above. */
export function isTransferIban(text: string | null | undefined): boolean {
  return extractIbans(text ?? '').some((iban) => TRANSFER_IBANS.has(iban))
}

/**
 * Normalised merchant → the vendor-cache key. Strips card/terminal noise, casing,
 * punctuation and store/terminal numbers so "Albert Heijn 1234 EINDHOVEN",
 * "ALBERT HEIJN 5678" and "Albert Heijn BV" collapse to the same "albert heijn"
 * key. City tails are left in (so distinct cities stay distinct); the first 3
 * tokens carry the brand.
 */
export function vendorKey(merchant: string): string {
  let s = (merchant || '').toLowerCase()
  // drop common Dutch bank/legal noise tokens
  s = s.replace(/\b(bea|gea|betaalpas|apple pay|google pay|ideal|sepa|incasso|pas\d+|nr\s*\d+)\b/g, ' ')
  s = s.replace(/\b(b\.?v\.?|n\.?v\.?|v\.?o\.?f\.?|ltd|inc|gmbh)\b/g, ' ')
  // strip anything that isn't a letter/number/space, then collapse
  s = s.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  // drop any standalone run of digits (store/terminal number) wherever it sits —
  // mid-string numbers used to survive into the key ("albert heijn 1234"), which
  // defeated the cache for exactly the terminal-numbered descriptions it targets.
  s = s.replace(/\b\d{2,}\b/g, ' ').replace(/\s+/g, ' ').trim()
  return s.split(' ').slice(0, 3).join(' ')
}
