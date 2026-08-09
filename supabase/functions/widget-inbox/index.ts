/**
 * Supabase Edge Function: widget-inbox
 * ---------------------------------------
 * Feeds the Android "Inbox" home-screen widget: unread email count plus the
 * most recent unread messages. Deliberately does NOT filter by the raw
 * `importance` column — src/views/Inbox.tsx's own comment notes that column
 * is unreliable (flags social/newsletter mail as high) and classifies
 * importance client-side instead via a sender/subject heuristic too
 * involved to duplicate here; "most recent unread" is the honest signal
 * available server-side. Read-only GET, shared-secret gated, service-role —
 * same convention as widget-summary/widget-tasks.
 *
 *   request:  GET (no body)
 *   response: { ok: true, unreadCount, recent: [{ id, from, subject, snippet, receivedAt }] }
 *             | { ok: false, error: "..." }
 *
 * Deploy:
 *   supabase functions deploy widget-inbox --project-ref nhyunnnmdcmojvkxrbpl
 *   (uses WIDGET_SUMMARY_SECRET, same as widget-summary — no new secret needed)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SUPABASE_SERVICE_KEY, SUPABASE_URL, USER_ID, jsonResponder } from '../_shared/http.ts'

const WEBHOOK_SECRET = Deno.env.get('WIDGET_SUMMARY_SECRET') ?? Deno.env.get('WALLET_WEBHOOK_SECRET') ?? ''
const MAX_RECENT = 5

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

  const [unreadCountRes, recentRes] = await Promise.all([
    supabase
      .from('gmail_messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', USER_ID)
      .eq('read', false),
    supabase
      .from('gmail_messages')
      .select('id, from_addr, subject, snippet, received_at')
      .eq('user_id', USER_ID)
      .eq('read', false)
      .order('received_at', { ascending: false })
      .limit(MAX_RECENT),
  ])

  const firstError = [unreadCountRes, recentRes].map((r) => r.error).find(Boolean)
  if (firstError) {
    console.error('widget-inbox query error:', firstError)
    return json({ ok: false, error: firstError.message }, 500)
  }

  return json({
    ok: true,
    unreadCount: unreadCountRes.count ?? 0,
    recent: (recentRes.data ?? []).map((m) => ({
      id: m.id,
      from: m.from_addr,
      subject: m.subject,
      snippet: m.snippet,
      receivedAt: m.received_at,
    })),
  })
})
