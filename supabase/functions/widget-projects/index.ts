/**
 * Supabase Edge Function: widget-projects
 * -----------------------------------------
 * Feeds the "Actieve projecten" Android home-screen widget (see /android):
 * a short list of currently-active projects with progress/deadline, so the
 * widget doesn't need to reproduce any CRM logic. Read-only, service-role,
 * shared-secret gated — same convention as widget-summary/widget-tasks.
 *
 *   request:  GET (no body)
 *   response: { ok: true, projects: [{ id, name, client, progress, deadline,
 *                                       priority, domain }] }
 *             | { ok: false, error: "..." }
 *
 * Deploy:
 *   supabase functions deploy widget-projects --project-ref nhyunnnmdcmojvkxrbpl
 *   (uses WIDGET_SUMMARY_SECRET, same as widget-summary — no new secret needed)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SUPABASE_SERVICE_KEY, SUPABASE_URL, USER_ID, jsonResponder } from '../_shared/http.ts'

const WEBHOOK_SECRET = Deno.env.get('WIDGET_SUMMARY_SECRET') ?? Deno.env.get('WALLET_WEBHOOK_SECRET') ?? ''
const MAX_PROJECTS = 12

const json = jsonResponder()

Deno.serve(async (req) => {
  if (req.method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405)

  // Fail CLOSED: an unset secret must not leave this service-role endpoint open.
  const url = new URL(req.url)
  const secret = req.headers.get('x-widget-secret') ?? url.searchParams.get('secret') ?? ''
  if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
    return json({ ok: false, error: 'Unauthorized' }, 401)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { data, error } = await supabase
    .from('projects')
    .select('id,name,client,domain,deadline,progress,prioriteit')
    .eq('user_id', USER_ID)
    .eq('archived', false)
    .eq('status', 'active')
    .order('deadline', { ascending: true, nullsFirst: false })
    .limit(MAX_PROJECTS)
  if (error) {
    console.error('widget-projects list error:', error)
    return json({ ok: false, error: error.message }, 500)
  }

  const projects = (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    client: p.client,
    domain: p.domain,
    deadline: p.deadline,
    progress: p.progress ?? 0,
    priority: p.prioriteit ?? null,
  }))

  return json({ ok: true, projects })
})
