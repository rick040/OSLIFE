/**
 * Supabase Edge Function: screentime-app-ingest
 * ------------------------------------------------
 * Direct MacroDroid replacement for the Apps-Script "Schermtijd" webhook
 * (integrations/apps-script's doGet: Timestamp | App Name | State | Screen
 * Time). Same event shape — app name + Opened/Closed — logged straight to
 * Supabase instead of a spreadsheet row, with the duration computed here
 * instead of a sheet formula.
 *
 * Request (GET query params, or POST JSON body):
 *   app   — app name, e.g. "YouTube" (Magic Text from the MacroDroid trigger)
 *   state — "Opened" or "Closed" (aliases: open/start/launched, close/stop/end)
 *   ts    — optional ISO timestamp; defaults to now()
 *
 * Every event is stored raw in `screentime_events`. On every Closed, sessions
 * are re-derived from the raw log: a session runs from the most recent
 * unmatched Opened for that app to this Closed (not "the previous row" like
 * the sheet formula — this stays correct even if another app's events land in
 * between). Recomputing from raw on each call means a retried/duplicate event
 * never double-counts a session — same pattern phone-events-ingest uses for
 * sleep/pickups. Totals land in the existing `screentime` table, so the
 * frontend (fetchScreenDays) needs no changes.
 *
 * Auth: header x-webhook-secret OR query ?secret=, checked against
 * SCREENTIME_WEBHOOK_SECRET, falling back to PHONE_WEBHOOK_SECRET, then
 * WALLET_WEBHOOK_SECRET — same phone/MacroDroid app, no new secret required.
 *
 * Deploy:
 *   supabase functions deploy screentime-app-ingest --project-ref nhyunnnmdcmojvkxrbpl
 * Migration: supabase/migrations/20260725050000_screentime_app_events.sql
 * Setup: integrations/macrodroid/app-timer.md
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SUPABASE_SERVICE_KEY, SUPABASE_URL, USER_ID, jsonResponder } from '../_shared/http.ts'

const WEBHOOK_SECRET =
  Deno.env.get('SCREENTIME_WEBHOOK_SECRET') ??
  Deno.env.get('PHONE_WEBHOOK_SECRET') ??
  Deno.env.get('WALLET_WEBHOOK_SECRET') ??
  ''

const json = jsonResponder()

const LOOKBACK_DAYS = 4
const MAX_SESSION_H = 6 // a Closed this long after its Opened is a missed event, not a real session
const TZ = 'Europe/Amsterdam'

/** Amsterdam calendar date (YYYY-MM-DD) of an instant. */
function amsDate(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: TZ })
}

/** Same buckets the frontend uses (src/lib/supabase.ts classifyApp). Unknown apps are 'other'. */
function classifyApp(name: string): 'work' | 'social' | 'media' | 'comms' | 'other' {
  const n = name.toLowerCase()
  if (/whatsapp|instagram|snapchat|tinder|reddit|facebook|tiktok|discord|messenger|twitter|\bx\b|threads|bereal|linkedin/.test(n)) return 'social'
  if (/youtube|spotify|soundcloud|netflix|videoland|twitch|disney|prime video|podcast|muziek|music|film/.test(n)) return 'media'
  if (/gmail|\bmail\b|telefoon|phone|berichten|messages|\bsms\b|teams|outlook|signal|telegram/.test(n)) return 'comms'
  if (/docs|sheets|slides|word|excel|powerpoint|notion|figma|canva|code|github|gitlab|slack|drive|calendar|agenda|jira|linear|vscode|xcode|terminal/.test(n)) return 'work'
  return 'other'
}

/** Normalise the state MacroDroid sends (matches the old doGet's "Opened"/"Closed", plus aliases). */
function normalizeState(raw: string | null | undefined): 'Opened' | 'Closed' | null {
  const s = (raw ?? '').trim().toLowerCase()
  if (/^(opened|open|start|started|launch|launched)$/.test(s)) return 'Opened'
  if (/^(closed|close|stop|stopped|end|ended)$/.test(s)) return 'Closed'
  return null
}

