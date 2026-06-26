import { createClient } from '@supabase/supabase-js'
import type {
  HealthDay,
  Transaction,
  EmailItem,
  MeetingDay,
  Domain,
  ScreenDay,
  LocationDay,
  MusicDay,
  Habit,
  Subscription,
  Goal,
  DogEntry,
  Block,
  Thread,
  Pattern,
} from '../types'
import { TODAY } from '../domains'

const SUPABASE_URL = 'https://lgwowurhqtdbukcpwkex.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxnd293dXJocXRkYnVrY3B3a2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTc5NzMsImV4cCI6MjA5NTM5Mzk3M30.u4cc2-eEQ3Ncj0OQI1Prrs_k3CDNNXTUtbR2520mZow'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── Helpers ───────────────────────────────────────────────────────────────────

function inferTxDomain(counterparty: string, description: string): Domain {
  const t = (counterparty + ' ' + description).toLowerCase()
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

function blockTypeToDomain(blockType: string): Domain {
  if (/parkingyou/i.test(blockType)) return 'parkingyou'
  if (/prjct/i.test(blockType)) return 'prjct'
  return 'personal'
}

function toHHMM(t: string | null | undefined): string {
  if (!t) return '00:00'
  return t.slice(0, 5)
}

// ── Health ────────────────────────────────────────────────────────────────────

export async function fetchHealthDays(): Promise<HealthDay[]> {
  const { data } = await supabase
    .from('health_daily_stats')
    .select('date,steps,sleep_min,avg_resting_hr,active_min')
    .order('date', { ascending: false })
    .limit(90)

  return (data ?? []).map((r) => ({
    date: r.date as string,
    steps: (r.steps as number) ?? 0,
    stepGoal: 8000,
    sleepHours: Math.round(((r.sleep_min as number) ?? 0) / 60 * 10) / 10,
    restingHR: (r.avg_resting_hr as number) ?? 0,
    activeMinutes: (r.active_min as number) ?? 0,
    energy: 3,
    mood: 3,
  }))
}

// ── Finance ───────────────────────────────────────────────────────────────────

export async function fetchTransactions(): Promise<Transaction[]> {
  const { data } = await supabase
    .from('finance_tx')
    .select('id,occurred_on,amount,counterparty,description')
    .order('occurred_on', { ascending: false })
    .limit(300)

  return (data ?? []).map((r) => ({
    id: r.id as string,
    date: r.occurred_on as string,
    amount: (r.amount as number) ?? 0,
    merchant: (r.counterparty as string) || (r.description as string) || '',
    category: 'other',
    domain: inferTxDomain((r.counterparty as string) ?? '', (r.description as string) ?? ''),
  }))
}

export async function fetchSubscriptions(): Promise<Subscription[]> {
  const { data } = await supabase
    .from('subscriptions')
    .select('id,name,amount,cadence,next_charge_on,active,notes')
    .order('name')

  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    amount: (r.amount as number) ?? 0,
    cadence: (r.cadence as Subscription['cadence']) ?? 'monthly',
    nextCharge: (r.next_charge_on as string) ?? null,
    active: (r.active as boolean) ?? true,
    category: 'other',
    domain: 'personal' as Domain,
    notes: (r.notes as string) ?? undefined,
  }))
}

// ── Email / Inbox ─────────────────────────────────────────────────────────────

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
    domain: inferEmailDomain((r.labels as string[]) ?? []),
  }))
}

// ── Calendar / Meeting days ───────────────────────────────────────────────────

