// ── HEYRA agent · Vendor categoriser ──────────────────────────────────────────
// Thin wrapper around the `categorize-vendor` Edge Function (Haiku + Anthropic
// web search). Given a merchant it returns the spending category, life-domain,
// a one-line description and a confidence — or `null` on ANY failure (missing
// secret, offline, timeout, unparseable), so the auto-tagger always has a
// rule-based fallback and never blocks or breaks the import.

import { supabase } from '../../lib/supabase'
import { TX_CATEGORIES, CATEGORY_DOMAIN, type TxCategory } from '../../finance/categories'
import type { Domain } from '../../types'

const TIMEOUT_MS = 12000 // web search is slower than a plain completion

export interface VendorVerdict {
  category: TxCategory
  domain: Domain
  info: string
  confidence: number
}

const DOMAINS: Domain[] = ['personal', 'prjct', 'parkingyou', 'buurtkaart']

export async function categorizeVendor(
  vendor: string,
  opts: { description?: string; amount?: number } = {},
): Promise<VendorVerdict | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS))
  const call = supabase.functions
    .invoke('categorize-vendor', {
      body: { vendor, description: opts.description, amount: opts.amount },
    })
    .then(({ data, error }) => {
      if (error || !data || data.error) return null
      const category = (TX_CATEGORIES as readonly string[]).includes(data.category)
        ? (data.category as TxCategory)
        : 'Other'
      const domain = DOMAINS.includes(data.domain as Domain)
        ? (data.domain as Domain)
        : CATEGORY_DOMAIN[category] ?? 'personal'
      const confidence = Number.isFinite(data.confidence) ? Number(data.confidence) : 0.5
      return { category, domain, info: String(data.info ?? ''), confidence }
    })
    .catch(() => null)

  return await Promise.race([call, timeout])
}
