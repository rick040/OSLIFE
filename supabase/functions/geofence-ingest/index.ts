/**
 * Supabase Edge Function: geofence-ingest
 * -------------------------------------------
 * Receives geofence enter/exit events from MacroDroid on Android and does two
 * things with each one:
 *
 *   1. Logs every accepted "enter" as a raw check-in row in `location_checkins`
 *      (unchanged since PM-072 Fase 1) — run_inference()'s R10 repeat-visit
 *      rule reads that table on its own schedule and is unaffected by
 *      anything below.
 *   2. Maintains a dwell SESSION per place in `location_visits`
 *      (entered_at → left_at, null while still inside) for the Locaties map.
 *      GPS-jitter flapping (a spurious exit immediately followed by a
 *      re-entry at the same place) is merged: an "enter" that arrives within
 *      GRACE_MINUTES of that place's last "exit" reopens the existing visit
 *      (left_at → null) instead of starting a new one, so a brief blip
 *      doesn't split one real visit into several short, noisy sessions.
 *
 * MacroDroid setup — one macro pair per geofence GROUP (e.g. "Home" and
 * "Other places"), each POSTing on both its Entered and Exited triggers:
 *   Body: {"place_id": "<stable geofence id>", "place_name": "<label>",
 *          "place_type": "<optional>", "lat": [lat], "lon": [lon],
 *          "event": "enter" | "exit"}
 *   Headers: x-webhook-secret: <GEOFENCE_WEBHOOK_SECRET>
 *   (GET with the same fields as query params also works, for parity with
 *   the old MacroDroid macros.)
 *
 * Deploy:
 *   supabase functions deploy geofence-ingest --project-ref nhyunnnmdcmojvkxrbpl
 *   supabase secrets set GEOFENCE_WEBHOOK_SECRET=<random string> --project-ref nhyunnnmdcmojvkxrbpl
 *   (falls back to WALLET_WEBHOOK_SECRET if unset — same phone, same MacroDroid
 *   app as the other ingest macros, no need to invent a second secret.)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SUPABASE_SERVICE_KEY, SUPABASE_URL, USER_ID, jsonResponder } from '../_shared/http.ts'

const WEBHOOK_SECRET = Deno.env.get('GEOFENCE_WEBHOOK_SECRET') ?? Deno.env.get('WALLET_WEBHOOK_SECRET') ?? ''

// A same-place exit followed by a re-entry within this window is GPS jitter,
// not a real trip out and back — the visit is reopened instead of split.
const GRACE_MINUTES = 10

const json = jsonResponder()

interface Body {
  place_id?: string
  place_name?: string
  place_type?: string
  lat?: number | string
  lon?: number | string
  ts?: string
  event?: string
}

function num(v: number | string | undefined): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
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

  const placeId = body.place_id ?? url.searchParams.get('place_id') ?? undefined
  const placeName = (body.place_name ?? url.searchParams.get('place_name') ?? '').toString().trim()
  const placeType = body.place_type ?? url.searchParams.get('place_type') ?? undefined
  const lat = num(body.lat ?? url.searchParams.get('lat') ?? undefined)
  const lon = num(body.lon ?? url.searchParams.get('lon') ?? undefined)
  const tsRaw = body.ts ?? url.searchParams.get('ts') ?? undefined
  const event = (body.event ?? url.searchParams.get('event') ?? 'enter').toString().trim().toLowerCase()

  if (!placeName && !placeId) {
    return json({ ok: false, error: 'place_name or place_id is required' }, 400)
  }

  const ts = tsRaw ? new Date(tsRaw) : new Date()
  if (isNaN(ts.getTime())) {
    return json({ ok: false, error: 'Invalid ts' }, 400)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const resolvedPlaceName = placeName || (placeId as string)

  if (event === 'exit' || event === 'exited') {
    // Close the open session for this place, if any. An exit with no open
    // session (missed the matching enter, or already closed) is a no-op —
    // there's nothing to close, same as the old silent-ignore behaviour.
    if (placeId) {
      const { data: open, error: findErr } = await supabase
        .from('location_visits')
        .select('id, entered_at')
        .eq('user_id', USER_ID)
        .eq('place_id', placeId)
        .is('left_at', null)
        .order('entered_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (findErr) {
        console.error('location_visits lookup error:', findErr)
        return json({ ok: false, error: findErr.message }, 500)
      }

      if (open) {
        const { error: closeErr } = await supabase
          .from('location_visits')
          .update({ left_at: ts.toISOString(), updated_at: new Date().toISOString() })
          .eq('id', open.id)
        if (closeErr) {
          console.error('location_visits close error:', closeErr)
          return json({ ok: false, error: closeErr.message }, 500)
        }
      }
    }
    return json({ ok: true, event: 'exit' })
  }

  // ── enter ──────────────────────────────────────────────────────────────────

  // 1. Raw check-in log — unchanged, feeds run_inference()'s R10.
  const { error: checkinErr } = await supabase.from('location_checkins').insert({
    user_id: USER_ID,
    place_id: placeId ?? null,
    place_name: resolvedPlaceName,
    place_type: placeType ?? null,
    lat, lon,
    ts: ts.toISOString(),
  })
  if (checkinErr) {
    console.error('location_checkins insert error:', checkinErr)
    return json({ ok: false, error: checkinErr.message }, 500)
  }

  // 2. Session: reopen a recently-closed visit at the same place (GPS-jitter
  // flap), no-op if one's already open, else start a new visit.
  if (placeId) {
    const { data: last, error: lastErr } = await supabase
      .from('location_visits')
      .select('id, left_at')
      .eq('user_id', USER_ID)
      .eq('place_id', placeId)
      .order('entered_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastErr) {
      console.error('location_visits lookup error:', lastErr)
      return json({ ok: false, error: lastErr.message }, 500)
    }

    if (last && last.left_at === null) {
      // Already open — duplicate/repeated enter, nothing to do.
      return json({ ok: true, event: 'enter', session: 'already_open' })
    }

    if (last && last.left_at) {
      const closedAgoMin = (ts.getTime() - new Date(last.left_at).getTime()) / 60_000
      if (closedAgoMin >= 0 && closedAgoMin <= GRACE_MINUTES) {
        const { error: reopenErr } = await supabase
          .from('location_visits')
          .update({ left_at: null, updated_at: new Date().toISOString() })
          .eq('id', last.id)
        if (reopenErr) {
          console.error('location_visits reopen error:', reopenErr)
          return json({ ok: false, error: reopenErr.message }, 500)
        }
        return json({ ok: true, event: 'enter', session: 'reopened' })
      }
    }

    const { error: insertErr } = await supabase.from('location_visits').insert({
      user_id: USER_ID,
      place_id: placeId,
      place_name: resolvedPlaceName,
      place_type: placeType ?? null,
      lat, lon,
      entered_at: ts.toISOString(),
      left_at: null,
    })
    if (insertErr) {
      console.error('location_visits insert error:', insertErr)
      return json({ ok: false, error: insertErr.message }, 500)
    }
  }

  return json({ ok: true, event: 'enter', session: 'started' })
})
