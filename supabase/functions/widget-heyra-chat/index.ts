/**
 * Supabase Edge Function: widget-heyra-chat
 * ---------------------------------------------
 * Feeds the "HEYRA quick chat/voice" Android home-screen widget (see
 * /android): a one-off question in, one grounded reply out — no client-side
 * store to build a snapshot from (unlike the in-app agents in
 * src/heyra/agents/*.ts), so this function gathers a small, real snapshot of
 * today itself (open tasks, next calendar block, active projects) with the
 * service role and folds it into the same HEYRA voice/tone before calling
 * Anthropic directly. Shared-secret gated, same convention as the other
 * widget-* functions — deliberately NOT the user-JWT-gated heyra-brain proxy,
 * since a home-screen widget has no Supabase Auth session to attach.
 *
 *   request:  POST { "message": "..." }
 *   response: { ok: true, reply } | { ok: false, error: "..." }
 *
 * Deploy:
 *   supabase functions deploy widget-heyra-chat --project-ref nhyunnnmdcmojvkxrbpl
 *   (uses WIDGET_SUMMARY_SECRET, same as widget-summary — no new secret needed;
 *   also needs ANTHROPIC_API_KEY, already set for heyra-brain/braindump-ingest)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SUPABASE_SERVICE_KEY, SUPABASE_URL, USER_ID, jsonResponder } from '../_shared/http.ts'
import { amsterdamToday } from '../_shared/dates.ts'
import { ANTHROPIC_API, anthropicHeaders, extractText, MODEL } from '../_shared/anthropic.ts'

const WEBHOOK_SECRET = Deno.env.get('WIDGET_SUMMARY_SECRET') ?? Deno.env.get('WALLET_WEBHOOK_SECRET') ?? ''
const MAX_MESSAGE_LENGTH = 2000

const json = jsonResponder()

const SYSTEM_PROMPT =
  `Je bent HEYRA, de persoonlijke assistent binnen OSLIFE (Life OS) — dit is de korte "quick chat"-widget op het homescreen van de telefoon, dus antwoord kort, direct en bruikbaar (meestal 1-4 zinnen, langer alleen als de vraag dat echt vraagt). ` +
  `Je krijgt hieronder een korte, echte momentopname van vandaag (open taken, volgende agenda-afspraak, actieve projecten) — gebruik die als de vraag daar om vraagt, verzin nooit een naam, bedrag of datum die er niet in staat. ` +
  `Voor vragen die niets met deze data te maken hebben, antwoord je gewoon vanuit je eigen kennis. ` +
  `Schrijf Nederlands, informeel en direct, geen platte lopende alinea's als een paar korte zinnen sneller leesbaar zijn.`

async function buildSnapshot(supabase: ReturnType<typeof createClient>): Promise<string> {
  const today = amsterdamToday()
  const [tasksRes, blockRes, projectsRes] = await Promise.all([
    supabase
      .from('tasks')
      .select('title,due,priority')
      .eq('user_id', USER_ID)
      .eq('status', 'open')
      .order('due', { ascending: true, nullsFirst: false })
      .limit(10),
    supabase
      .from('day_blocks')
      .select('title,start_time')
      .eq('user_id', USER_ID)
      .eq('date', today)
      .neq('status', 'done')
      .not('start_time', 'is', null)
      .order('start_time', { ascending: true })
      .limit(1),
    supabase
      .from('projects')
      .select('name,client,deadline')
      .eq('user_id', USER_ID)
      .eq('archived', false)
      .eq('status', 'active')
      .order('deadline', { ascending: true, nullsFirst: false })
      .limit(8),
  ])

  const parts: string[] = [`Vandaag: ${today}`]

  const tasks = tasksRes.data ?? []
  parts.push(
    tasks.length
      ? `Open taken:\n${tasks.map((t) => `- ${t.title}${t.due ? ` (${t.due})` : ''}${t.priority ? ` [${t.priority}]` : ''}`).join('\n')}`
      : 'Open taken: geen.',
  )

  const nextBlock = blockRes.data?.[0]
  parts.push(nextBlock ? `Volgende agenda-afspraak: ${nextBlock.title} om ${String(nextBlock.start_time).slice(0, 5)}` : 'Geen agenda-afspraken meer vandaag.')

  const projects = projectsRes.data ?? []
  parts.push(
    projects.length
      ? `Actieve projecten:\n${projects.map((p) => `- ${p.name} (${p.client})${p.deadline ? ` — deadline ${p.deadline}` : ''}`).join('\n')}`
      : 'Actieve projecten: geen.',
  )

  return parts.join('\n\n')
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  // Fail CLOSED: an unset secret must not leave this service-role endpoint open.
  const url = new URL(req.url)
  const secret = req.headers.get('x-widget-secret') ?? url.searchParams.get('secret') ?? ''
  if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
    return json({ ok: false, error: 'Unauthorized' }, 401)
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ ok: false, error: 'ANTHROPIC_API_KEY secret is not set' }, 503)

  let body: { message?: string }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400)
  }
  const message = String(body.message ?? '').trim().slice(0, MAX_MESSAGE_LENGTH)
  if (!message) return json({ ok: false, error: 'message is required' }, 400)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const snapshot = await buildSnapshot(supabase)

  try {
    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: anthropicHeaders(apiKey),
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Momentopname van vandaag:\n${snapshot}\n\nVraag van Rick:\n"""\n${message}\n"""` }],
      }),
    })
    if (!res.ok) {
      const detail = await res.text()
      return json({ ok: false, error: `Anthropic ${res.status}: ${detail}` }, 502)
    }
    const data = await res.json()
    const reply = extractText(data.content)
    if (!reply) return json({ ok: false, error: 'Empty response from model' }, 502)
    return json({ ok: true, reply })
  } catch (err) {
    return json({ ok: false, error: `Anthropic call failed: ${String(err)}` }, 502)
  }
})
