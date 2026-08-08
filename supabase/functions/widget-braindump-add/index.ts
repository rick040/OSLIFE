/**
 * Supabase Edge Function: widget-braindump-add
 * -----------------------------------------------
 * Feeds the "Brain-dump quick add" Android home-screen widget (see /android):
 * a one-tap capture that lands in braindump_entries and runs through the same
 * braindump-ingest pipeline as an in-app or Telegram capture (Markdown note,
 * tagging, Kennisbank suggestion). Modelled directly on telegram-webhook's
 * captureTelegramMessage()/triggerBraindumpIngest() — insert with the service
 * role, then fire-and-forget the ingest call using the service key as the
 * bearer token (braindump-ingest treats that as service_role, bypassing RLS).
 *
 *   request:  POST { "text": "..." }
 *   response: { ok: true, entryId } | { ok: false, error: "..." }
 *
 *   request:  GET (no body) — today's capture count, for the widget's small badge
 *   response: { ok: true, todayCount }
 *
 * Deploy:
 *   supabase functions deploy widget-braindump-add --project-ref nhyunnnmdcmojvkxrbpl
 *   (uses WIDGET_SUMMARY_SECRET, same as widget-summary — no new secret needed)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SUPABASE_SERVICE_KEY, SUPABASE_URL, USER_ID, jsonResponder } from '../_shared/http.ts'
import { amsterdamToday } from '../_shared/dates.ts'

const WEBHOOK_SECRET = Deno.env.get('WIDGET_SUMMARY_SECRET') ?? Deno.env.get('WALLET_WEBHOOK_SECRET') ?? ''
const MAX_TEXT_LENGTH = 4000

const json = jsonResponder()

function checkSecret(req: Request): boolean {
  const url = new URL(req.url)
  const secret = req.headers.get('x-widget-secret') ?? url.searchParams.get('secret') ?? ''
  return !!WEBHOOK_SECRET && secret === WEBHOOK_SECRET
}

/** Fire-and-forget, same contract as telegram-webhook's triggerBraindumpIngest(). */
function triggerBraindumpIngest(entryId: string): void {
  fetch(`${SUPABASE_URL}/functions/v1/braindump-ingest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    body: JSON.stringify({ entryId }),
  }).catch(() => {})
}

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405)
  }
  if (!checkSecret(req)) return json({ ok: false, error: 'Unauthorized' }, 401)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  if (req.method === 'GET') {
    const today = amsterdamToday()
    const { count, error } = await supabase
      .from('braindump_entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', USER_ID)
      .gte('created_at', `${today}T00:00:00.000Z`)
    if (error) {
      console.error('widget-braindump-add count error:', error)
      return json({ ok: false, error: error.message }, 500)
    }
    return json({ ok: true, todayCount: count ?? 0 })
  }

  let body: { text?: string }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400)
  }
  const text = String(body.text ?? '').trim().slice(0, MAX_TEXT_LENGTH)
  if (!text) return json({ ok: false, error: 'text is required' }, 400)

  const { data, error } = await supabase
    .from('braindump_entries')
    .insert({
      user_id: USER_ID,
      source_kind: 'text',
      status: 'pending',
      meta: { rawText: text, source: 'android_widget' },
    })
    .select('id')
    .single()
  if (error || !data) {
    console.error('widget-braindump-add insert error:', error)
    return json({ ok: false, error: error?.message ?? 'Insert failed' }, 500)
  }

  triggerBraindumpIngest(data.id)
  return json({ ok: true, entryId: data.id })
})
