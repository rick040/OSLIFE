/**
 * Supabase Edge Function: wallet-ingest
 * --------------------------------------
 * Receives POST from MacroDroid on Android for ANY payment-notification source —
 * Google Wallet, or a banking app (ABN AMRO, ING, …) — and upserts to `finance_tx`
 * in real time. Two ways to feed it, mixable per-macro:
 *
 *   1. Raw notification (original Wallet flow) — send {title, text, app} and let
 *      this function parse the amount + merchant out of the notification text.
 *   2. Structured fields — if MacroDroid already extracted values (e.g. via a
 *      regex/local-variable macro that used to fill the "Betalingen" sheet),
 *      send them directly: {amount, merchant, domain|account_type, payment_method,
 *      category, date}. Any structured field takes priority over the raw parse;
 *      you can mix (e.g. send amount+merchant but let category be inferred).
 *
 * This replaces the Betalingen-sheet → Apps Script (30 min) → payments-sheet-ingest
 * path for macros that can POST directly: same MacroDroid trigger, just change the
 * action from "add Sheet row" to "HTTP Request", and data lands instantly instead
 * of up to 30 minutes later. See integrations/macrodroid/bank-notifications.md.
 *
 * MacroDroid setup — Google Wallet (unchanged):
 *   Trigger:  Notification received → App: "Google Wallet" (com.google.android.apps.walletnfcrel)
 *   Action:   HTTP Request → POST → https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/wallet-ingest
 *   Headers:  Content-Type: application/json
 *             x-webhook-secret: <your WALLET_WEBHOOK_SECRET>
 *   Body:     {"title": "[notification_title]", "text": "[notification_text]", "app": "Google Wallet"}
 *   (Use MacroDroid's magic text variables: {notification_title}, {notification_text})
 *
 * MacroDroid setup — bank app (structured, see the doc above for the full macro):
 *   Body:     {"app": "ABN AMRO", "amount": [lv=amount], "merchant": "[lv=merchant]",
 *              "account_type": "Zakelijk", "title": "[notification_title]", "text": "[notification_text]"}
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

// Sentinel merchant for real-time notifications that carry no merchant name —
// e.g. ABN AMRO's generic "Er is een bedrag afgeschreven" alert, which only
// gives an amount + account number. insertFinanceTx (the ABN CSV import, in
// src/lib/supabase.ts) looks for this EXACT string to enrich the row with the
// real merchant later instead of being dedup-blocked by this placeholder.
// Keep the two in sync if you change it.
const PENDING_MERCHANT = 'Onbekend (bank-melding)'

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

// Counterparties known to be the user's own accounts — money moving between
// wallets, not real income/spend. MUST match isTransferCounterparty() in
// src/finance/categories.ts.
const TRANSFER_COUNTERPARTIES = [/r\.?\s*van\s*mierlo/i, /prjct agency/i]

function inferCategory(merchant: string): string {
  if (TRANSFER_COUNTERPARTIES.some((re) => re.test(merchant))) return 'Internal transfer'
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

/** Explicit domain/account-type label → app domain. Mirrors payDomain_() in
 *  integrations/apps-script/payments-sheet.gs so the two paths agree. */
function mapAccountType(label: string): string {
  const s = label.toLowerCase()
  if (/zakelijk|business|prjct|zaak/.test(s)) return 'prjct'
  if (/parking|strijp/.test(s)) return 'parkingyou'
  if (/buurtkaart|geldrop/.test(s)) return 'buurtkaart'
  if (/persoonlijk|priv[ée]|personal/.test(s)) return 'personal'
  return ''
}

/** "ABN AMRO" / "Google Wallet" → "abn_amro" / "google_wallet" for the `source` column. */
function normalizeSource(app: string): string {
  const s = app.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return s || 'google_wallet'
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

  // Extract merchant: everything after "bij", "at", "@", "van" keywords.
  // Some bank alerts (e.g. ABN AMRO's generic debit notification) report only
  // the amount, no merchant — PENDING_MERCHANT flags the row instead of
  // storing whatever garbled fragment a blind text-strip would produce.
  const merchantMatch = combined.match(/(?:bij|at|@|from|van)\s+([A-Za-zÀ-ÿ0-9\s&'.,-]{2,40}?)(?:\s*$|\s*\.|,)/i)
  const merchant = merchantMatch ? merchantMatch[1].trim() : PENDING_MERCHANT

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

  let body: {
    title?: string; text?: string; app?: string
    amount?: number; merchant?: string
    domain?: string; account_type?: string
    payment_method?: string; category?: string; date?: string
  }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const { title = '', text = '' } = body

  // Structured fields (from a MacroDroid macro that already extracted values)
  // win; otherwise fall back to parsing the raw notification text.
  let amount: number, merchant: string
  if (Number.isFinite(body.amount)) {
    amount = Math.abs(body.amount as number)
    merchant = (body.merchant ?? '').trim() || PENDING_MERCHANT
  } else {
    const parsed = parseNotification(title, text)
    if (!parsed) {
      // Not a payment notification (e.g. loyalty card scan) — ignore silently
      return json({ ok: true, skipped: true })
    }
    amount = parsed.amount
    merchant = parsed.merchant
  }

  const now = new Date().toISOString()
  // Amsterdam calendar day, not UTC — overridable when the macro supplies its own date.
  const occurredOn = body.date?.trim() || amsterdamToday()
  const storedAmount = -Math.abs(amount)    // spending = negative
  // Shared cross-source dedup contract `${occurred_on}|${amount.toFixed(2)}` — the
  // exact key the ABN CSV import and Betalingen sheet use, so the same purchase
  // arriving from Wallet/bank AND a later CSV/sheet import collapses to one row.
  const dedupKey = `${occurredOn}|${storedAmount.toFixed(2)}`

  const domain = mapAccountType(body.domain ?? body.account_type ?? '') || inferDomain(merchant)

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
      category: body.category?.trim() || inferCategory(merchant),
      domain,
      source: normalizeSource(body.app ?? ''),
      payment_method: body.payment_method?.trim() || 'contactless',
    },
    { onConflict: 'user_id,dedup_key' },
  )

  if (error) {
    console.error('Upsert error:', error)
    return json({ ok: false, error: error.message }, 500)
  }

  return json({ ok: true, merchant, amount })
})
