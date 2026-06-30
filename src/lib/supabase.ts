import { createClient } from '@supabase/supabase-js'
import type {
  HealthDay,
  Checkin,
  Transaction,
  EmailItem,
  MeetingDay,
  Domain,
  ScreenDay,
  Habit,
  Subscription,
  Goal,
  DogEntry,
  Block,
  Thread,
  Pattern,
  Project,
  ProjectStatus,
  Client,
  ClientStatus,
  Payment,
} from '../types'
import { TODAY } from '../domains'

// New oslife project (nhyunnnmdcmojvkxrbpl, eu-west-1).
// Set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in .env.local
// (Supabase dashboard → nhyunnnmdcmojvkxrbpl → Settings → API → anon/public key)
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://nhyunnnmdcmojvkxrbpl.supabase.co'
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oeXVubm5tZGNtb2p2a3hyYnBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1ODEwODYsImV4cCI6MjA5ODE1NzA4Nn0.EYFZE70CP9HOavDELNcSdalcf-sx6RMtktQFvawWnBE'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── Write-back layer ────────────────────────────────────────────────────────────
// The app reads live data and updates the UI optimistically; these helpers push
// those mutations back to Supabase so they survive reloads and sync across devices.
// RLS scopes every row to auth.uid(); inserts must therefore set user_id.

let cachedUserId: string | null = null

/** Current authenticated user id (cached). Null when signed out → writes are skipped. */
export async function currentUserId(): Promise<string | null> {
  if (cachedUserId) return cachedUserId
  const { data } = await supabase.auth.getUser()
  cachedUserId = data.user?.id ?? null
  return cachedUserId
}

// Reset the cache on auth changes so a re-login can't write under a stale id.
supabase.auth.onAuthStateChange((_e, session) => {
  cachedUserId = session?.user?.id ?? null
})

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** True for real Supabase row ids — distinguishes live rows from local/seeded ones. */
export const isDbId = (id: string): boolean => UUID_RE.test(id)

function warnWrite(label: string, error: unknown): void {
  if (error) console.warn(`[OSLIFE] write failed: ${label}`, error)
}

// ── Brain state (threads + patterns) — one jsonb row per user ───────────────────

