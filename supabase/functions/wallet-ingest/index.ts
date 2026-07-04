/**
 * Supabase Edge Function: wallet-ingest
 * --------------------------------------
 * Receives POST from MacroDroid on Android when Google Wallet sends a payment notification.
 * Parses the notification text, categorizes the merchant, and upserts to `finance_tx`.
 *
 * MacroDroid setup (on Samsung phone):
 *   Trigger:  Notification received → App: "Google Wallet" (com.google.android.apps.walletnfcrel)
 *   Action:   HTTP Request → POST → https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/wallet-ingest
 *   Headers:  Content-Type: application/json
 *             x-webhook-secret: <your WALLET_WEBHOOK_SECRET>
 *   Body:     {"title": "[notification_title]", "text": "[notification_text]", "app": "Google Wallet"}
 *   (Use MacroDroid's magic text variables: {notification_title}, {notification_text})
 *
 * Deploy:
 *   supabase functions deploy wallet-ingest --project-ref nhyunnnmdcmojvkxrbpl
 *   supabase secrets set WALLET_WEBHOOK_SECRET=<random string> OSLIFE_USER_ID=<uuid> --project-ref nhyunnnmdcmojvkxrbpl
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SUPABASE_SERVICE_KEY, SUPABASE_URL, USER_ID, jsonResponder } from '../_shared/http.ts'
import { amsterdamToday } from '../_shared/dates.ts'

/** Parse a Dutch/EN money string; the LAST separator is the decimal point,
 *  everything before it is thousands grouping ("1.234,50" → 1234.5). */
function parseMoney(s: string): number {
  const lastSep = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'))
  if (lastSep === -1) return parseFloat(s)
  const intPart = s.slice(0, lastSep).replace(/[.,\s]/g, '')
  const decPart = s.slice(lastSep + 1)
  return parseFloat(`${intPart}.${decPart}`)
}

const WEBHOOK_SECRET = Deno.env.get('WALLET_WEBHOOK_SECRET') ?? ''

const json = jsonResponder()

// Known merchant → category mappings. Values match the canonical TX_CATEGORIES
// casing (src/finance/categories.ts) and mirror the CSV guesser's decisions for
// the same merchants (src/finance/csvImport.ts guessCategory) so wallet rows land
// on the exact taxonomy the frontend maps by (CATEGORY_DOMAIN).
const CATEGORY_MAP: Record<string, string> = {
  'albert heijn': 'Groceries',
  'jumbo': 'Groceries',
  'lidl': 'Groceries',
  'ah': 'Groceries',
  'dirk': 'Groceries',
  'thuisbezorgd': 'Takeout',
  'uber eats': 'Takeout',
  'mcdonalds': 'Takeout',
  'dominos': 'Takeout',
  'shell': 'Convenience',
  'esso': 'Convenience',
  'bp': 'Convenience',
  'q8': 'Convenience',
  'spotify': 'Subscriptions',
  'netflix': 'Subscriptions',
  'google': 'Software',
  'apple': 'Software',
  'adobe': 'Software',
}

function inferCategory(merchant: string): string {
  const m = merchant.toLowerCase()
  for (const [key, cat] of Object.entries(CATEGORY_MAP)) {
    if (m.includes(key)) return cat
  }
  return 'Other'
}

function inferDomain(merchant: string): string {
  const m = merchant.toLowerCase()
  if (/parking|strijp|signage/.test(m)) return 'parkingyou'
  if (/prjct|buurtkaart/.test(m)) return 'prjct'
  return 'personal'
}

/**
 * Parse Google Wallet notification text.
 * Examples:
 *   "€12,50 betaald bij Albert Heijn"
 *   "Betaling van €8,99 bij Spotify"
 *   "Je hebt €45,00 betaald bij Shell"
 *   "Payment of €23.50 at Starbucks"
 */
function parseNotification(title: string, text: string): { amount: number; merchant: string } | null {
  const combined = `${title} ${text}`
  // Handle grouped thousands ("€1.234,50") — the old \d{1,6}[.,]\d{2} matched only
  // "1.23" of that and stored 1.23 instead of 1234.50.
  const amountMatch = combined.match(/[€$£]?\s*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})/u)
  if (!amountMatch) return null

  const amount = parseMoney(amountMatch[1])

  // Extract merchant: everything after "bij", "at", "@", "van" keywords
  const merchantMatch = combined.match(/(?:bij|at|@|from|van)\s+([A-Za-zÀ-ÿ0-9\s&'.,-]{2,40}?)(?:\s*$|\s*\.|,)/i)
  const merchant = merchantMatch
    ? merchantMatch[1].trim()
    : text.replace(/[€$£\d.,]/g, '').replace(/betaald|payment|paid|bij|at/gi, '').trim().slice(0, 50) || 'Unknown'

  return { amount, merchant }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // Validate shared secret
  const secret = req.headers.get('x-webhook-secret') ?? ''
  // Fail CLOSED: an unset secret must NOT leave this service-role endpoint open.
  if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  let body: { title?: string; text?: string; app?: string }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const { title = '', text = '' } = body
  const parsed = parseNotification(title, text)

  if (!parsed) {
    // Not a payment notification (e.g. loyalty card scan) — ignore silently
    return json({ ok: true, skipped: true })
  }

  const { amount, merchant } = parsed
  const now = new Date().toISOString()
  const occurredOn = amsterdamToday()       // Amsterdam calendar day, not UTC
  const storedAmount = -Math.abs(amount)    // spending = negative
  // Shared cross-source dedup contract `${occurred_on}|${amount.toFixed(2)}` — the
  // exact key the ABN CSV import and Betalingen sheet use, so the same purchase
  // arriving from Wallet AND a later CSV/sheet import collapses to one row.
  const dedupKey = `${occurredOn}|${storedAmount.toFixed(2)}`

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { error } = await supabase.from('finance_tx').upsert(
    {
      user_id: USER_ID,
      dedup_key: dedupKey,
      occurred_on: occurredOn,             // schema: occurred_on (not 'date')
      paid_at: now,
      amount: storedAmount,
      counterparty: merchant,              // schema: counterparty (not 'merchant')
      description: `${title} | ${text}`.slice(0, 200),
      category: inferCategory(merchant),
      domain: inferDomain(merchant),
      source: 'google_wallet',
      payment_method: 'contactless',
    },
    { onConflict: 'user_id,dedup_key' },
  )

  if (error) {
    console.error('Upsert error:', error)
    return json({ ok: false, error: error.message }, 500)
  }

  return json({ ok: true, merchant, amount })
})
