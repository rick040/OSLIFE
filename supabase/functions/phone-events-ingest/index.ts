/**
 * Supabase Edge Function: phone-events-ingest
 * -------------------------------------------
 * Receives phone-activity events from a MacroDroid macro on Android and derives
 * a nightly sleep session from them, without a health app.
 *
 * Two sources, in priority order:
 *   1. Explicit sleep/wake — MacroDroid's own "asleep"/"awake" detection:
 *        sleep_start → you fell asleep       sleep_end → you woke up
 *      These are the most accurate and are used verbatim (no heuristic).
 *   2. Activity gap (fallback for nights without explicit events) — the "I don't
 *      use my phone at night, so I must be asleep" heuristic Samsung Health uses:
 *        screen_off → you laid the phone down     unlock → you picked it up
 *      Bedtime/wake come from the longest overnight gap between unlocks.
 *
 * Each event is logged to `phone_events`; after every write we recompute the
 * last few nights and upsert the resulting session into `health_sleep` as a
 * phone-derived estimate (source='phone'). Real Samsung-Health sessions
 * (source='health_app', from health-sheets-ingest) always take precedence and
 * are never overwritten.
 *
 * Unlock events also feed `screentime_daily.pickups` (recomputed from the raw
 * `unlock` events on every call, same pattern as sleep) — this is now the
 * primary source for daily pickup counts, replacing the "Ontgrendelingen" tab
 * in the Schermtijd sheet (screentime-sheet.gs no longer sends it).
 *
 * MacroDroid setup (on the phone — see integrations/macrodroid/phone-sleep.md):
 *   Preferred  Trigger: Sleep (asleep) → HTTP GET …?kind=sleep_start
 *              Trigger: Sleep (awake)  → HTTP GET …?kind=sleep_end
 *   Fallback   Trigger: Screen Off     → HTTP GET …?kind=screen_off
 *              Trigger: Device Unlocked→ HTTP GET …?kind=unlock
 *   Secret (all): header x-webhook-secret OR ?secret= query param.
 *
 * Deploy:
 *   supabase functions deploy phone-events-ingest --project-ref nhyunnnmdcmojvkxrbpl
 *   supabase secrets set PHONE_WEBHOOK_SECRET=<random string> --project-ref nhyunnnmdcmojvkxrbpl
 *   (OSLIFE_USER_ID is already set for the other ingest functions.)
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SUPABASE_SERVICE_KEY, SUPABASE_URL, USER_ID, jsonResponder } from '../_shared/http.ts'

// Reuse the Wallet secret if a dedicated one isn't set — it's the same
// MacroDroid app on the same phone, so users needn't invent a second secret.
const WEBHOOK_SECRET = Deno.env.get('PHONE_WEBHOOK_SECRET') ?? Deno.env.get('WALLET_WEBHOOK_SECRET') ?? ''

const json = jsonResponder()

// ── Sleep-derivation tuning ───────────────────────────────────────────────────
const MIN_SLEEP_H = 3      // a gap shorter than this isn't a night's sleep
const MAX_SLEEP_H = 14     // longer than this is the phone being off/lost, not sleep
const LOOKBACK_DAYS = 4    // recompute recent nights on every event
const TZ = 'Europe/Amsterdam'

type Kind = 'unlock' | 'screen_off' | 'screen_on' | 'sleep_start' | 'sleep_end'
interface PhoneEvent { ts: Date; kind: Kind }

/** Normalise the many spellings MacroDroid / URLs might send to a canonical kind. */
function normalizeKind(raw: string | null | undefined): Kind | null {
  const k = (raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (/^unlock(ed)?$/.test(k) || k === 'device_unlocked' || k === 'picked_up') return 'unlock'
  if (k === 'screen_off' || k === 'off' || k === 'screenoff' || k === 'laid_down') return 'screen_off'
  if (k === 'screen_on' || k === 'on' || k === 'screenon') return 'screen_on'
  // Explicit sleep/wake from MacroDroid's own detection (NL + EN aliases).
  if (k === 'sleep_start' || k === 'asleep' || k === 'fell_asleep' || k === 'sleeping' || k === 'in_slaap' || k === 'slaap' || k === 'bedtime') return 'sleep_start'
  if (k === 'sleep_end' || k === 'awake' || k === 'woke' || k === 'woke_up' || k === 'wake' || k === 'wakeup' || k === 'wakker' || k === 'wakker_geworden') return 'sleep_end'
  return null
}

/** Amsterdam calendar date (YYYY-MM-DD) of an instant. */
function amsDate(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: TZ })
}