export async function persistBrainState(threads: Thread[], patterns: Pattern[]): Promise<void> {
  const user_id = await currentUserId()
  if (!user_id) return
  const { error } = await supabase
    .from('brain_state')
    .upsert({ user_id, threads, patterns, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  warnWrite('brain_state', error)
}

// ── Payments ────────────────────────────────────────────────────────────────────

export async function persistPaymentStatus(id: string, status: Payment['status']): Promise<void> {
  if (!isDbId(id)) return
  const { error } = await supabase.from('payments').update({ status }).eq('id', id)
  warnWrite('payments.status', error)
}

// ── Finance: ABN AMRO CSV import ──────────────────────────────────────────────
// Persists imported bank transactions to finance_tx. The dedup_key matches the
// one payments-sheet-ingest uses (`date|amount`), so a purchase already logged
// via the Betalingen Google Sheet is NOT duplicated (ignoreDuplicates keeps the
// existing row). Returns the number of NEW rows actually inserted.
export async function insertFinanceTx(txns: Transaction[]): Promise<number> {
  const user_id = await currentUserId()
  if (!user_id || !txns.length) return 0
  const rows = txns.map((t) => ({
    user_id,
    occurred_on: t.date,
    amount: t.amount,
    counterparty: t.merchant,
    description: '',
    category: t.category,
    domain: t.domain,
    source: 'abn_csv',
    payment_method: 'unknown',
    dedup_key: `${t.date}|${t.amount.toFixed(2)}`,
  }))
  const { error, count } = await supabase
    .from('finance_tx')
    .upsert(rows, { onConflict: 'user_id,dedup_key', ignoreDuplicates: true, count: 'exact' })
  warnWrite('finance_tx.import', error)
  return count ?? 0
}

// ── Email / Inbox ─────────────────────────────────────────────────────────────

export async function persistEmailRead(id: string, read: boolean): Promise<void> {
  if (!isDbId(id)) return
  const { error } = await supabase.from('gmail_messages').update({ read }).eq('id', id)
  warnWrite('gmail_messages.read', error)
}

export async function persistAllEmailsRead(): Promise<void> {
  const user_id = await currentUserId()
  if (!user_id) return
  const { error } = await supabase.from('gmail_messages').update({ read: true }).eq('read', false)
  warnWrite('gmail_messages.read(all)', error)
}

// ── Projects ────────────────────────────────────────────────────────────────────

export async function persistProjectPatch(
  id: string,
  patch: Partial<Pick<Project, 'status' | 'priority' | 'deadline' | 'value' | 'progress'>>,
  notionId?: string,
): Promise<void> {
  if (!isDbId(id)) return
  const row: Record<string, unknown> = {}
  if (patch.status !== undefined) row.status = patch.status
  if (patch.priority !== undefined) row.prioriteit = patch.priority
  if (patch.deadline !== undefined) row.deadline = patch.deadline
  if (patch.value !== undefined) row.value = patch.value
  if (patch.progress !== undefined) row.progress = patch.progress
  if (Object.keys(row).length === 0) return
  const { error } = await supabase.from('projects').update(row).eq('id', id)
  warnWrite('projects', error)
  // Write the same change back to Notion (source of truth) — progress is an
  // app-derived field, so we don't push it back.
  if (notionId) {
    const { progress: _drop, ...notionPatch } = patch
    if (Object.keys(notionPatch).length > 0) void mutateNotion('project', notionId, notionPatch)
  }
}

/** Push a single project/client change back to Notion via the notion-mutate edge function. */
export async function mutateNotion(
  kind: 'project' | 'client',
  externalId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('notion-mutate', {
      body: { kind, external_id: externalId, patch },
    })
    warnWrite('notion-mutate', error)
  } catch (err) {
    warnWrite('notion-mutate', err)
  }
}

// ── Habits ────────────────────────────────────────────────────────────────────

/** Returns the new DB id, or null if the write was skipped/failed. */
export async function createHabitRow(name: string, icon: string, color?: string): Promise<string | null> {
  const user_id = await currentUserId()
  if (!user_id) return null
  const { data, error } = await supabase
    .from('habits')
    .insert({ user_id, name, icon, color: color ?? null, active: true })
    .select('id')
    .single()
  warnWrite('habits.insert', error)
  return (data?.id as string) ?? null
}

export async function softDeleteHabitRow(id: string): Promise<void> {
  if (!isDbId(id)) return
  const { error } = await supabase.from('habits').update({ active: false }).eq('id', id)
  warnWrite('habits.deactivate', error)
}

export async function persistHabitTick(habitId: string, onDate: string, done: boolean): Promise<void> {
  const user_id = await currentUserId()
  if (!user_id || !isDbId(habitId)) return
  // No unique (habit_id,on_date) constraint, so clear the day then re-insert when done.
  const del = await supabase.from('habit_log').delete().eq('habit_id', habitId).eq('on_date', onDate)
  warnWrite('habit_log.clear', del.error)
  if (done) {
    const { error } = await supabase.from('habit_log').insert({ user_id, habit_id: habitId, on_date: onDate, done: true })
    warnWrite('habit_log.insert', error)
  }
}

// ── Subscriptions ───────────────────────────────────────────────────────────────

export async function createSubscriptionRow(sub: Omit<Subscription, 'id'>): Promise<string | null> {
  const user_id = await currentUserId()
  if (!user_id) return null
  const { data, error } = await supabase
    .from('subscriptions')
    .insert({
      user_id,
      name: sub.name,
      amount: sub.amount,
      cadence: sub.cadence,
      next_charge_on: sub.nextCharge,
      active: sub.active,
      notes: sub.notes ?? null,
    })
    .select('id')
    .single()
  warnWrite('subscriptions.insert', error)
  return (data?.id as string) ?? null
}

export async function updateSubscriptionRow(id: string, patch: Partial<Subscription>): Promise<void> {
  if (!isDbId(id)) return
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.amount !== undefined) row.amount = patch.amount
  if (patch.cadence !== undefined) row.cadence = patch.cadence
  if (patch.nextCharge !== undefined) row.next_charge_on = patch.nextCharge
  if (patch.active !== undefined) row.active = patch.active
  if (patch.notes !== undefined) row.notes = patch.notes
  if (Object.keys(row).length === 0) return
  const { error } = await supabase.from('subscriptions').update(row).eq('id', id)
  warnWrite('subscriptions.update', error)
}

export async function deleteSubscriptionRow(id: string): Promise<void> {
  if (!isDbId(id)) return
  const { error } = await supabase.from('subscriptions').delete().eq('id', id)
  warnWrite('subscriptions.delete', error)
}

// ── Dog (Kyra) log ──────────────────────────────────────────────────────────────

export async function createDogEntryRow(entry: {
  kind: string
  at: string
  durationMin?: number | null
  distanceKm?: number | null
  note?: string | null
}): Promise<string | null> {
  const user_id = await currentUserId()
  if (!user_id) return null
  const { data, error } = await supabase
    .from('dog_log')
    .insert({
      user_id,
      kind: entry.kind,
      happened_at: entry.at,
      duration_min: entry.durationMin ?? null,
      distance_km: entry.distanceKm ?? null,
      notes: entry.note ?? null,
    })
    .select('id')
    .single()
  warnWrite('dog_log.insert', error)
  return (data?.id as string) ?? null
}

