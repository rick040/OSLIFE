/**
 * Supabase Edge Function: widget-summary
 * ---------------------------------------
 * Feeds the Android home-screen widget (see /android, DailyGlanceWidgetProvider)
 * one aggregated "today at a glance" snapshot: last dog walk, open tasks,
 * habit completion, and the next calendar block. Read-only, service-role,
 * shared-secret gated — same convention as walk-ingest/geofence-ingest.
 *
 *   request:  GET  (no body)
 *   response: { ok: true, asOf, dog: {...}, tasks: {...}, habits: {...}, calendar: {...} }
 *             | { ok: false, error: "..." }
 *
 * Deploy:
 *   supabase functions deploy widget-summary --project-ref nhyunnnmdcmojvkxrbpl
 *   supabase secrets set WIDGET_SUMMARY_SECRET=<random 32+ char secret> --project-ref nhyunnnmdcmojvkxrbpl
 *   (falls back to WALLET_WEBHOOK_SECRET if unset — same convention as the
 *   other single-phone/single-device endpoints.)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SUPABASE_SERVICE_KEY, SUPABASE_URL, USER_ID, jsonResponder } from '../_shared/http.ts'
import { amsterdamToday } from '../_shared/dates.ts'

const WEBHOOK_SECRET = Deno.env.get('WIDGET_SUMMARY_SECRET') ?? Deno.env.get('WALLET_WEBHOOK_SECRET') ?? ''

const json = jsonResponder()

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** YYYY-MM-DD that is `n` days before `today` (plain date arithmetic, no TZ lib needed). */
function daysBeforeDate(today: string, n: number): string {
  const d = new Date(today + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

/** Longest run of consecutive `done` dates in `doneDates`, ending on `today` or `yesterday`. */
function currentStreak(doneDates: Set<string>, today: string): number {
  let streak = 0
  let cursor = today
  // A streak "counts" even if today isn't logged yet, as long as yesterday was.
  if (!doneDates.has(cursor)) cursor = daysBeforeDate(today, 1)
  while (doneDates.has(cursor)) {
    streak += 1
    cursor = daysBeforeDate(cursor, 1)
  }
  return streak
}

Deno.serve(async (req) => {
  if (req.method !== 'GET') {
    return json({ ok: false, error: 'Method not allowed' }, 405)
  }

  // Fail CLOSED: an unset secret must not leave this service-role endpoint open.
  const secret = req.headers.get('x-widget-secret') ?? new URL(req.url).searchParams.get('secret') ?? ''
  if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
    return json({ ok: false, error: 'Unauthorized' }, 401)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const today = amsterdamToday()
  const startOfToday = `${today}T00:00:00.000Z`
  const nowTimeNL = new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/Amsterdam', hour12: false })

  const [lastWalkRes, walksTodayRes, tasksOpenRes, tasksDueRes, habitsActiveRes, habitLogRes, nextBlockRes] =
    await Promise.all([
      supabase
        .from('dog_log')
        .select('happened_at')
        .eq('user_id', USER_ID)
        .eq('kind', 'walk')
        .order('happened_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('dog_log')
        .select('distance_km')
        .eq('user_id', USER_ID)
        .eq('kind', 'walk')
        .gte('happened_at', startOfToday),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('user_id', USER_ID).eq('status', 'open'),
      supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', USER_ID)
        .eq('status', 'open')
        .lte('due', today),
      supabase.from('habits').select('id, name').eq('user_id', USER_ID).eq('active', true),
      supabase
        .from('habit_log')
        .select('habit_id, on_date')
        .eq('user_id', USER_ID)
        .eq('done', true)
        .gte('on_date', daysBeforeDate(today, 30)),
      supabase
        .from('day_blocks')
        .select('title, start_time, status')
        .eq('user_id', USER_ID)
        .eq('date', today)
        .neq('status', 'done')
        .not('start_time', 'is', null)
        .order('start_time', { ascending: true }),
    ])

  const firstError = [lastWalkRes, walksTodayRes, tasksOpenRes, tasksDueRes, habitsActiveRes, habitLogRes, nextBlockRes]
    .map((r) => r.error)
    .find(Boolean)
  if (firstError) {
    console.error('widget-summary query error:', firstError)
    return json({ ok: false, error: firstError.message }, 500)
  }

  const walksTodayRows = walksTodayRes.data ?? []
  const activeHabits = habitsActiveRes.data ?? []
  const doneByHabit = new Map<string, Set<string>>()
  for (const row of habitLogRes.data ?? []) {
    const set = doneByHabit.get(row.habit_id) ?? new Set<string>()
    set.add(row.on_date)
    doneByHabit.set(row.habit_id, set)
  }

  let doneToday = 0
  let bestStreakDays = 0
  let bestStreakHabit: string | null = null
  for (const habit of activeHabits) {
    const doneDates = doneByHabit.get(habit.id) ?? new Set<string>()
    if (doneDates.has(today)) doneToday += 1
    const streak = currentStreak(doneDates, today)
    if (streak > bestStreakDays) {
      bestStreakDays = streak
      bestStreakHabit = habit.name
    }
  }

  const nextBlock = (nextBlockRes.data ?? []).find((b) => (b.start_time ?? '') >= nowTimeNL) ?? null

  return json({
    ok: true,
    asOf: new Date().toISOString(),
    dog: {
      lastWalkAt: lastWalkRes.data?.happened_at ?? null,
      walksToday: walksTodayRows.length,
      distanceTodayKm: round2(walksTodayRows.reduce((sum, r) => sum + (r.distance_km ?? 0), 0)),
    },
    tasks: {
      dueToday: tasksDueRes.count ?? 0,
      openTotal: tasksOpenRes.count ?? 0,
    },
    habits: {
      doneToday,
      totalActive: activeHabits.length,
      bestStreakDays,
      bestStreakHabit,
    },
    calendar: {
      nextTitle: nextBlock?.title ?? null,
      nextStart: nextBlock?.start_time ?? null,
    },
  })
})
