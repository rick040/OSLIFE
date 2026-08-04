/**
 * Supabase Edge Function: activity-ingest
 * -------------------------------------------
 * Receives Activity Recognition transitions from MacroDroid on Android
 * (cycling / in-vehicle, high-confidence "Started" and low-confidence
 * "Stopped" triggers) and replaces the old Google Apps Script "Activiteiten"
 * sheet — MacroDroid posts here directly instead of a script.google.com URL.
 *
 * Maintains one SESSION per activity type in `activity_sessions`
 * (started_at → ended_at, null while still ongoing), same merge pattern as
 * geofence-ingest/location_visits: the old sheet script paired row N with
 * row N-1 by position, so a "false stop" (confidence briefly dips below the
 * threshold and recovers seconds later) fragmented one real ride into
 * several short rows. Here, a "started" event that arrives within
 * MERGE_MINUTES of that same activity's last "stopped" event reopens the
 * existing session instead of starting a new one.
 *
 * MacroDroid setup — point BOTH the high-confidence ("Als") and
 * low-confidence ("Anders") HTTP-request actions at this URL, GET or POST:
 *   activity=<raw MacroDroid trigger name, e.g. "Activiteit - Op de fiets">
 *   state=<started|stopped>  (or infer from confidence — see below)
 *   secret=<ACTIVITY_WEBHOOK_SECRET>
 * `activity` is cleaned the same way the old Apps Script did (strips
 * "Activiteit - " / ": Vertrouwen …") and matched to a canonical type
 * (fiets/cycling → 'cycling', voertuig/vehicle → 'in_vehicle'), so the
 * existing MacroDroid macro can keep using the trigger's display name —
 * only the URL needs to change.
 *
 * Deploy:
 *   supabase functions deploy activity-ingest --project-ref nhyunnnmdcmojvkxrbpl
 *   supabase secrets set ACTIVITY_WEBHOOK_SECRET=<random string> --project-ref nhyunnnmdcmojvkxrbpl
 *   (falls back to WALLET_WEBHOOK_SECRET if unset — same phone, same
 *   MacroDroid app as the other ingest macros, no need to invent a second
 *   secret.)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SUPABASE_SERVICE_KEY, SUPABASE_URL, USER_ID, jsonResponder } from '../_shared/http.ts'

const WEBHOOK_SECRET = Deno.env.get('ACTIVITY_WEBHOOK_SECRET') ?? Deno.env.get('WALLET_WEBHOOK_SECRET') ?? ''

// A "stopped" immediately followed by a same-type "started" within this
// window is a false stop (confidence blip), not a real end-of-ride — the
// session is reopened instead of split.
const MERGE_MINUTES = Number(Deno.env.get('ACTIVITY_MERGE_MINUTES') ?? '3')

const json = jsonResponder()

interface Body {
  activity?: string
  state?: string
  confidence?: string
  ts?: string
}

/** Strip "Activiteit - " / ": Vertrouwen >= 60%" etc and map to a canonical
 *  type — same cleanup the old doGet.gs Apps Script did on the raw MacroDroid
 *  trigger name, so the macro doesn't need to change what it sends. */
function normalizeActivityType(raw: string): string {
  const cleaned = raw
    .replace(/^Activiteit\s*-\s*/i, '')
    .replace(/\s*:?\s*Vertrouwen.*/i, '')
    .trim()
    .toLowerCase()
  if (/fiets|cycl|bike/.test(cleaned)) return 'cycling'
  if (/voertuig|vehicle|auto|car/.test(cleaned)) return 'in_vehicle'
  if (!cleaned) return 'unknown'
  return cleaned.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown'
}

/** Explicit state wins; otherwise infer from a confidence percentage the
 *  same way the MacroDroid triggers are split (>=~60% = started, <50% =
 *  stopped) so a macro that only ever sends `confidence` still works. */
function normalizeState(rawState: string | undefined, confidence: string | undefined): 'started' | 'stopped' | null {
  const s = (rawState ?? '').trim().toLowerCase()
  if (/start/.test(s)) return 'started'
  if (/stop/.test(s)) return 'stopped'
  const c = confidence != null ? Number(confidence.replace('%', '').trim()) : NaN
  if (Number.isFinite(c)) return c >= 50 ? 'started' : 'stopped'
  return null
}