export async function deleteDogEntryRow(id: string): Promise<void> {
  if (!isDbId(id)) return
  const { error } = await supabase.from('dog_log').delete().eq('id', id)
  warnWrite('dog_log.delete', error)
}

export async function updateDogEntryRow(
  id: string,
  patch: { kind?: string; at?: string; durationMin?: number | null; distanceKm?: number | null; note?: string | null },
): Promise<void> {
  if (!isDbId(id)) return
  const row: Record<string, unknown> = {}
  if (patch.kind !== undefined) row.kind = patch.kind
  if (patch.at !== undefined) row.happened_at = patch.at
  if (patch.durationMin !== undefined) row.duration_min = patch.durationMin
  if (patch.distanceKm !== undefined) row.distance_km = patch.distanceKm
  if (patch.note !== undefined) row.notes = patch.note
  if (Object.keys(row).length === 0) return
  const { error } = await supabase.from('dog_log').update(row).eq('id', id)
  warnWrite('dog_log.update', error)
}

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
  // Sleep lives in its own table (stage breakdown per day); active minutes are
  // written to duration_min. The denormalised sleep_min/active_min columns are
  // only populated by newer ingests, so fall back to the authoritative sources.
  const [statsRes, sleepRes] = await Promise.all([
    supabase
      .from('health_daily_stats')
      .select('date,steps,sleep_min,avg_resting_hr,active_min,duration_min')
      .order('date', { ascending: false })
      .limit(90),
    supabase
      .from('health_sleep')
      .select('date,light_min,deep_min,rem_min')
      .order('date', { ascending: false })
      .limit(90),
  ])

  // Minutes actually asleep per day = light + deep + rem (awake excluded).
  const asleepByDate = new Map<string, number>()
  for (const s of sleepRes.data ?? []) {
    const mins = ((s.light_min as number) ?? 0) + ((s.deep_min as number) ?? 0) + ((s.rem_min as number) ?? 0)
    asleepByDate.set(s.date as string, mins)
  }

  return (statsRes.data ?? []).map((r) => {
    const date = r.date as string
    const sleepMin = asleepByDate.get(date) ?? (r.sleep_min as number) ?? 0
    const activeMin = (r.active_min as number) || (r.duration_min as number) || 0
    return {
      date,
      steps: (r.steps as number) ?? 0,
      stepGoal: 8000,
      sleepHours: Math.round((sleepMin / 60) * 10) / 10,
      restingHR: (r.avg_resting_hr as number) ?? 0,
      activeMinutes: activeMin,
      // energy/mood come from daily_checkin; merged into HealthDay in the store.
      energy: 3,
      mood: 3,
    }
  })
}

// ── Daily check-in (energy / mood) ──────────────────────────────────────────

export async function fetchCheckins(): Promise<Checkin[]> {
  const { data } = await supabase
    .from('daily_checkin')
    .select('date,energy,mood,note')
    .order('date', { ascending: false })
    .limit(120)

  return (data ?? []).map((r) => ({
    date: r.date as string,
    energy: (r.energy as number) ?? 3,
    mood: (r.mood as number) ?? 3,
    note: (r.note as string) ?? null,
  }))
}