/** Re-derive finished Opened→Closed sessions from `screentime_events` and
 *  upsert fresh per-day per-app totals into `screentime`. */
async function refreshAppScreentime(supabase: SupabaseClient): Promise<number> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from('screentime_events')
    .select('app_name,state,occurred_at')
    .eq('user_id', USER_ID)
    .gte('occurred_at', since)
    .order('occurred_at', { ascending: true })
  if (error) throw error

  const openAt = new Map<string, Date>()
  const byKey = new Map<string, { usage_date: string; app_name: string; category: string; ms: number }>()
  for (const r of data ?? []) {
    const app = r.app_name as string
    const ts = new Date(r.occurred_at as string)
    if (r.state === 'Opened') {
      openAt.set(app, ts) // a fresh Opened replaces a stale unmatched one (missed Close)
      continue
    }
    const opened = openAt.get(app)
    if (!opened) continue // Closed with no matching Opened — nothing to log
    openAt.delete(app)
    const hrs = (ts.getTime() - opened.getTime()) / 3_600_000
    if (hrs <= 0 || hrs > MAX_SESSION_H) continue
    const usage_date = amsDate(ts)
    const category = classifyApp(app)
    const key = `${usage_date}|${app}|${category}`
    const ms = ts.getTime() - opened.getTime()
    const cur = byKey.get(key)
    if (cur) cur.ms += ms
    else byKey.set(key, { usage_date, app_name: app, category, ms })
  }

  const rows = [...byKey.entries()].map(([dedup_key, v]) => ({
    user_id: USER_ID, usage_date: v.usage_date, app_name: v.app_name,
    duration_ms: v.ms, category: v.category, dedup_key,
  }))
  if (!rows.length) return 0

  const { error: upErr } = await supabase
    .from('screentime')
    .upsert(rows, { onConflict: 'user_id,dedup_key', ignoreDuplicates: false })
  if (upErr) throw upErr
  return rows.length
}

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405)
  }

  const url = new URL(req.url)
  // Fail CLOSED: an unset secret must not leave this service-role endpoint open.
  const secret = req.headers.get('x-webhook-secret') ?? url.searchParams.get('secret') ?? ''
  if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
    return json({ ok: false, error: 'Unauthorized' }, 401)
  }

  let body: { app?: string; state?: string; ts?: string } = {}
  if (req.method === 'POST') {
    try { body = await req.json() } catch { /* allow empty body + query params */ }
  }

  const app = (body.app ?? url.searchParams.get('app') ?? '').toString().trim().slice(0, 120)
  const state = normalizeState(body.state ?? url.searchParams.get('state'))
  if (!app || !state) {
    return json({ ok: false, error: 'Need app=<name> and state=Opened|Closed' }, 400)
  }
  const tsRaw = body.ts ?? url.searchParams.get('ts')
  const occurred = tsRaw ? new Date(tsRaw) : new Date()
  if (isNaN(occurred.getTime())) {
    return json({ ok: false, error: 'Invalid ts' }, 400)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { error } = await supabase
    .from('screentime_events')
    .upsert(
      { user_id: USER_ID, app_name: app, state, occurred_at: occurred.toISOString() },
      { onConflict: 'user_id,occurred_at,app_name,state', ignoreDuplicates: true },
    )
  if (error) {
    console.error('screentime_events insert error:', error)
    return json({ ok: false, error: error.message }, 500)
  }

  let screentimeRows = 0
  if (state === 'Closed') {
    try {
      screentimeRows = await refreshAppScreentime(supabase)
    } catch (err) {
      console.error('screentime derivation error:', err)
    }
  }
  return json({ ok: true, logged: 1, screentime_rows: screentimeRows })
})
