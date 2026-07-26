/**
 * Supabase Edge Function: walk-ingest
 * -------------------------------------------
 * Receives a finished dog walk from the standalone Android walk-tracker app
 * (see /android — no MacroDroid, no third-party app; the phone posts directly
 * here once, when the on-device detector decides the walk is over). Modelled
 * directly on geofence-ingest / phone-events-ingest's established shape
 * (shared secret, fail-closed, service-role write).
 *
 * The on-device detector already applies the "is this actually a walk" rules
 * (min 5 minutes, pause/resume merging, home-geofence or car-ride trigger —
 * see /android/README.md); this function re-checks the minimum duration
 * server-side too, defensively, in case a buggy/rogue client posts a short one.
 *
 * Each walk writes two rows in one call:
 *   - `dog_log` (kind='walk') — so it shows up in the existing Kyra timeline
 *     and coach exactly like a manually logged walk.
 *   - `walks` — the GPS route detail (points/trigger_source) for the map card.
 *
 * Also serves GET, so the Android app itself can show a walk-history screen
 * (cards + map, same shared secret) without a second function to deploy.
 *
 *   request:  POST { started_at, ended_at, duration_min, distance_km,
 *                    points: [{lat, lon, t}], trigger_source? }
 *   response: { ok: true, walk_id, dog_log_id } | { ok: false, error: "..." }
 *
 *   request:  GET ?limit=30 (optional, default 30, max 100)
 *   response: { ok: true, walks: [{ id, started_at, ended_at, duration_min,
 *                                    distance_km, points, trigger_source }] }
 *
 * Deploy:
 *   supabase functions deploy walk-ingest --project-ref nhyunnnmdcmojvkxrbpl
 *   supabase secrets set WALK_WEBHOOK_SECRET=<random string> --project-ref nhyunnnmdcmojvkxrbpl
 *   (falls back to WALLET_WEBHOOK_SECRET if unset — same convention as the
 *   other single-phone ingest functions.)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SUPABASE_SERVICE_KEY, SUPABASE_URL, USER_ID, jsonResponder } from '../_shared/http.ts'

const WEBHOOK_SECRET = Deno.env.get('WALK_WEBHOOK_SECRET') ?? Deno.env.get('WALLET_WEBHOOK_SECRET') ?? ''
const MIN_DURATION_MIN = Number(Deno.env.get('WALK_MIN_DURATION_MIN') ?? '5')

const json = jsonResponder()

interface Point {
  lat: number
  lon: number
  t?: string
}

interface Body {
  started_at?: string
  ended_at?: string
  duration_min?: number
  distance_km?: number
  points?: Point[]
  trigger_source?: string
}

function num(v: unknown): number | null {
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

  if (req.method === 'GET') {
    const limit = Math.min(Math.max(num(url.searchParams.get('limit')) ?? 30, 1), 100)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data, error } = await supabase
      .from('walks')
      .select('id,started_at,ended_at,duration_min,distance_km,points,trigger_source')
      .eq('user_id', USER_ID)
      .order('started_at', { ascending: false })
      .limit(limit)
    if (error) {
      console.error('walks list error:', error)
      return json({ ok: false, error: error.message }, 500)
    }
    return json({ ok: true, walks: data ?? [] })
  }

  let body: Body
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400)
  }

  const startedAt = body.started_at ? new Date(body.started_at) : null
  const endedAt = body.ended_at ? new Date(body.ended_at) : null
  const durationMin = num(body.duration_min)
  const distanceKm = num(body.distance_km) ?? 0
  const points = Array.isArray(body.points) ? body.points : []
  const triggerSource = (body.trigger_source ?? 'unknown').toString().trim().slice(0, 40)

  if (!startedAt || isNaN(startedAt.getTime()) || !endedAt || isNaN(endedAt.getTime())) {
    return json({ ok: false, error: 'started_at/ended_at required and must be valid dates' }, 400)
  }
  if (durationMin == null) {
    return json({ ok: false, error: 'duration_min is required' }, 400)
  }
  // Defensive re-check of the on-device "is this a real walk" filter — a short
  // walk should never have been posted, but never trust the client alone.
  if (durationMin < MIN_DURATION_MIN) {
    return json({ ok: true, ignored: true, reason: 'below minimum duration' })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  const { data: dogLog, error: dogLogError } = await supabase
    .from('dog_log')
    .insert({
      user_id: USER_ID,
      kind: 'walk',
      happened_at: startedAt.toISOString(),
      duration_min: Math.round(durationMin),
      distance_km: distanceKm,
      notes: `Automatisch gelogd (Android, ${triggerSource})`,
    })
    .select('id')
    .single()
  if (dogLogError) {
    console.error('dog_log insert error:', dogLogError)
    return json({ ok: false, error: dogLogError.message }, 500)
  }

  const { data: walk, error: walkError } = await supabase
    .from('walks')
    .insert({
      user_id: USER_ID,
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      duration_min: Math.round(durationMin),
      distance_km: distanceKm,
      points,
      trigger_source: triggerSource,
      dog_log_id: dogLog.id,
    })
    .select('id')
    .single()
  if (walkError) {
    console.error('walks insert error:', walkError)
    return json({ ok: false, error: walkError.message }, 500)
  }

  return json({ ok: true, walk_id: walk.id, dog_log_id: dogLog.id })
})
