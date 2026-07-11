/**
 * Supabase Edge Function: health-sheets-ingest
 * ---------------------------------------------
 * Receives POST from health-sheets.gs (Google Apps Script bound to your
 * Samsung Health export spreadsheet) and upserts into three Supabase tables:
 *   health_daily_stats  — steps, distance, calories, active duration
 *   health_body_metrics — weight, body fat
 *   health_sleep        — sleep sessions with stage breakdown
 *
 * Deploy:
 *   supabase functions deploy health-sheets-ingest --project-ref nhyunnnmdcmojvkxrbpl
 *
 * Secrets (set once):
 *   supabase secrets set \
 *     INGEST_SECRET=<same value as in Apps Script properties> \
 *     RICK_USER_ID=<your auth.users uuid> \
 *     --project-ref nhyunnnmdcmojvkxrbpl
 *
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SUPABASE_SERVICE_KEY, SUPABASE_URL, USER_ID, jsonResponder } from '../_shared/http.ts'

const INGEST_SECRET = Deno.env.get('INGEST_SECRET') ?? ''

const json = jsonResponder()

// ── Types matching the Apps Script payload ─────────────────────────────────

interface ActivityRow {
  date: string          // 'YYYY-MM-DD'
  steps: number
  distance_m: number
  calories_kcal: number
  duration_min: number
}

interface BodyRow {
  datetime: string      // ISO timestamp, e.g. '2026-06-28T12:00:00Z'
  weight_kg: number | null
  body_fat_pct: number | null
}

interface SleepRow {
  date: string          // 'YYYY-MM-DD'
  start_time: string | null
  end_time: string | null
  light_min: number
  deep_min: number
  rem_min: number
  awake_min: number
}

interface Payload {
  activity?: ActivityRow[]
  body?: BodyRow[]
  sleep?: SleepRow[]
}

// ── Handler ────────────────────────────────────────────────────────────────

/**
 * Postgres can't upsert two rows with the same ON CONFLICT key in one statement
 * ("cannot affect row a second time"). Collapse duplicates by key, keeping the
 * last occurrence, before sending the batch.
 */
function dedupeBy<T>(rows: T[], keyFn: (r: T) => string): T[] {
  const m = new Map<string, T>()
  for (const r of rows) m.set(keyFn(r), r)
  return [...m.values()]
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405)
  }

  // Validate shared secret
  const secret = req.headers.get('x-ingest-secret') ?? ''
  // Fail CLOSED: an unset secret must NOT leave this service-role endpoint open.
  if (!INGEST_SECRET || secret !== INGEST_SECRET) {
    return json({ ok: false, error: 'Unauthorized' }, 401)
  }

  let payload: Payload
  try {
    payload = await req.json()
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const counts = { activity: 0, body: 0, sleep: 0 }
  const errors: string[] = []

  // Denormalise sleep (asleep minutes per day) so health_daily_stats is a
  // self-contained daily row the app can read without joining health_sleep.
  const sleepMinByDate = new Map<string, number>()
  for (const s of payload.sleep ?? []) {
    sleepMinByDate.set(s.date, (s.light_min ?? 0) + (s.deep_min ?? 0) + (s.rem_min ?? 0))
  }

  // ── Activity → health_daily_stats ──────────────────────────────────────
  if (payload.activity?.length) {
    const rows = dedupeBy(payload.activity.map((r) => ({
      user_id:       USER_ID,
      date:          r.date,
      steps:         r.steps         ?? 0,
      distance_m:    r.distance_m    ?? 0,
      calories_kcal: r.calories_kcal ?? 0,
      duration_min:  r.duration_min  ?? 0,
      // active_min mirrors duration_min; sleep_min denormalised from health_sleep.
      active_min:    r.duration_min  ?? 0,
      sleep_min:     sleepMinByDate.get(r.date) ?? 0,
    })), (r) => r.date)

    const { error } = await supabase
      .from('health_daily_stats')
      .upsert(rows, { onConflict: 'user_id,date', ignoreDuplicates: false })

    if (error) {
      console.error('activity upsert error:', error)
      errors.push('activity: ' + error.message)
    } else {
      counts.activity = rows.length
    }
  }

  // ── Body metrics → health_body_metrics ────────────────────────────────
  if (payload.body?.length) {
    const rows = dedupeBy(
      payload.body
        .filter((r) => r.weight_kg != null || r.body_fat_pct != null)
        .map((r) => ({
          user_id:      USER_ID,
          datetime:     r.datetime,
          weight_kg:    r.weight_kg    ?? null,
          body_fat_pct: r.body_fat_pct ?? null,
        })),
      (r) => r.datetime,
    )

    if (rows.length) {
      const { error } = await supabase
        .from('health_body_metrics')
        .upsert(rows, { onConflict: 'user_id,datetime', ignoreDuplicates: false })

      if (error) {
        console.error('body upsert error:', error)
        errors.push('body: ' + error.message)
      } else {
        counts.body = rows.length
      }
    }
  }

  // ── Sleep → health_sleep ───────────────────────────────────────────────
  if (payload.sleep?.length) {
    const rows = dedupeBy(payload.sleep.map((r) => ({
      user_id:   USER_ID,
      date:      r.date,
      start_time: r.start_time ?? null,
      end_time:   r.end_time   ?? null,
      light_min:  r.light_min  ?? 0,
      deep_min:   r.deep_min   ?? 0,
      rem_min:    r.rem_min    ?? 0,
      awake_min:  r.awake_min  ?? 0,
      // Real Samsung-Health session — overwrites any phone-derived estimate for
      // this night (phone-events-ingest writes source='phone' and defers to this).
      source:     'health_app',
    })), (r) => r.date)

    const { error } = await supabase
      .from('health_sleep')
      .upsert(rows, { onConflict: 'user_id,date', ignoreDuplicates: false })

    if (error) {
      console.error('sleep upsert error:', error)
      errors.push('sleep: ' + error.message)
    } else {
      counts.sleep = rows.length
    }
  }

  if (errors.length) {
    return json({ ok: false, counts, errors }, 500)
  }

  return json({ ok: true, ...counts })
})
