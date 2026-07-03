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
  const amountMatch = combined.match(/[€$£]?\s*(\d{1,6}[.,]\d{2})/u)
  if (!amountMatch) return null

  const amount = parseFloat(amountMatch[1].replace(',', '.'))

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
  if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
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
  const dedupKey = `${now.slice(0, 16)}|${amount}|${merchant.toLowerCase()}`

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { error } = await supabase.from('finance_tx').upsert(
    {
      user_id: USER_ID,
      dedup_key: dedupKey,
      occurred_on: now.slice(0, 10),      // schema: occurred_on (not 'date')
      paid_at: now,
      amount: -Math.abs(amount),           // spending = negative
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
