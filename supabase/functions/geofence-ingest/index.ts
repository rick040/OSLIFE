/**
 * Supabase Edge Function: geofence-ingest
 * -------------------------------------------
 * Receives geofence check-ins from a MacroDroid macro on Android (PM-072 Fase
 * 1). This is new surface, not a pre-existing contract — see the plan doc:
 * OSLIFE had no location/geofence ingest of any kind before this. Modelled
 * directly on phone-events-ingest / wallet-ingest's established shape (shared
 * secret, fail-closed, service-role write, GET-friendly for MacroDroid).
 *
 * MacroDroid setup (mirrors integrations/macrodroid/phone-sleep.md's pattern):
 *   Trigger: Geofence (Entered) → HTTP GET/POST …
 *     ?place_id=<stable geofence id>&place_name=<label>&place_type=<optional>
 *     &lat={lat}&lon={lon}&event=enter
 *   A matching "Geofence (Exited)" trigger with &event=exit is accepted but
 *   ignored (200, `ignored: true`) — only arrivals are check-ins.
 *   Secret (like the other MacroDroid ingest fns): header x-webhook-secret OR
 *   ?secret= query param.
 *
 * Each check-in is logged to `location_checkins`, which mirrors into the
 * event spine via the existing emit_event() trigger (Slice 0) — no bespoke
 * logging here. run_inference()'s R10 rule (20260717000000 migration) reads
 * this table on its own hourly pg_cron schedule; this function does no
 * pattern detection itself, matching the data-layer/brain-layer split (see
 * plan doc PM-072).
 *
 *   request:  GET/POST ?place_id=&place_name=&place_type=&lat=&lon=&event=enter|exit
 *             (or the JSON-body equivalent)
 *   response: { ok: true, logged: 1 } | { ok: false, error: "..." }
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

  // Only arrivals are check-ins — an "exited" trigger is accepted (so a
  // MacroDroid macro wired to both doesn't get a 400) but never logged.
  if (event === 'exit' || event === 'exited') {
    return json({ ok: true, ignored: true })
  }

  if (!placeName && !placeId) {
    return json({ ok: false, error: 'place_name or place_id is required' }, 400)
  }

  const ts = tsRaw ? new Date(tsRaw) : new Date()
  if (isNaN(ts.getTime())) {
    return json({ ok: false, error: 'Invalid ts' }, 400)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { error } = await supabase.from('location_checkins').insert({
    user_id: USER_ID,
    place_id: placeId ?? null,
    place_name: placeName || (placeId as string),
    place_type: placeType ?? null,
    lat, lon,
    ts: ts.toISOString(),
  })
  if (error) {
    console.error('location_checkins insert error:', error)
    return json({ ok: false, error: error.message }, 500)
  }

  return json({ ok: true, logged: 1 })
})
