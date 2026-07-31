/**
 * Supabase Edge Function: steps-ingest
 * ---------------------------------------
 * Receives POST from MacroDroid on Android when the step-counter app (Samsung
 * Health / Google Fit) posts or updates its running step-count notification
 * (e.g. "4.391 stappen"), and upserts just the `steps` column of today's
 * `health_daily_stats` row. Real-time replacement for the legacy Health-sheet
 * "Stappen" tab (health-sheets.gs no longer reads it) — this is now the
 * primary steps path. Tasker/Health Connect (health-ingest) can still post
 * steps too; whichever posts last for a given date wins, same harmless
 * last-write-wins behaviour as weight-ingest vs. health-ingest for weight.
 *
 * Because this only ever includes `steps` (and `date`) in the upserted row,
 * the Postgres upsert's ON CONFLICT DO UPDATE only touches the `steps`
 * column — sleep/distance/calories/duration written by health-ingest for the
 * same date are left untouched.
 *
 * MacroDroid setup (on Samsung phone):
 *   Trigger:  Notification received/updated → App: "Samsung Health" (or Google Fit)
 *   Constraint: macro run frequency — at most once every N minutes, so a
 *               ticking step-count notification doesn't spam this endpoint.
 *   Action:   HTTP Request → POST → https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/steps-ingest
 *   Headers:  Content-Type: application/json
 *             x-webhook-secret: <your PHONE_WEBHOOK_SECRET — same one phone-events-ingest uses>
 *   Body:     {"title": "[notification_title]", "text": "[notification_text]"}
 *
 * Structured alternative (if MacroDroid already extracted the number via a
 * local variable / regex action): {"steps": 4391}
 * Optional explicit date override (defaults to "today" in Europe/Amsterdam,
 * not UTC, so it doesn't roll over a few hours early/late): {"date": "2026-07-31"}
 *
 * Deploy:
 *   supabase functions deploy steps-ingest --project-ref nhyunnnmdcmojvkxrbpl
 *   (reuses PHONE_WEBHOOK_SECRET + OSLIFE_USER_ID — no new secret needed; set
 *   STEPS_WEBHOOK_SECRET only if you want a secret dedicated to this function)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SUPABASE_SERVICE_KEY, SUPABASE_URL, USER_ID, jsonResponder } from '../_shared/http.ts'

// Reuse the Phone-events secret by default — same phone/MacroDroid instance,
// no reason to invent a third secret. STEPS_WEBHOOK_SECRET can still override.
const WEBHOOK_SECRET =
  Deno.env.get('STEPS_WEBHOOK_SECRET') ?? Deno.env.get('PHONE_WEBHOOK_SECRET') ?? Deno.env.get('WALLET_WEBHOOK_SECRET') ?? ''

const json = jsonResponder()

/** Pull a plausible step count out of free-form notification text, e.g.
 *  "4.391 stappen" (NL, dot thousands-separator) or "4,391 steps" (EN, comma). */
function parseSteps(combined: string): number | null {
  const m = combined.match(/(\d{1,3}(?:[.,]\d{3})+|\d+)\s*(?:stappen|steps)\b/i)
  if (!m) return null
  const n = parseInt(m[1].replace(/[.,]/g, ''), 10)
  return Number.isFinite(n) ? n : null
}

/** Today's date (YYYY-MM-DD) in Europe/Amsterdam, not the edge function's UTC clock. */
function todayAmsterdam(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date())
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

  let body: { title?: string; text?: string; steps?: number; date?: string }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400)
  }

  const { title = '', text = '' } = body
  const combined = `${title} ${text}`

  const steps = Number.isFinite(body.steps) ? (body.steps as number) : parseSteps(combined)

  if (steps == null || !Number.isFinite(steps) || steps < 0 || steps > 200_000) {
    // Not a step-count notification, or the regex didn't match — see the doc
    // comment above for how MacroDroid should be sending the notification text.
    return json({ ok: false, error: 'No steps found', title, text }, 200)
  }

  const date = body.date?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(body.date.trim())
    ? body.date.trim()
    : todayAmsterdam()

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  // Only `steps` (+ key columns) is in this row, so ON CONFLICT DO UPDATE only
  // touches the steps column — other health_daily_stats fields are untouched.
  const { error } = await supabase
    .from('health_daily_stats')
    .upsert({ user_id: USER_ID, date, steps }, { onConflict: 'user_id,date' })

  if (error) {
    console.error('Upsert error:', error)
    return json({ ok: false, error: error.message }, 500)
  }

  return json({ ok: true, date, steps })
})
