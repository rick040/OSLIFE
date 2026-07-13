/**
 * Supabase Edge Function: weight-ingest
 * ---------------------------------------
 * Receives POST from MacroDroid on Android when a smart-scale app (e.g. Smart
 * Life) posts a notification after a weigh-in, and upserts into
 * `health_body_metrics`. EXPERIMENTAL: unlike wallet-ingest/phone-events-ingest,
 * the exact notification wording of your scale app hasn't been verified against
 * a real device — the regex below is deliberately generic (any "NN,N kg" /
 * "NN.N kg" pattern, optionally with a "NN,N %" body-fat reading). If your
 * app's notification doesn't match, test the macro (MacroDroid → macro → ⋮ →
 * "Test acties") and check `supabase functions logs weight-ingest` — the raw
 * title/text is echoed back in the `{"ok":false,"error":"No weight found",...}`
 * response so you can tune the regex.
 *
 * This does NOT replace the Health-sheet weight import (health-sheets-ingest) —
 * it's an additional, faster path. Both write to the same table; because a
 * notification-derived reading and the later Samsung-Health sync rarely share
 * the exact same `datetime`, you may see two rows for one real weigh-in
 * (harmless — same value, no crash, just a duplicate point on the chart).
 *
 * MacroDroid setup (on Samsung phone):
 *   Trigger:  Notification received → App: "Smart Life" (com.tuya.smartlife or similar)
 *   Action:   HTTP Request → POST → https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/weight-ingest
 *   Headers:  Content-Type: application/json
 *             x-webhook-secret: <your PHONE_WEBHOOK_SECRET — same one phone-events-ingest uses>
 *   Body:     {"title": "[notification_title]", "text": "[notification_text]"}
 *
 * Structured alternative (if MacroDroid already extracted the number via a
 * local variable / regex action): {"weight_kg": 82.3, "body_fat_pct": 23.4}
 *
 * Deploy:
 *   supabase functions deploy weight-ingest --project-ref nhyunnnmdcmojvkxrbpl
 *   (reuses PHONE_WEBHOOK_SECRET + OSLIFE_USER_ID — no new secret needed; set
 *   WEIGHT_WEBHOOK_SECRET only if you want a secret dedicated to this function)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SUPABASE_SERVICE_KEY, SUPABASE_URL, USER_ID, jsonResponder } from '../_shared/http.ts'

// Reuse the Phone-events secret by default — same phone/MacroDroid instance,
// no reason to invent a third secret. WEIGHT_WEBHOOK_SECRET can still override.
const WEBHOOK_SECRET =
  Deno.env.get('WEIGHT_WEBHOOK_SECRET') ?? Deno.env.get('PHONE_WEBHOOK_SECRET') ?? Deno.env.get('WALLET_WEBHOOK_SECRET') ?? ''

const json = jsonResponder()

/** "82,3" / "82.3" → 82.3 (single decimal separator, no thousands grouping expected for a body weight). */
function parseDecimal(s: string): number {
  return parseFloat(s.replace(',', '.'))
}

/** Pull a plausible body weight (kg) out of free-form notification text. Requires
 *  a "kg" unit or a "gewicht"/"weight" label nearby to avoid matching unrelated numbers. */
function parseWeight(combined: string): number | null {
  const withUnit = combined.match(/(\d{2,3}(?:[.,]\d{1,2})?)\s*kg\b/i)
  if (withUnit) return parseDecimal(withUnit[1])
  const withLabel = combined.match(/(?:gewicht|weight)\D{0,10}(\d{2,3}[.,]\d{1,2})/i)
  if (withLabel) return parseDecimal(withLabel[1])
  return null
}

/** Body-fat percentage, if the notification includes one (e.g. "23,4% vet"). */
function parseBodyFat(combined: string): number | null {
  const m = combined.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%/)
  return m ? parseDecimal(m[1]) : null
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405)
  }

  const secret = req.headers.get('x-webhook-secret') ?? ''
  // Fail CLOSED: an unset secret must NOT leave this service-role endpoint open.
  if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
    return json({ ok: false, error: 'Unauthorized' }, 401)
  }

  let body: { title?: string; text?: string; weight_kg?: number; body_fat_pct?: number; datetime?: string }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400)
  }

  const { title = '', text = '' } = body
  const combined = `${title} ${text}`

  let weightKg: number | null
  let bodyFatPct: number | null
  if (Number.isFinite(body.weight_kg)) {
    weightKg = body.weight_kg as number
    bodyFatPct = Number.isFinite(body.body_fat_pct) ? (body.body_fat_pct as number) : null
  } else {
    weightKg = parseWeight(combined)
    bodyFatPct = parseBodyFat(combined)
  }

  if (weightKg == null || !Number.isFinite(weightKg) || weightKg < 20 || weightKg > 300) {
    // Not a weigh-in notification, or the regex didn't match — see the doc
    // comment above for how to tune it against your app's real wording.
    return json({ ok: false, error: 'No weight found', title, text }, 200)
  }

  const datetime = body.datetime?.trim() || new Date().toISOString()

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { error } = await supabase.from('health_body_metrics').upsert(
    { user_id: USER_ID, datetime, weight_kg: weightKg, body_fat_pct: bodyFatPct },
    { onConflict: 'user_id,datetime' },
  )

  if (error) {
    console.error('Upsert error:', error)
    return json({ ok: false, error: error.message }, 500)
  }

  return json({ ok: true, weight_kg: weightKg, body_fat_pct: bodyFatPct })
})
