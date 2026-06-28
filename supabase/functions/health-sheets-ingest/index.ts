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

const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const INGEST_SECRET        = Deno.env.get('INGEST_SECRET') ?? ''
const USER_ID              = Deno.env.get('RICK_USER_ID')!

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

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405)
  }

  // Validate shared secret
  const secret = req.headers.get('x-ingest-secret') ?? ''
  if (INGEST_SECRET && secret !== INGEST_SECRET) {
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

  // ── Activity → health_daily_stats ──────────────────────────────────────
  if (payload.activity?.length) {
    const rows = payload.activity.map((r) => ({
      user_id:       USER_ID,
      date:          r.date,
      steps:         r.steps         ?? 0,
      distance_m:    r.distance_m    ?? 0,
      calories_kcal: r.calories_kcal ?? 0,
      duration_min:  r.duration_min  ?? 0,
      // Leave sleep_min / avg_resting_hr / active_min untouched —
      // those come from the Fit sync (Code.gs) and we don't want to clobber them.
    }))

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
    const rows = payload.body
      .filter((r) => r.weight_kg != null || r.body_fat_pct != null)
      .map((r) => ({
        user_id:      USER_ID,
        datetime:     r.datetime,
        weight_kg:    r.weight_kg    ?? null,
        body_fat_pct: r.body_fat_pct ?? null,
      }))

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
    const rows = payload.sleep.map((r) => ({
      user_id:   USER_ID,
      date:      r.date,
      start_time: r.start_time ?? null,
      end_time:   r.end_time   ?? null,
      light_min:  r.light_min  ?? 0,
      deep_min:   r.deep_min   ?? 0,
      rem_min:    r.rem_min    ?? 0,
      awake_min:  r.awake_min  ?? 0,
    }))

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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
