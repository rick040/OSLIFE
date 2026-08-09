/**
 * Supabase Edge Function: widget-calendar
 * -------------------------------------------
 * Feeds the Android "Agenda" home-screen widget: today's remaining
 * day_blocks (Google Calendar synced via the Apps Script integration — see
 * integrations/apps-script/Code.gs). Extends widget-summary's single
 * "next block" query into the full remaining list for the day. Read-only
 * GET, shared-secret gated, service-role — same convention as
 * widget-summary/widget-tasks.
 *
 *   request:  GET (no body)
 *   response: { ok: true, blocks: [{ id, title, startTime, endTime, description }] }
 *             | { ok: false, error: "..." }
 *
 * Deploy:
 *   supabase functions deploy widget-calendar --project-ref nhyunnnmdcmojvkxrbpl
 *   (uses WIDGET_SUMMARY_SECRET, same as widget-summary — no new secret needed)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SUPABASE_SERVICE_KEY, SUPABASE_URL, USER_ID, jsonResponder } from '../_shared/http.ts'
import { amsterdamToday } from '../_shared/dates.ts'

const WEBHOOK_SECRET = Deno.env.get('WIDGET_SUMMARY_SECRET') ?? Deno.env.get('WALLET_WEBHOOK_SECRET') ?? ''
const MAX_BLOCKS = 8

const json = jsonResponder()

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
  const nowTimeNL = new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/Amsterdam', hour12: false })

  const { data, error } = await supabase
    .from('day_blocks')
    .select('id, title, start_time, end_time, description')
    .eq('user_id', USER_ID)
    .eq('date', today)
    .neq('status', 'done')
    .order('start_time', { ascending: true, nullsFirst: false })
    .limit(MAX_BLOCKS)
  if (error) {
    console.error('widget-calendar query error:', error)
    return json({ ok: false, error: error.message }, 500)
  }

  // Already-passed blocks aren't useful on a glance widget — only what's left today.
  const remaining = (data ?? []).filter((b) => (b.end_time ?? b.start_time ?? '') >= nowTimeNL)

  return json({
    ok: true,
    blocks: remaining.map((b) => ({
      id: b.id,
      title: b.title,
      startTime: b.start_time,
      endTime: b.end_time,
      description: b.description,
    })),
  })
})
