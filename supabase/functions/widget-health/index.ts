/**
 * Supabase Edge Function: widget-health
 * ---------------------------------------
 * Feeds the Android "Gezondheid" home-screen widget: today's steps/sleep/
 * active minutes, latest body weight, and habit completion — the same
 * pieces OSLIFE's web Dashboard "today" screen shows, condensed into one
 * glance card. Read-only GET, shared-secret gated, service-role — same
 * convention as widget-summary/widget-tasks.
 *
 *   request:  GET (no body)
 *   response: { ok: true, today: { steps, sleepMin, activeMin },
 *               weight: { kg, asOf } | null,
 *               habits: { doneToday, totalActive, bestStreakDays, bestStreakHabit } }
 *             | { ok: false, error: "..." }
 *
 * Deploy:
 *   supabase functions deploy widget-health --project-ref nhyunnnmdcmojvkxrbpl
 *   (uses WIDGET_SUMMARY_SECRET, same as widget-summary — no new secret needed)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SUPABASE_SERVICE_KEY, SUPABASE_URL, USER_ID, jsonResponder } from '../_shared/http.ts'
import { amsterdamToday } from '../_shared/dates.ts'

const WEBHOOK_SECRET = Deno.env.get('WIDGET_SUMMARY_SECRET') ?? Deno.env.get('WALLET_WEBHOOK_SECRET') ?? ''

const json = jsonResponder()

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
  if (!doneDates.has(cursor)) cursor = daysBeforeDate(today, 1)
  while (doneDates.has(cursor)) {
    streak += 1
    cursor = daysBeforeDate(cursor, 1)
  }
  return streak
}

function checkSecret(req: Request): boolean {
  const url = new URL(req.url)
  const secret = req.headers.get('x-widget-secret') ?? url.searchParams.get('secret') ?? ''
  return !!WEBHOOK_SECRET && secret === WEBHOOK_SECRET
}

Deno.serve(async (req) => {
  if (req.method !== 'GET') {
    return json({ ok: false, error: 'Method not allowed' }, 405)
  }
  if (!checkSecret(req)) return json({ ok: false, error: 'Unauthorized' }, 401)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const today = amsterdamToday()

  const [todayStatsRes, weightRes, habitsActiveRes, habitLogRes] = await Promise.all([
    supabase
      .from('health_daily_stats')
      .select('steps, sleep_min, active_min')
      .eq('user_id', USER_ID)
      .eq('date', today)
      .maybeSingle(),
    supabase
      .from('health_body_metrics')
      .select('weight_kg, datetime')
      .eq('user_id', USER_ID)
      .not('weight_kg', 'is', null)
      .order('datetime', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('habits').select('id, name').eq('user_id', USER_ID).eq('active', true),
    supabase
      .from('habit_log')
      .select('habit_id, on_date')
      .eq('user_id', USER_ID)
      .eq('done', true)
      .gte('on_date', daysBeforeDate(today, 30)),
  ])

  const firstError = [todayStatsRes, weightRes, habitsActiveRes, habitLogRes].map((r) => r.error).find(Boolean)
  if (firstError) {
    console.error('widget-health query error:', firstError)
    return json({ ok: false, error: firstError.message }, 500)
  }

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

  return json({
    ok: true,
    today: {
      steps: todayStatsRes.data?.steps ?? null,
      sleepMin: todayStatsRes.data?.sleep_min ?? null,
      activeMin: todayStatsRes.data?.active_min ?? null,
    },
    weight: weightRes.data ? { kg: weightRes.data.weight_kg, asOf: weightRes.data.datetime } : null,
    habits: {
      doneToday,
      totalActive: activeHabits.length,
      bestStreakDays,
      bestStreakHabit,
    },
  })
})