Deno.serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ ok: false, error: 'Method not allowed' }, 405)
  }

  // Fail CLOSED: an unset secret must not leave this service-role endpoint open.
  const url = new URL(req.url)
  const secret = req.headers.get('x-webhook-secret') ?? url.searchParams.get('secret') ?? ''
  if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
    return json({ ok: false, error: 'Unauthorized' }, 401)
  }

  let body: Body = {}
  if (req.method === 'POST') {
    try { body = await req.json() } catch { /* allow empty body + query params */ }
  }

  const rawActivity = (body.activity ?? url.searchParams.get('activity') ?? '').toString()
  const rawState = body.state ?? url.searchParams.get('state') ?? undefined
  const confidence = body.confidence ?? url.searchParams.get('confidence') ?? undefined
  const tsRaw = body.ts ?? url.searchParams.get('ts') ?? undefined

  if (!rawActivity.trim()) {
    return json({ ok: false, error: 'activity is required' }, 400)
  }
  const activityType = normalizeActivityType(rawActivity)
  const state = normalizeState(rawState, confidence)
  if (!state) {
    return json({ ok: false, error: 'state (started/stopped) or confidence is required' }, 400)
  }

  const ts = tsRaw ? new Date(tsRaw) : new Date()
  if (isNaN(ts.getTime())) {
    return json({ ok: false, error: 'Invalid ts' }, 400)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  if (state === 'stopped') {
    // Close the currently open session for this activity type, if any. A stray
    // stop with no open session (missed the matching start, or already
    // closed) is a no-op — nothing to close.
    const { data: open, error: findErr } = await supabase
      .from('activity_sessions')
      .select('id, started_at')
      .eq('user_id', USER_ID)
      .eq('activity_type', activityType)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (findErr) {
      console.error('activity_sessions lookup error:', findErr)
      return json({ ok: false, error: findErr.message }, 500)
    }
    if (!open) {
      return json({ ok: true, activity: activityType, state: 'stopped', session: 'ignored_no_open_session' })
    }

    const { error: closeErr } = await supabase
      .from('activity_sessions')
      .update({ ended_at: ts.toISOString(), updated_at: new Date().toISOString() })
      .eq('id', open.id)
    if (closeErr) {
      console.error('activity_sessions close error:', closeErr)
      return json({ ok: false, error: closeErr.message }, 500)
    }
    return json({ ok: true, activity: activityType, state: 'stopped', session: 'closed', id: open.id })
  }

  // ── started ──────────────────────────────────────────────────────────────
  const { data: last, error: lastErr } = await supabase
    .from('activity_sessions')
    .select('id, ended_at')
    .eq('user_id', USER_ID)
    .eq('activity_type', activityType)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lastErr) {
    console.error('activity_sessions lookup error:', lastErr)
    return json({ ok: false, error: lastErr.message }, 500)
  }

  if (last && last.ended_at === null) {
    // Already open — duplicate/repeated start trigger, nothing to do.
    return json({ ok: true, activity: activityType, state: 'started', session: 'already_open', id: last.id })
  }

  if (last && last.ended_at) {
    const closedAgoMin = (ts.getTime() - new Date(last.ended_at).getTime()) / 60_000
    if (closedAgoMin >= 0 && closedAgoMin <= MERGE_MINUTES) {
      const { error: reopenErr } = await supabase
        .from('activity_sessions')
        .update({ ended_at: null, updated_at: new Date().toISOString() })
        .eq('id', last.id)
      if (reopenErr) {
        console.error('activity_sessions reopen error:', reopenErr)
        return json({ ok: false, error: reopenErr.message }, 500)
      }
      return json({ ok: true, activity: activityType, state: 'started', session: 'merged_false_stop', id: last.id })
    }
  }

  const { data: created, error: insertErr } = await supabase
    .from('activity_sessions')
    .insert({
      user_id: USER_ID,
      activity_type: activityType,
      started_at: ts.toISOString(),
      ended_at: null,
      source: 'macrodroid',
    })
    .select('id')
    .single()
  if (insertErr) {
    console.error('activity_sessions insert error:', insertErr)
    return json({ ok: false, error: insertErr.message }, 500)
  }

  return json({ ok: true, activity: activityType, state: 'started', session: 'started', id: created.id })
})
