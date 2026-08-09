/**
 * Supabase Edge Function: widget-tasks
 * -------------------------------------
 * Feeds two Android home-screen widgets (see /android):
 *   - the "To-do lijst" collection widget (full scrollable list)
 *   - the "Belangrijkste items" glance card (High-priority items only)
 * Both widgets call this same endpoint and slice the result differently on
 * the client — one function, one query, two presentations. Read-only GET +
 * a POST for the one interactive action the to-do widget needs: tapping a
 * row to toggle it done. Shared-secret gated, service-role, same convention
 * as widget-summary/walk-ingest.
 *
 *   request:  GET (no body)
 *   response: { ok: true, tasks: [{ id, title, domain, due, priority, notes }] }
 *             | { ok: false, error: "..." }
 *
 *   request:  POST { "id": "<task uuid>", "action": "toggle" }
 *   response: { ok: true, status: "open" | "done" } | { ok: false, error: "..." }
 *
 * Deploy:
 *   supabase functions deploy widget-tasks --project-ref nhyunnnmdcmojvkxrbpl
 *   (uses WIDGET_SUMMARY_SECRET, same as widget-summary — no new secret needed)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SUPABASE_SERVICE_KEY, SUPABASE_URL, USER_ID, jsonResponder } from '../_shared/http.ts'

const WEBHOOK_SECRET = Deno.env.get('WIDGET_SUMMARY_SECRET') ?? Deno.env.get('WALLET_WEBHOOK_SECRET') ?? ''
const MAX_TASKS = 40

const json = jsonResponder()

function checkSecret(req: Request): boolean {
  const url = new URL(req.url)
  const secret = req.headers.get('x-widget-secret') ?? url.searchParams.get('secret') ?? ''
  return !!WEBHOOK_SECRET && secret === WEBHOOK_SECRET
}

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405)
  }
  // Fail CLOSED: an unset secret must not leave this service-role endpoint open.
  if (!checkSecret(req)) return json({ ok: false, error: 'Unauthorized' }, 401)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  if (req.method === 'POST') {
    let body: { id?: string; action?: string }
    try {
      body = await req.json()
    } catch {
      return json({ ok: false, error: 'Invalid JSON body' }, 400)
    }
    const id = String(body.id ?? '')
    if (!id || body.action !== 'toggle') {
      return json({ ok: false, error: 'id and action=toggle are required' }, 400)
    }

    const { data: current, error: readErr } = await supabase
      .from('tasks')
      .select('status')
      .eq('id', id)
      .eq('user_id', USER_ID)
      .single()
    if (readErr || !current) return json({ ok: false, error: 'Task not found' }, 404)

    const nextStatus = current.status === 'done' ? 'open' : 'done'
    const { error: updateErr } = await supabase
      .from('tasks')
      .update({ status: nextStatus })
      .eq('id', id)
      .eq('user_id', USER_ID)
    if (updateErr) {
      console.error('widget-tasks toggle error:', updateErr)
      return json({ ok: false, error: updateErr.message }, 500)
    }
    return json({ ok: true, status: nextStatus })
  }

  const { data, error } = await supabase
    .from('tasks')
    .select('id,title,domain,due,priority,notes')
    .eq('user_id', USER_ID)
    .eq('status', 'open')
    .order('due', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(MAX_TASKS)
  if (error) {
    console.error('widget-tasks list error:', error)
    return json({ ok: false, error: error.message }, 500)
  }

  return json({ ok: true, tasks: data ?? [] })
})
