import { createClient } from '@supabase/supabase-js'
import type { HealthDay, Transaction, EmailItem, MeetingDay, Domain } from '../types'

export const supabase = createClient(
  'https://lgwowurhqtdbukcpwkex.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxnd293dXJocXRkYnVrY3B3a2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTc5NzMsImV4cCI6MjA5NTM5Mzk3M30.u4cc2-eEQ3Ncj0OQI1Prrs_k3CDNNXTUtbR2520mZow',
)

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractMerchant(description: string, counterparty: string): string {
  const gp = description.match(/Google Pay\s+([^,]+)/i)
  if (gp) return gp[1].trim()
  const bea = description.match(/^(?:BEA|GEA),\s+(.+?)(?:,PAS|\s+NR:|$)/i)
  if (bea) return bea[1].trim()
  return (counterparty || description).slice(0, 50)
}

function inferTxCategory(description: string): string {
  if (/jumbo|albert heijn|lidl|dirk|ah\b|supermarkt/i.test(description)) return 'groceries'
  if (/thuisbezorgd|uber eats|mcdonalds|subway|febo|domino/i.test(description)) return 'takeout'
  if (/shell|esso|bp |total energie|q8|tank/i.test(description)) return 'fuel'
  if (/google|apple|spotify|netflix|adobe|anthropic/i.test(description)) return 'software'
  if (/^GEA/i.test(description)) return 'atm'
  return 'other'
}

function inferTxDomain(description: string, counterparty: string): Domain {
  const t = (description + ' ' + counterparty).toLowerCase()
  if (/parkingyou|parking you/i.test(t)) return 'parkingyou'
  if (/prjct|buurtkaart/i.test(t)) return 'prjct'
  return 'personal'
}

function inferEmailDomain(labels: string[]): Domain {
  const l = labels.join(' ')
  if (/parkingyou|🅿️/i.test(l)) return 'parkingyou'
  if (/prjct|buurtkaart/i.test(l)) return 'prjct'
  return 'personal'
}

// ── Fetch functions ───────────────────────────────────────────────────────────

export async function fetchHealthDays(): Promise<HealthDay[]> {
  const [{ data: hRows }, { data: sRows }] = await Promise.all([
    supabase
      .from('health_daily_stats')
      .select('date,steps,active_min,avg_resting_hr')
      .order('date', { ascending: false })
      .limit(90),
    supabase
      .from('hc_sleep')
      .select('date,duration_minutes')
      .order('date', { ascending: false })
      .limit(90),
  ])

  const sleepByDate = new Map<string, number>()
  for (const s of sRows ?? []) sleepByDate.set(s.date as string, ((s.duration_minutes as number) ?? 0) / 60)

  return (hRows ?? []).map((r) => ({
    date: r.date as string,
    steps: (r.steps as number) ?? 0,
    stepGoal: 10000,
    sleepHours: Math.round(((sleepByDate.get(r.date as string) ?? 0)) * 10) / 10,
    restingHR: (r.avg_resting_hr as number) ?? 0,
    activeMinutes: (r.active_min as number) ?? 0,
    energy: 0, // populated from dayLogs in Reflect
    mood: 0,
  }))
}

export async function fetchTransactions(): Promise<Transaction[]> {
  const { data } = await supabase
    .from('finance_tx')
    .select('id,occurred_on,amount,description,counterparty')
    .order('occurred_on', { ascending: false })
    .limit(300)

  return (data ?? []).map((r) => ({
    id: r.id as string,
    date: r.occurred_on as string,
    amount: parseFloat(r.amount as string),
    merchant: extractMerchant((r.description as string) ?? '', (r.counterparty as string) ?? ''),
    category: inferTxCategory((r.description as string) ?? ''),
    domain: inferTxDomain((r.description as string) ?? '', (r.counterparty as string) ?? ''),
  }))
}

export async function fetchEmails(): Promise<EmailItem[]> {
  const { data } = await supabase
    .from('gmail_messages')
    .select('id,from_addr,subject,snippet,received_at,read,importance,labels')
    .order('received_at', { ascending: false })
    .limit(50)

  return (data ?? []).map((r) => ({
    id: r.id as string,
    from: (r.from_addr as string) ?? '',
    subject: (r.subject as string) ?? '',
    snippet: (r.snippet as string) ?? '',
    receivedAt: r.received_at as string,
    unread: !(r.read as boolean),
    important: (r.importance as string) === 'high',
    domain: inferEmailDomain(Array.isArray(r.labels) ? (r.labels as string[]) : []),
  }))
}

export async function fetchMeetingDays(): Promise<MeetingDay[]> {
  const { data } = await supabase
    .from('calendar_events')
    .select('title,starts_at,ends_at,all_day')
    .eq('all_day', false)
    .order('starts_at', { ascending: false })
    .limit(300)

  const byDate = new Map<string, MeetingDay>()
  for (const ev of data ?? []) {
    if (ev.all_day) continue
    const start = new Date(ev.starts_at as string)
    const end = new Date(ev.ends_at as string)
    // Amsterdam summer = UTC+2
    const localDate = new Date(start.getTime() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const mins = Math.round((end.getTime() - start.getTime()) / 60000)
    const existing = byDate.get(localDate)
    if (existing) {
      existing.count++
      existing.minutes += mins
      if (existing.count >= 3) existing.fragmented = true
    } else {
      byDate.set(localDate, { date: localDate, count: 1, minutes: mins, fragmented: false })
    }
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
}