/** Amsterdam hour-of-day (0–23) of an instant. */
function amsHour(d: Date): number {
  return parseInt(d.toLocaleString('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }), 10) % 24
}

interface SleepSession { date: string; start: Date; end: Date; minutes: number }

/**
 * Sessions from MacroDroid's asleep/awake detection. The Sleep trigger re-fires
 * repeatedly (it's really a "phone still / moving" signal), so we can't naively
 * pair events. Instead collapse runs into "still" intervals: an interval opens
 * at a sleep_start (when none is open) and closes at the next sleep_end,
 * ignoring the re-fires in between. Keep the longest interval per wake-date that
 * lasts MIN_SLEEP_H–MAX_SLEEP_H and ends in the morning. (Events must be sorted
 * ascending by ts.)
 */
function deriveExplicitSleep(events: PhoneEvent[]): SleepSession[] {
  const best = new Map<string, SleepSession>()
  let openStart: Date | null = null
  for (const e of events) {
    if (e.kind === 'sleep_start') {
      if (!openStart) openStart = e.ts
    } else if (e.kind === 'sleep_end' && openStart) {
      const bed = openStart
      const wake = e.ts
      openStart = null
      const hrs = (wake.getTime() - bed.getTime()) / 3_600_000
      if (hrs < MIN_SLEEP_H || hrs > MAX_SLEEP_H) continue
      const wakeHour = amsHour(wake)
      if (wakeHour < 3 || wakeHour > 13) continue // woke in the morning, not a daytime still-period
      const minutes = Math.round((wake.getTime() - bed.getTime()) / 60_000)
      const date = amsDate(wake)
      const prev = best.get(date)
      if (!prev || minutes > prev.minutes) best.set(date, { date, start: bed, end: wake, minutes })
    }
  }
  return [...best.values()]
}

/**
 * Find each night's sleep session from a sorted event stream: the largest gap
 * between consecutive unlocks that starts in the evening and ends in the
 * morning. Bedtime is refined to the first Screen-Off after that last evening
 * unlock (when available); wake is the first morning unlock. Longest gap wins
 * per wake-date.
 */
function deriveSleep(events: PhoneEvent[]): SleepSession[] {
  const unlocks = events.filter((e) => e.kind === 'unlock')
  const screenOffs = events.filter((e) => e.kind === 'screen_off')
  const best = new Map<string, SleepSession>()

  for (let i = 0; i < unlocks.length - 1; i++) {
    const gapStart = unlocks[i].ts
    const wake = unlocks[i + 1].ts
    const gapH = (wake.getTime() - gapStart.getTime()) / 3_600_000
    if (gapH < MIN_SLEEP_H || gapH > MAX_SLEEP_H) continue

    const bedHour = amsHour(gapStart)
    const wakeHour = amsHour(wake)
    const laidDownAtNight = bedHour >= 19 || bedHour <= 4      // evening / small hours
    const wokeInMorning = wakeHour >= 3 && wakeHour <= 13
    if (!laidDownAtNight || !wokeInMorning) continue

    // Bedtime = first Screen-Off after the last evening unlock, else the unlock.
    let bed = gapStart
    for (const so of screenOffs) {
      if (so.ts > gapStart && so.ts < wake) { bed = so.ts; break }
    }

    const minutes = Math.round((wake.getTime() - bed.getTime()) / 60_000)
    const date = amsDate(wake)
    const prev = best.get(date)
    if (!prev || minutes > prev.minutes) best.set(date, { date, start: bed, end: wake, minutes })
  }
  return [...best.values()]
}

/** Recompute recent nights and upsert phone-derived sessions, never clobbering
 *  a real health-app session for the same date. */
async function refreshSleep(supabase: SupabaseClient): Promise<number> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from('phone_events')
    .select('ts,kind')
    .eq('user_id', USER_ID)
    .gte('ts', since)
    .order('ts', { ascending: true })
  if (error) throw error

  const events: PhoneEvent[] = (data ?? []).map((r) => ({ ts: new Date(r.ts as string), kind: r.kind as Kind }))
  // Explicit asleep/awake detection wins; the activity-gap heuristic only fills
  // nights that have no explicit session.
  const explicit = deriveExplicitSleep(events)
  const explicitDates = new Set(explicit.map((s) => s.date))
  const gap = deriveSleep(events).filter((s) => !explicitDates.has(s.date))
  const sessions = [...explicit, ...gap]
  if (!sessions.length) return 0

  // Skip any date that already has a real Samsung-Health session — real data wins.
  const dates = sessions.map((s) => s.date)
  const { data: existing } = await supabase
    .from('health_sleep')
    .select('date,source')
    .eq('user_id', USER_ID)
    .in('date', dates)
  const locked = new Set((existing ?? []).filter((r) => r.source === 'health_app').map((r) => r.date as string))

  const rows = sessions
    .filter((s) => !locked.has(s.date))
    .map((s) => ({
      user_id: USER_ID,
      date: s.date,
      start_time: s.start.toISOString(),
      end_time: s.end.toISOString(),
      // Phone inactivity can't resolve sleep stages, so the whole asleep window
      // goes in light_min (the app reads total = light+deep+rem). source='phone'
      // marks it an estimate.
      light_min: s.minutes,
      deep_min: 0,
      rem_min: 0,
      awake_min: 0,
      source: 'phone',
    }))
  if (!rows.length) return 0

  const { error: upErr } = await supabase
    .from('health_sleep')
    .upsert(rows, { onConflict: 'user_id,date', ignoreDuplicates: false })
  if (upErr) throw upErr
  return rows.length
}

/** Recompute recent days' unlock counts from `phone_events` and upsert into
 *  `screentime_daily.pickups` — the count is derived fresh each time (not
 *  incremented), so it's always exactly right regardless of retries/dupes. */
async function refreshPickups(supabase: SupabaseClient): Promise<number> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from('phone_events')
    .select('ts')
    .eq('user_id', USER_ID)
    .eq('kind', 'unlock')
    .gte('ts', since)
  if (error) throw error

  const byDate = new Map<string, number>()
  for (const r of data ?? []) {
    const date = amsDate(new Date(r.ts as string))
    byDate.set(date, (byDate.get(date) ?? 0) + 1)
  }
  const rows = [...byDate.entries()].map(([usage_date, pickups]) => ({ user_id: USER_ID, usage_date, pickups }))
  if (!rows.length) return 0

  const { error: upErr } = await supabase
    .from('screentime_daily')
    .upsert(rows, { onConflict: 'user_id,usage_date', ignoreDuplicates: false })
  if (upErr) throw upErr
  return rows.length
}