export async function fetchMeetingDays(): Promise<MeetingDay[]> {
  const { data } = await supabase
    .from('day_blocks')
    .select('date,start_time,end_time,title')
    .order('date', { ascending: false })
    .limit(300)

  const byDate = new Map<string, MeetingDay>()
  for (const ev of data ?? []) {
    const date = ev.date as string
    if (!date) continue
    const [sh, sm] = toHHMM(ev.start_time as string).split(':').map(Number)
    const [eh, em] = toHHMM(ev.end_time as string).split(':').map(Number)
    const mins = Math.max(0, eh * 60 + em - (sh * 60 + sm))
    const existing = byDate.get(date)
    if (existing) {
      existing.count++
      existing.minutes += mins
      if (existing.count >= 3) existing.fragmented = true
    } else {
      byDate.set(date, { date, count: 1, minutes: mins, fragmented: false })
    }
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
}

export async function fetchBlocks(): Promise<Block[]> {
  const { data } = await supabase
    .from('day_blocks')
    .select('id,start_time,end_time,title,description,block_type,status')
    .eq('date', TODAY)
    .order('start_time')

  return (data ?? []).map((r) => ({
    id: r.id as string,
    title: r.title as string,
    domain: blockTypeToDomain((r.block_type as string) ?? ''),
    start: toHHMM(r.start_time as string),
    end: toHHMM(r.end_time as string),
    status: ((r.status as string) ?? 'planned') as Block['status'],
    rationale: (r.description as string) ?? '',
  }))
}

// ── Habits ────────────────────────────────────────────────────────────────────

export async function fetchHabits(): Promise<Habit[]> {
  const { data: habitRows } = await supabase
    .from('habits')
    .select('id,name,icon,color')
    .eq('active', true)
    .order('order_idx')

  if (!habitRows?.length) return []

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const since = thirtyDaysAgo.toISOString().slice(0, 10)

  const { data: logRows } = await supabase
    .from('habit_log')
    .select('habit_id,on_date,done')
    .gte('on_date', since)
    .eq('done', true)

  const logByHabit = new Map<string, Set<string>>()
  for (const l of logRows ?? []) {
    const hid = l.habit_id as string
    if (!logByHabit.has(hid)) logByHabit.set(hid, new Set())
    logByHabit.get(hid)!.add(l.on_date as string)
  }

  return habitRows.map((h) => {
    const datesSet = logByHabit.get(h.id as string) ?? new Set<string>()
    const history = [...datesSet].sort()
    const doneToday = datesSet.has(TODAY)

    // Compute streak: consecutive days ending today (or yesterday)
    let streak = 0
    const check = new Date(TODAY)
    for (let i = 0; i < 30; i++) {
      const d = check.toISOString().slice(0, 10)
      if (datesSet.has(d)) {
        streak++
        check.setDate(check.getDate() - 1)
      } else {
        break
      }
    }

    return {
      id: h.id as string,
      name: h.name as string,
      emoji: (h.icon as string) ?? '✅',
      color: (h.color as string) ?? undefined,
      streak,
      doneToday,
      history,
    }
  })
}

// ── Goals ─────────────────────────────────────────────────────────────────────

export async function fetchGoals(): Promise<Goal[]> {
  const { data } = await supabase
    .from('goals')
    .select('id,title,domain,target_value,unit,due_on,progress')
    .in('status', ['active'])

  return (data ?? []).map((r) => {
    const target = (r.target_value as number) ?? 0
    const progress = (r.progress as number) ?? 0
    return {
      id: r.id as string,
      title: r.title as string,
      metric: (r.unit as string) ?? '',
      target,
      current: Math.round(progress * target),
      deadline: (r.due_on as string) ?? '',
      domain: ((r.domain as Domain) ?? 'personal'),
    }
  })
}

// ── Dog tracker ───────────────────────────────────────────────────────────────

export async function fetchDogEntries(): Promise<DogEntry[]> {
  const { data } = await supabase
    .from('dog_log')
    .select('id,kind,happened_at,duration_min,distance_km,notes')
    .order('happened_at', { ascending: false })
    .limit(100)

  return (data ?? []).map((r) => ({
    id: r.id as string,
    kind: r.kind as DogEntry['kind'],
    at: r.happened_at as string,
    durationMin: (r.duration_min as number) ?? null,
    distanceKm: (r.distance_km as number) ?? null,
    note: (r.notes as string) ?? null,
  }))
}

// ── Brain state (threads + patterns) ─────────────────────────────────────────

export async function fetchBrainState(): Promise<{ threads: Thread[]; patterns: Pattern[] }> {
  const { data } = await supabase
    .from('brain_state')
    .select('threads,patterns')
    .limit(1)
    .maybeSingle()

  return {
    threads: (data?.threads as Thread[]) ?? [],
    patterns: (data?.patterns as Pattern[]) ?? [],
  }
}

// ── Screen time (if available) ────────────────────────────────────────────────

export async function fetchScreenDays(): Promise<ScreenDay[]> {
  const { data } = await supabase
    .from('screentime')
    .select('usage_date,app_name,duration_ms')
    .order('usage_date', { ascending: false })
    .limit(500)

  const byDate = new Map<string, { totalMs: number; apps: Map<string, number> }>()
  for (const r of data ?? []) {
    const date = r.usage_date as string
    const ms = (r.duration_ms as number) ?? 0
    const app = (r.app_name as string) ?? 'Unknown'
    const existing = byDate.get(date)
    if (existing) {
      existing.totalMs += ms
      existing.apps.set(app, (existing.apps.get(app) ?? 0) + ms)
    } else {
      const apps = new Map<string, number>()
      apps.set(app, ms)
      byDate.set(date, { totalMs: ms, apps })
    }
  }

  return Array.from(byDate.entries()).map(([date, d]) => ({
    date,
    totalMinutes: Math.round(d.totalMs / 60000),
    pickups: 0,
    focusMinutes: 0,
    distractMinutes: 0,
    topApps: [...d.apps.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, ms]) => ({ name, minutes: Math.round(ms / 60000), category: 'work' as const })),
  }))
}

export async function fetchLocationDays(): Promise<LocationDay[]> {
  const { data } = await supabase
    .from('location_visits')
    .select('date,place_name,place_type,start_at,end_at')
    .order('date', { ascending: false })
    .limit(300)

  const byDate = new Map<string, LocationDay>()
  for (const r of data ?? []) {
    const date = r.date as string
    const start = new Date(r.start_at as string)
    const end = r.end_at ? new Date(r.end_at as string) : start
    const mins = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
    const place = (r.place_name as string) ?? 'Unknown'
    const type = (r.place_type as string) ?? ''

    const existing = byDate.get(date)
    if (existing) {
      if (/home|thuis/i.test(type)) existing.timeHome += mins
      else existing.timeOut += mins
      existing.places.push({ name: place, domain: 'personal', minutes: mins })
    } else {
      const timeHome = /home|thuis/i.test(type) ? mins : 0
      byDate.set(date, {
        date,
        timeHome,
        timeOut: timeHome ? 0 : mins,
        timeCommute: 0,
        distanceKm: 0,
        places: [{ name: place, domain: 'personal', minutes: mins }],
      })
    }
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
}

export async function fetchMusicDays(): Promise<MusicDay[]> {
  // Spotify history not yet synced to Supabase — return empty
  return []
}