/** Upsert today's (or any day's) felt energy/mood. Returns true on success. */
export async function upsertCheckin(c: Checkin): Promise<boolean> {
  const user_id = await currentUserId()
  if (!user_id) return false
  const { error } = await supabase.from('daily_checkin').upsert(
    {
      user_id,
      date: c.date,
      energy: c.energy,
      mood: c.mood,
      note: c.note ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,date' },
  )
  warnWrite('daily_checkin', error)
  return !error
}

// ── Finance ───────────────────────────────────────────────────────────────────

export async function fetchTransactions(): Promise<Transaction[]> {
  const { data } = await supabase
    .from('finance_tx')
    .select('id,occurred_on,amount,counterparty,description,category,domain')
    .order('occurred_on', { ascending: false })
    .limit(300)

  return (data ?? []).map((r) => ({
    id: r.id as string,
    date: r.occurred_on as string,
    amount: (r.amount as number) ?? 0,
    merchant: (r.counterparty as string) || (r.description as string) || '',
    category: (r.category as string) || 'other',
    // prefer stored domain (set by wallet-ingest), fall back to client-side inference
    domain: ((r.domain as Domain) || inferTxDomain((r.counterparty as string) ?? '', (r.description as string) ?? '')),
  }))
}

export async function fetchPayments(): Promise<Payment[]> {
  const { data } = await supabase
    .from('payments')
    .select('id,payee,amount,due,direction,status,domain,source,external_id')
    .order('due', { ascending: true, nullsFirst: false })

  return (data ?? []).map((r) => ({
    id: r.id as string,
    payee: (r.payee as string) ?? '',
    amount: (r.amount as number) ?? 0,
    due: (r.due as string) ?? null,
    direction: ((r.direction as Payment['direction']) ?? 'outgoing'),
    status: ((r.status as Payment['status']) ?? 'open'),
    domain: ((r.domain as Domain) ?? 'personal'),
    source: (r.source as string) ?? 'manual',
    externalId: (r.external_id as string) ?? undefined,
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
  const since = thirtyDaysAgo.toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' })

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
      const d = check.toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' })
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

/** Classify an app by name into the four ScreenDay app categories. */
function classifyApp(name: string): 'work' | 'social' | 'media' | 'comms' {
  const n = name.toLowerCase()
  if (/whatsapp|instagram|snapchat|tinder|reddit|facebook|tiktok|discord|messenger|twitter|\bx\b|threads|bereal|linkedin/.test(n)) return 'social'
  if (/youtube|spotify|soundcloud|netflix|videoland|twitch|disney|prime video|podcast|muziek|music|film/.test(n)) return 'media'
  if (/gmail|\bmail\b|telefoon|phone|berichten|messages|\bsms\b|teams|outlook|signal|telegram/.test(n)) return 'comms'
  return 'work'
}

export async function fetchScreenDays(): Promise<ScreenDay[]> {
  const [appsRes, dailyRes] = await Promise.all([
    supabase
      .from('screentime')
      .select('usage_date,app_name,duration_ms')
      .order('usage_date', { ascending: false })
      .limit(2000),
    supabase
      .from('screentime_daily')
      .select('usage_date,pickups')
      .order('usage_date', { ascending: false })
      .limit(120),
  ])

  const pickupsByDate = new Map<string, number>()
  for (const r of dailyRes.data ?? []) pickupsByDate.set(r.usage_date as string, (r.pickups as number) ?? 0)

  const byDate = new Map<string, { totalMs: number; focusMs: number; distractMs: number; apps: Map<string, number> }>()
  for (const r of appsRes.data ?? []) {
    const date = r.usage_date as string
    const ms = (r.duration_ms as number) ?? 0
    const app = (r.app_name as string) ?? 'Unknown'
    const cat = classifyApp(app)
    const d = byDate.get(date) ?? { totalMs: 0, focusMs: 0, distractMs: 0, apps: new Map<string, number>() }
    d.totalMs += ms
    if (cat === 'work') d.focusMs += ms
    else if (cat === 'social' || cat === 'media') d.distractMs += ms
    d.apps.set(app, (d.apps.get(app) ?? 0) + ms)
    byDate.set(date, d)
  }

  return Array.from(byDate.entries())
    .map(([date, d]) => ({
      date,
      totalMinutes: Math.round(d.totalMs / 60000),
      pickups: pickupsByDate.get(date) ?? 0,
      focusMinutes: Math.round(d.focusMs / 60000),
      distractMinutes: Math.round(d.distractMs / 60000),
      topApps: [...d.apps.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, ms]) => ({ name, minutes: Math.round(ms / 60000), category: classifyApp(name) })),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export async function fetchProjects(): Promise<Project[]> {
  const { data } = await supabase
    .from('projects')
    .select('id,external_id,name,client,domain,status,deadline,value,progress,type,prioriteit,notion_url')
    .not('status', 'eq', 'done')
    .order('deadline', { ascending: true, nullsFirst: false })

  return (data ?? []).map((r) => ({
    id:         r.id as string,
    name:       r.name as string,
    client:     (r.client as string) ?? '',
    domain:     ((r.domain as Domain) ?? 'personal'),
    status:     ((r.status as ProjectStatus) ?? 'lead'),
    deadline:   (r.deadline as string) ?? null,
    progress:   (r.progress as number) ?? 0,
    value:      (r.value as number) ?? 0,
    type:       (r.type as string[]) ?? [],
    priority:   (r.prioriteit as Project['priority']) ?? undefined,
    notionUrl:  (r.notion_url as string) ?? undefined,
    notionId:   (r.external_id as string) ?? undefined,
  }))
}

export async function fetchClients(): Promise<Client[]> {
  const { data } = await supabase
    .from('clients')
    .select('id,name,domain,client_status,potentie,scope,first_contact,email,website_url,notion_url')
    .order('name', { ascending: true })

  return (data ?? []).map((r) => ({
    id:           r.id as string,
    name:         r.name as string,
    domain:       ((r.domain as Domain) ?? 'personal'),
    clientStatus: (r.client_status as ClientStatus) ?? null,
    potentie:     (r.potentie as Client['potentie']) ?? null,
    scope:        (r.scope as number) ?? null,
    firstContact: (r.first_contact as string) ?? null,
    email:        (r.email as string) ?? null,
    website:      (r.website_url as string) ?? null,
  }))
}