Deno.serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ ok: false, error: 'Method not allowed' }, 405)
  }

  // Validate shared secret. Fail CLOSED: an unset secret must not leave this
  // service-role endpoint open.
  const secret = req.headers.get('x-webhook-secret') ?? new URL(req.url).searchParams.get('secret') ?? ''
  if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
    return json({ ok: false, error: 'Unauthorized' }, 401)
  }

  // Kind + optional timestamp may arrive as a query param (simplest MacroDroid
  // GET) or a JSON body. Also accept a batch under `events`.
  const url = new URL(req.url)
  let body: { kind?: string; event?: string; ts?: string; events?: { kind?: string; ts?: string }[] } = {}
  if (req.method === 'POST') {
    try { body = await req.json() } catch { /* allow empty body + query params */ }
  }

  const rawEvents = body.events?.length
    ? body.events
    : [{ kind: body.kind ?? body.event ?? url.searchParams.get('kind') ?? url.searchParams.get('event'),
         ts: body.ts ?? url.searchParams.get('ts') ?? undefined }]

  const toInsert: { user_id: string; ts: string; kind: Kind }[] = []
  for (const e of rawEvents) {
    const kind = normalizeKind(e.kind)
    if (!kind) continue
    const ts = e.ts ? new Date(e.ts) : new Date()
    if (isNaN(ts.getTime())) continue
    toInsert.push({ user_id: USER_ID, ts: ts.toISOString(), kind })
  }

  if (!toInsert.length) {
    return json({ ok: false, error: 'No valid event (need kind=sleep_start|sleep_end|unlock|screen_off)' }, 400)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // ignoreDuplicates: a re-sent event (same user/ts/kind) is a no-op.
  const { error } = await supabase
    .from('phone_events')
    .upsert(toInsert, { onConflict: 'user_id,ts,kind', ignoreDuplicates: true })
  if (error) {
    console.error('phone_events insert error:', error)
    return json({ ok: false, error: error.message }, 500)
  }

  // Recompute sleep + pickups. A derivation hiccup must not fail the (already-stored) event.
  let sleepRows = 0
  try {
    sleepRows = await refreshSleep(supabase)
  } catch (err) {
    console.error('sleep derivation error:', err)
  }

  let pickupDays = 0
  try {
    pickupDays = await refreshPickups(supabase)
  } catch (err) {
    console.error('pickups derivation error:', err)
  }

  return json({ ok: true, logged: toInsert.length, sleep_sessions: sleepRows, pickup_days: pickupDays })
})
