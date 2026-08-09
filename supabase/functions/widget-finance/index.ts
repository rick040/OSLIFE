/**
 * Supabase Edge Function: widget-finance
 * -----------------------------------------
 * Feeds the Android "Financiën" home-screen widget: current balance
 * (drift-corrected the same way the web app's Money screen computes it —
 * see src/finance/balance.ts::computeBalance, ported here) plus open/urgent
 * payments. Read-only GET, shared-secret gated, service-role — same
 * convention as widget-summary/widget-tasks.
 *
 *   request:  GET (no body)
 *   response: { ok: true, balance, balanceAsOf,
 *               openPayments: { count, totalAmount }, urgentCount }
 *             | { ok: false, error: "..." }
 *
 * Deploy:
 *   supabase functions deploy widget-finance --project-ref nhyunnnmdcmojvkxrbpl
 *   (uses WIDGET_SUMMARY_SECRET, same as widget-summary — no new secret needed)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SUPABASE_SERVICE_KEY, SUPABASE_URL, USER_ID, jsonResponder } from '../_shared/http.ts'

const WEBHOOK_SECRET = Deno.env.get('WIDGET_SUMMARY_SECRET') ?? Deno.env.get('WALLET_WEBHOOK_SECRET') ?? ''
const OPENING_BALANCE = 0

const json = jsonResponder()

function round2(n: number): number {
  return Math.round(n * 100) / 100
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

  const [checkpointRes, openPaymentsRes] = await Promise.all([
    supabase
      .from('balance_checkpoints')
      .select('amount, as_of')
      .eq('user_id', USER_ID)
      .order('as_of', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('payments')
      .select('amount, urgent')
      .eq('user_id', USER_ID)
      .eq('status', 'open'),
  ])

  const firstError = [checkpointRes, openPaymentsRes].map((r) => r.error).find(Boolean)
  if (firstError) {
    console.error('widget-finance query error:', firstError)
    return json({ ok: false, error: firstError.message }, 500)
  }

  const checkpoint = checkpointRes.data
  // Transactions after the checkpoint (or all-time if no checkpoint yet) — same
  // drift-correction as computeBalance() in the web app. Category is filtered
  // client-side, not via .neq() in the query: Postgres/PostgREST's <> follows
  // SQL NULL semantics, so a `.neq('category', ...)` filter would silently drop
  // every row with a null category instead of keeping it.
  let txQuery = supabase.from('finance_tx').select('amount, category').eq('user_id', USER_ID)
  if (checkpoint) txQuery = txQuery.gt('occurred_on', checkpoint.as_of)
  const txRes = await txQuery
  if (txRes.error) {
    console.error('widget-finance tx query error:', txRes.error)
    return json({ ok: false, error: txRes.error.message }, 500)
  }

  const realTx = (txRes.data ?? []).filter((t) => (t.category ?? '').toLowerCase() !== 'internal transfer')
  const txSum = realTx.reduce((sum, t) => sum + (t.amount ?? 0), 0)
  const balance = checkpoint ? checkpoint.amount + txSum : OPENING_BALANCE + txSum

  const openPayments = openPaymentsRes.data ?? []
  const urgentCount = openPayments.filter((p) => p.urgent).length

  return json({
    ok: true,
    balance: round2(balance),
    balanceAsOf: checkpoint?.as_of ?? null,
    openPayments: {
      count: openPayments.length,
      totalAmount: round2(openPayments.reduce((sum, p) => sum + (p.amount ?? 0), 0)),
    },
    urgentCount,
  })
})
