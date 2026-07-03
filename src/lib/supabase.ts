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
  ProjectMilestone,
  ProjectTask,
  HourEntry,
  Invoice,
  ActivityEntry,
  Message,
  Channel,
  NotificationPrefs,
  VendorTag,
  BraindumpEntry,
} from '../types'
import { TODAY } from '../domains'
import type { LearnedFact } from '../heyra/learning'

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

export async function deletePaymentRow(id: string): Promise<void> {
  if (!isDbId(id)) return
  const { error } = await supabase.from('payments').delete().eq('id', id)
  warnWrite('payments.delete', error)
}

// ── Day blocks (dagplan) ─────────────────────────────────────────────────────
// The "Nu doen" card completes/skips today's blocks; without writing the status
// back to day_blocks it reverts to 'planned' on the next fetchBlocks().
export async function persistBlockStatus(id: string, status: Block['status']): Promise<void> {
  if (!isDbId(id)) return
  const { error } = await supabase.from('day_blocks').update({ status }).eq('id', id)
  warnWrite('day_blocks.status', error)
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

// ── Notification prefs (Telegram) ───────────────────────────────────────────
// telegram_chat_id / telegram_username / linked_at are written exclusively by
// the telegram-webhook Edge Function when /start is received — the frontend
// only ever reads them and writes the toggles/times.

export async function fetchNotificationPrefs(): Promise<NotificationPrefs | null> {
  const { data } = await supabase
    .from('notification_prefs')
    .select(
      'telegram_chat_id,telegram_username,linked_at,morning_briefing,evening_checkin,habit_reminders,urgent_alerts,morning_time,evening_time,habit_time,quiet_hours_start,quiet_hours_end',
    )
    .maybeSingle()
  if (!data) return null
  return {
    telegramChatId: (data.telegram_chat_id as number) ?? null,
    telegramUsername: (data.telegram_username as string) ?? null,
    linkedAt: (data.linked_at as string) ?? null,
    morningBriefing: (data.morning_briefing as boolean) ?? true,
    eveningCheckin: (data.evening_checkin as boolean) ?? true,
    habitReminders: (data.habit_reminders as boolean) ?? true,
    urgentAlerts: (data.urgent_alerts as boolean) ?? true,
    morningTime: (data.morning_time as string)?.slice(0, 5) ?? '07:30',
    eveningTime: (data.evening_time as string)?.slice(0, 5) ?? '20:00',
    habitTime: (data.habit_time as string)?.slice(0, 5) ?? '21:00',
    quietHoursStart: (data.quiet_hours_start as string)?.slice(0, 5) ?? null,
    quietHoursEnd: (data.quiet_hours_end as string)?.slice(0, 5) ?? null,
  }
}

/** Frontend only ever writes toggles/times; see comment above. */
export async function upsertNotificationPrefs(p: Partial<NotificationPrefs>): Promise<boolean> {
  const user_id = await currentUserId()
  if (!user_id) return false
  const { error } = await supabase.from('notification_prefs').upsert(
    {
      user_id,
      ...(p.morningBriefing !== undefined && { morning_briefing: p.morningBriefing }),
      ...(p.eveningCheckin !== undefined && { evening_checkin: p.eveningCheckin }),
      ...(p.habitReminders !== undefined && { habit_reminders: p.habitReminders }),
      ...(p.urgentAlerts !== undefined && { urgent_alerts: p.urgentAlerts }),
      ...(p.morningTime !== undefined && { morning_time: p.morningTime }),
      ...(p.eveningTime !== undefined && { evening_time: p.eveningTime }),
      ...(p.habitTime !== undefined && { habit_time: p.habitTime }),
      ...(p.quietHoursStart !== undefined && { quiet_hours_start: p.quietHoursStart }),
      ...(p.quietHoursEnd !== undefined && { quiet_hours_end: p.quietHoursEnd }),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )
  warnWrite('notification_prefs', error)
  return !error
}

// ── Finance ───────────────────────────────────────────────────────────────────

export async function fetchTransactions(): Promise<Transaction[]> {
  const { data } = await supabase
    .from('finance_tx')
    .select('id,occurred_on,amount,counterparty,description,category,domain,note')
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
    note: (r.note as string) ?? '',
  }))
}

/** Update a single transaction's category/domain/note/merchant (manual edit or auto-tag). */
export async function updateFinanceTxRow(
  id: string,
  patch: Partial<Pick<Transaction, 'category' | 'domain' | 'note' | 'merchant'>>,
): Promise<void> {
  if (!isDbId(id)) return
  const row: Record<string, unknown> = {}
  if (patch.category !== undefined) row.category = patch.category
  if (patch.domain !== undefined) row.domain = patch.domain
  if (patch.note !== undefined) row.note = patch.note
  if (patch.merchant !== undefined) row.counterparty = patch.merchant
  if (Object.keys(row).length === 0) return
  const { error } = await supabase.from('finance_tx').update(row).eq('id', id)
  warnWrite('finance_tx.update', error)
}

export async function deleteFinanceTxRow(id: string): Promise<void> {
  if (!isDbId(id)) return
  const { error } = await supabase.from('finance_tx').delete().eq('id', id)
  warnWrite('finance_tx.delete', error)
}

/** Bulk-apply a category/domain to every transaction from one vendor (auto-tag / re-tag). */
export async function applyCategoryToTxIds(
  ids: string[],
  category: string,
  domain: Domain,
): Promise<void> {
  const dbIds = ids.filter(isDbId)
  if (!dbIds.length) return
  const { error } = await supabase.from('finance_tx').update({ category, domain }).in('id', dbIds)
  warnWrite('finance_tx.retag', error)
}

// ── Vendor tags (auto-categorisation cache) ───────────────────────────────────

export async function fetchVendorTags(): Promise<VendorTag[]> {
  const { data } = await supabase
    .from('vendor_tags')
    .select('vendor_key,vendor_name,category,domain,info,source,confidence,updated_at')
    .order('updated_at', { ascending: false })
    .limit(2000)

  return (data ?? []).map((r) => ({
    vendorKey: r.vendor_key as string,
    vendorName: (r.vendor_name as string) ?? '',
    category: (r.category as string) ?? 'Other',
    domain: ((r.domain as Domain) ?? 'personal'),
    info: (r.info as string) ?? '',
    source: ((r.source as VendorTag['source']) ?? 'ai'),
    confidence: (r.confidence as number) ?? 0.5,
    updatedAt: (r.updated_at as string) ?? new Date().toISOString(),
  }))
}

export async function upsertVendorTag(tag: VendorTag): Promise<void> {
  const user_id = await currentUserId()
  if (!user_id || !tag.vendorKey) return
  const { error } = await supabase.from('vendor_tags').upsert(
    {
      user_id,
      vendor_key: tag.vendorKey,
      vendor_name: tag.vendorName,
      category: tag.category,
      domain: tag.domain,
      info: tag.info,
      source: tag.source,
      confidence: tag.confidence,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,vendor_key' },
  )
  warnWrite('vendor_tags.upsert', error)
}

export async function deleteVendorTag(vendorKey: string): Promise<void> {
  const user_id = await currentUserId()
  if (!user_id || !vendorKey) return
  const { error } = await supabase.from('vendor_tags').delete().eq('vendor_key', vendorKey)
  warnWrite('vendor_tags.delete', error)
}

// ── Braindump v2: universal capture log ───────────────────────────────────────

const BRAINDUMP_COLS =
  'id,created_at,source_kind,status,title,source_url,markdown,summary,domain,kind,sentiment,tags,thumb_url,meta,error'

function mapBraindumpRow(r: Record<string, unknown>): BraindumpEntry {
  return {
    id: r.id as string,
    createdAt: (r.created_at as string) ?? new Date().toISOString(),
    sourceKind: ((r.source_kind as BraindumpEntry['sourceKind']) ?? 'text'),
    status: ((r.status as BraindumpEntry['status']) ?? 'pending'),
    title: (r.title as string) ?? null,
    sourceUrl: (r.source_url as string) ?? null,
    markdown: (r.markdown as string) ?? null,
    summary: (r.summary as string) ?? null,
    domain: (r.domain as Domain) ?? null,
    kind: (r.kind as BraindumpEntry['kind']) ?? null,
    sentiment: (r.sentiment as BraindumpEntry['sentiment']) ?? null,
    tags: (r.tags as string[]) ?? [],
    thumbUrl: (r.thumb_url as string) ?? null,
    meta: (r.meta as Record<string, unknown>) ?? {},
    error: (r.error as string) ?? null,
  }
}

export async function fetchBraindumpEntries(): Promise<BraindumpEntry[]> {
  const { data } = await supabase
    .from('braindump_entries')
    .select(BRAINDUMP_COLS)
    .order('created_at', { ascending: false })
    .limit(500)
  return (data ?? []).map(mapBraindumpRow)
}

/** Insert a fresh `pending` entry and return the real row (id + created_at). */
export async function insertBraindumpEntry(input: {
  sourceKind: BraindumpEntry['sourceKind']
  title?: string | null
  sourceUrl?: string | null
  markdown?: string | null
  meta?: Record<string, unknown>
}): Promise<BraindumpEntry | null> {
  const user_id = await currentUserId()
  if (!user_id) return null
  const { data, error } = await supabase
    .from('braindump_entries')
    .insert({
      user_id,
      source_kind: input.sourceKind,
      status: 'pending',
      title: input.title ?? null,
      source_url: input.sourceUrl ?? null,
      markdown: input.markdown ?? null,
      meta: input.meta ?? {},
    })
    .select(BRAINDUMP_COLS)
    .single()
  warnWrite('braindump_entries.insert', error)
  return data ? mapBraindumpRow(data) : null
}

export async function deleteBraindumpEntryRow(id: string): Promise<void> {
  if (!isDbId(id)) return
  const { error } = await supabase.from('braindump_entries').delete().eq('id', id)
  warnWrite('braindump_entries.delete', error)
}

/** Reset an entry to `pending` so the ingest pipeline can be re-run (retry). */
export async function resetBraindumpEntryRow(id: string): Promise<void> {
  if (!isDbId(id)) return
  const { error } = await supabase
    .from('braindump_entries')
    .update({ status: 'pending', error: null })
    .eq('id', id)
  warnWrite('braindump_entries.reset', error)
}

/**
 * Upload a shared file (image/pdf/media) to the private `braindump` bucket under
 * the user's folder. Returns the storage path the ingest pipeline reads from.
 */
export async function uploadBraindumpFile(file: File | Blob, filename: string): Promise<string | null> {
  const user_id = await currentUserId()
  if (!user_id) return null
  const safe = filename.replace(/[^\w.\-]+/g, '_').slice(-80) || 'file'
  const path = `${user_id}/${Date.now()}_${safe}`
  const { error } = await supabase.storage.from('braindump').upload(path, file, {
    contentType: (file as File).type || 'application/octet-stream',
    upsert: false,
  })
  if (error) {
    warnWrite('braindump.upload', error)
    return null
  }
  return path
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
    labels: (r.labels as string[]) ?? [],
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

// ── HEYRA learned memory (durable facts) ──────────────────────────────────────
// The "learn as we speak" layer — one jsonb row per user, same single-row shape
// as brain_state. See src/heyra/learning.ts for what gets stored.

export async function fetchLearnedFacts(): Promise<LearnedFact[]> {
  const { data } = await supabase
    .from('heyra_memory')
    .select('facts')
    .limit(1)
    .maybeSingle()

  return (data?.facts as LearnedFact[]) ?? []
}

export async function persistLearnedFacts(facts: LearnedFact[]): Promise<void> {
  const user_id = await currentUserId()
  if (!user_id) return
  const { error } = await supabase
    .from('heyra_memory')
    .upsert({ user_id, facts, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  warnWrite('heyra_memory', error)
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
    .select('id,external_id,name,client,client_id,domain,status,deadline,start_datum,value,progress,type,prioriteit,deliverables,scope_text,notes,archived,notion_url')
    .eq('archived', false)
    .order('deadline', { ascending: true, nullsFirst: false })

  return (data ?? []).map((r) => ({
    id:           r.id as string,
    name:         r.name as string,
    client:       (r.client as string) ?? '',
    clientId:     (r.client_id as string) ?? null,
    domain:       ((r.domain as Domain) ?? 'personal'),
    status:       ((r.status as ProjectStatus) ?? 'lead'),
    deadline:     (r.deadline as string) ?? null,
    startDate:    (r.start_datum as string) ?? null,
    progress:     (r.progress as number) ?? 0,
    value:        (r.value as number) ?? 0,
    type:         (r.type as string[]) ?? [],
    priority:     (r.prioriteit as Project['priority']) ?? undefined,
    deliverables: (r.deliverables as string[]) ?? [],
    scope:        (r.scope_text as string) ?? null,
    notes:        (r.notes as string) ?? null,
    archived:     (r.archived as boolean) ?? false,
    notionUrl:    (r.notion_url as string) ?? undefined,
    notionId:     (r.external_id as string) ?? undefined,
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

// ════════════════════════════════════════════════════════════════════════════
// NATIVE CRM — full CRUD for clients, projects and the project template.
// The app is the source of truth (Supabase), no longer a read-only Notion
// mirror. In-app rows get a `local-<uuid>` external_id to satisfy the existing
// UNIQUE (user_id, external_id) constraint; Notion-synced rows keep theirs.
// ════════════════════════════════════════════════════════════════════════════

const localExternalId = () => `local-${crypto.randomUUID()}`

// ── Clients ─────────────────────────────────────────────────────────────────

export async function createClientRow(c: Omit<Client, 'id'>): Promise<Client | null> {
  const user_id = await currentUserId()
  if (!user_id) return null
  const { data, error } = await supabase
    .from('clients')
    .insert({
      user_id,
      external_id: localExternalId(),
      name: c.name,
      client_status: c.clientStatus ?? null,
      potentie: c.potentie ?? null,
      scope: c.scope ?? null,
      first_contact: c.firstContact ?? null,
      email: c.email ?? null,
      website_url: c.website ?? null,
      domain: c.domain,
    })
    .select('id')
    .single()
  warnWrite('clients.insert', error)
  if (!data?.id) return null
  return { ...c, id: data.id as string }
}

export async function updateClientRow(id: string, patch: Partial<Client>): Promise<void> {
  if (!isDbId(id)) return
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.clientStatus !== undefined) row.client_status = patch.clientStatus
  if (patch.potentie !== undefined) row.potentie = patch.potentie
  if (patch.scope !== undefined) row.scope = patch.scope
  if (patch.firstContact !== undefined) row.first_contact = patch.firstContact
  if (patch.email !== undefined) row.email = patch.email
  if (patch.website !== undefined) row.website_url = patch.website
  if (patch.domain !== undefined) row.domain = patch.domain
  if (Object.keys(row).length === 0) return
  const { error } = await supabase.from('clients').update(row).eq('id', id)
  warnWrite('clients.update', error)
}

export async function deleteClientRow(id: string): Promise<void> {
  if (!isDbId(id)) return
  // Detach projects first so the FK (on delete set null) leaves them orphaned-but-alive.
  await supabase.from('projects').update({ client_id: null }).eq('client_id', id)
  const { error } = await supabase.from('clients').delete().eq('id', id)
  warnWrite('clients.delete', error)
}

// ── Projects (native create / update / delete) ──────────────────────────────

export async function createProjectRow(p: Omit<Project, 'id'>): Promise<Project | null> {
  const user_id = await currentUserId()
  if (!user_id) return null
  const { data, error } = await supabase
    .from('projects')
    .insert({
      user_id,
      external_id: localExternalId(),
      name: p.name,
      client: p.client ?? '',
      client_id: p.clientId ?? null,
      domain: p.domain,
      status: p.status,
      deadline: p.deadline ?? null,
      start_datum: p.startDate ?? null,
      value: p.value ?? 0,
      progress: p.progress ?? 0,
      type: p.type ?? [],
      prioriteit: p.priority ?? null,
      deliverables: p.deliverables ?? [],
      scope_text: p.scope ?? null,
      notes: p.notes ?? null,
      source: 'app',
    })
    .select('id')
    .single()
  warnWrite('projects.insert', error)
  if (!data?.id) return null
  return { ...p, id: data.id as string }
}

/** Full update of any editable project field. */
export async function updateProjectRow(id: string, patch: Partial<Project>): Promise<void> {
  if (!isDbId(id)) return
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) row.name = patch.name
  if (patch.client !== undefined) row.client = patch.client
  if (patch.clientId !== undefined) row.client_id = patch.clientId
  if (patch.domain !== undefined) row.domain = patch.domain
  if (patch.status !== undefined) row.status = patch.status
  if (patch.deadline !== undefined) row.deadline = patch.deadline
  if (patch.startDate !== undefined) row.start_datum = patch.startDate
  if (patch.value !== undefined) row.value = patch.value
  if (patch.progress !== undefined) row.progress = patch.progress
  if (patch.type !== undefined) row.type = patch.type
  if (patch.priority !== undefined) row.prioriteit = patch.priority
  if (patch.deliverables !== undefined) row.deliverables = patch.deliverables
  if (patch.scope !== undefined) row.scope_text = patch.scope
  if (patch.notes !== undefined) row.notes = patch.notes
  if (patch.archived !== undefined) row.archived = patch.archived
  const { error } = await supabase.from('projects').update(row).eq('id', id)
  warnWrite('projects.update', error)
}

export async function deleteProjectRow(id: string): Promise<void> {
  if (!isDbId(id)) return
  const { error } = await supabase.from('projects').delete().eq('id', id)
  warnWrite('projects.delete', error)
}

// ── Milestones ──────────────────────────────────────────────────────────────

export async function fetchMilestones(): Promise<ProjectMilestone[]> {
  const { data } = await supabase
    .from('project_milestones')
    .select('id,project_id,title,due_date,progress,done,order_idx')
    .order('order_idx', { ascending: true })
  return (data ?? []).map((r) => ({
    id: r.id as string,
    projectId: r.project_id as string,
    title: r.title as string,
    dueDate: (r.due_date as string) ?? null,
    progress: (r.progress as number) ?? 0,
    done: (r.done as boolean) ?? false,
  }))
}

export async function createMilestoneRow(
  projectId: string,
  m: Omit<ProjectMilestone, 'id' | 'projectId'>,
): Promise<string | null> {
  const user_id = await currentUserId()
  if (!user_id || !isDbId(projectId)) return null
  const { data, error } = await supabase
    .from('project_milestones')
    .insert({
      user_id, project_id: projectId,
      title: m.title, due_date: m.dueDate ?? null,
      progress: m.progress ?? 0, done: m.done ?? false,
    })
    .select('id')
    .single()
  warnWrite('project_milestones.insert', error)
  return (data?.id as string) ?? null
}

export async function updateMilestoneRow(id: string, patch: Partial<ProjectMilestone>): Promise<void> {
  if (!isDbId(id)) return
  const row: Record<string, unknown> = {}
  if (patch.title !== undefined) row.title = patch.title
  if (patch.dueDate !== undefined) row.due_date = patch.dueDate
  if (patch.progress !== undefined) row.progress = patch.progress
  if (patch.done !== undefined) row.done = patch.done
  if (Object.keys(row).length === 0) return
  const { error } = await supabase.from('project_milestones').update(row).eq('id', id)
  warnWrite('project_milestones.update', error)
}

export async function deleteMilestoneRow(id: string): Promise<void> {
  if (!isDbId(id)) return
  const { error } = await supabase.from('project_milestones').delete().eq('id', id)
  warnWrite('project_milestones.delete', error)
}

// ── Project tasks ─────────────────────────────────────────────────────────────

export async function fetchProjectTaskRows(): Promise<ProjectTask[]> {
  const { data } = await supabase
    .from('project_tasks')
    .select('id,project_id,name,done,due_date,priority,recurrence,recur_every,last_done_on,order_idx')
    .order('order_idx', { ascending: true })
  return (data ?? []).map((r) => ({
    id: r.id as string,
    projectId: r.project_id as string,
    name: r.name as string,
    done: (r.done as boolean) ?? false,
    dueDate: (r.due_date as string) ?? null,
    priority: (r.priority as ProjectTask['priority']) ?? null,
    recurrence: (r.recurrence as ProjectTask['recurrence']) ?? null,
    recurEvery: (r.recur_every as number) ?? 1,
    lastDoneOn: (r.last_done_on as string) ?? null,
  }))
}

export async function createProjectTaskRow(
  projectId: string,
  t: Omit<ProjectTask, 'id' | 'projectId'>,
): Promise<string | null> {
  const user_id = await currentUserId()
  if (!user_id || !isDbId(projectId)) return null
  const { data, error } = await supabase
    .from('project_tasks')
    .insert({
      user_id, project_id: projectId,
      name: t.name, done: t.done ?? false, due_date: t.dueDate ?? null,
      priority: t.priority ?? null, recurrence: t.recurrence ?? null,
      recur_every: t.recurEvery ?? 1, last_done_on: t.lastDoneOn ?? null,
    })
    .select('id')
    .single()
  warnWrite('project_tasks.insert', error)
  return (data?.id as string) ?? null
}

export async function updateProjectTaskRow(id: string, patch: Partial<ProjectTask>): Promise<void> {
  if (!isDbId(id)) return
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.done !== undefined) row.done = patch.done
  if (patch.dueDate !== undefined) row.due_date = patch.dueDate
  if (patch.priority !== undefined) row.priority = patch.priority
  if (patch.recurrence !== undefined) row.recurrence = patch.recurrence
  if (patch.recurEvery !== undefined) row.recur_every = patch.recurEvery
  if (patch.lastDoneOn !== undefined) row.last_done_on = patch.lastDoneOn
  if (Object.keys(row).length === 0) return
  const { error } = await supabase.from('project_tasks').update(row).eq('id', id)
  warnWrite('project_tasks.update', error)
}

export async function deleteProjectTaskRow(id: string): Promise<void> {
  if (!isDbId(id)) return
  const { error } = await supabase.from('project_tasks').delete().eq('id', id)
  warnWrite('project_tasks.delete', error)
}

// ── Hours (time tracker) ──────────────────────────────────────────────────────

export async function fetchHours(): Promise<HourEntry[]> {
  const { data } = await supabase
    .from('project_hours')
    .select('id,project_id,on_date,hours,note,billable')
    .order('on_date', { ascending: false })
  return (data ?? []).map((r) => ({
    id: r.id as string,
    projectId: r.project_id as string,
    date: r.on_date as string,
    hours: (r.hours as number) ?? 0,
    note: (r.note as string) ?? null,
    billable: (r.billable as boolean) ?? true,
  }))
}

export async function createHourRow(
  projectId: string,
  h: Omit<HourEntry, 'id' | 'projectId'>,
): Promise<string | null> {
  const user_id = await currentUserId()
  if (!user_id || !isDbId(projectId)) return null
  const { data, error } = await supabase
    .from('project_hours')
    .insert({
      user_id, project_id: projectId,
      on_date: h.date, hours: h.hours, note: h.note ?? null, billable: h.billable ?? true,
    })
    .select('id')
    .single()
  warnWrite('project_hours.insert', error)
  return (data?.id as string) ?? null
}

export async function deleteHourRow(id: string): Promise<void> {
  if (!isDbId(id)) return
  const { error } = await supabase.from('project_hours').delete().eq('id', id)
  warnWrite('project_hours.delete', error)
}

// ── Invoices ──────────────────────────────────────────────────────────────────

export async function fetchInvoices(): Promise<Invoice[]> {
  const { data } = await supabase
    .from('project_invoices')
    .select('id,project_id,number,amount,status,issued_on,due_on,paid_on,note')
    .order('issued_on', { ascending: false, nullsFirst: false })
  return (data ?? []).map((r) => ({
    id: r.id as string,
    projectId: r.project_id as string,
    number: (r.number as string) ?? '',
    amount: (r.amount as number) ?? 0,
    status: (r.status as Invoice['status']) ?? 'draft',
    issuedOn: (r.issued_on as string) ?? null,
    dueOn: (r.due_on as string) ?? null,
    paidOn: (r.paid_on as string) ?? null,
    note: (r.note as string) ?? null,
  }))
}

export async function createInvoiceRow(
  projectId: string,
  inv: Omit<Invoice, 'id' | 'projectId'>,
): Promise<string | null> {
  const user_id = await currentUserId()
  if (!user_id || !isDbId(projectId)) return null
  const { data, error } = await supabase
    .from('project_invoices')
    .insert({
      user_id, project_id: projectId,
      number: inv.number ?? '', amount: inv.amount ?? 0, status: inv.status ?? 'draft',
      issued_on: inv.issuedOn ?? null, due_on: inv.dueOn ?? null, paid_on: inv.paidOn ?? null,
      note: inv.note ?? null,
    })
    .select('id')
    .single()
  warnWrite('project_invoices.insert', error)
  return (data?.id as string) ?? null
}

export async function updateInvoiceRow(id: string, patch: Partial<Invoice>): Promise<void> {
  if (!isDbId(id)) return
  const row: Record<string, unknown> = {}
  if (patch.number !== undefined) row.number = patch.number
  if (patch.amount !== undefined) row.amount = patch.amount
  if (patch.status !== undefined) row.status = patch.status
  if (patch.issuedOn !== undefined) row.issued_on = patch.issuedOn
  if (patch.dueOn !== undefined) row.due_on = patch.dueOn
  if (patch.paidOn !== undefined) row.paid_on = patch.paidOn
  if (patch.note !== undefined) row.note = patch.note
  if (Object.keys(row).length === 0) return
  const { error } = await supabase.from('project_invoices').update(row).eq('id', id)
  warnWrite('project_invoices.update', error)
}

export async function deleteInvoiceRow(id: string): Promise<void> {
  if (!isDbId(id)) return
  const { error } = await supabase.from('project_invoices').delete().eq('id', id)
  warnWrite('project_invoices.delete', error)
}

// ── Activity log ──────────────────────────────────────────────────────────────

export async function fetchActivity(): Promise<ActivityEntry[]> {
  const { data } = await supabase
    .from('project_activity')
    .select('id,project_id,body,link_type,link_id,action,created_at')
    .order('created_at', { ascending: false })
    .limit(500)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    projectId: r.project_id as string,
    body: r.body as string,
    linkType: (r.link_type as ActivityEntry['linkType']) ?? null,
    linkId: (r.link_id as string) ?? null,
    action: (r.action as ActivityEntry['action']) ?? null,
    createdAt: r.created_at as string,
  }))
}

export async function createActivityRow(
  projectId: string,
  a: Omit<ActivityEntry, 'id' | 'projectId' | 'createdAt'>,
): Promise<string | null> {
  const user_id = await currentUserId()
  if (!user_id || !isDbId(projectId)) return null
  const { data, error } = await supabase
    .from('project_activity')
    .insert({
      user_id, project_id: projectId,
      body: a.body, link_type: a.linkType ?? null, link_id: a.linkId ?? null, action: a.action ?? null,
    })
    .select('id')
    .single()
  warnWrite('project_activity.insert', error)
  return (data?.id as string) ?? null
}

export async function deleteActivityRow(id: string): Promise<void> {
  if (!isDbId(id)) return
  const { error } = await supabase.from('project_activity').delete().eq('id', id)
  warnWrite('project_activity.delete', error)
}

// ── Client messages (unified inbox) ───────────────────────────────────────────

export async function fetchClientMessages(): Promise<Message[]> {
  const { data } = await supabase
    .from('client_messages')
    .select('id,client_id,project_id,channel,direction,contact,contact_key,subject,snippet,body,ts,unread,source,external_id')
    .order('ts', { ascending: false })
    .limit(2000)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    clientId: (r.client_id as string) ?? null,
    projectId: (r.project_id as string) ?? null,
    channel: (r.channel as Channel) ?? 'email',
    direction: (r.direction as Message['direction']) ?? 'in',
    contact: (r.contact as string) ?? '',
    contactKey: (r.contact_key as string) ?? '',
    subject: (r.subject as string) ?? null,
    snippet: (r.snippet as string) ?? '',
    body: (r.body as string) ?? null,
    ts: r.ts as string,
    unread: (r.unread as boolean) ?? false,
    source: (r.source as Message['source']) ?? 'manual',
    externalId: (r.external_id as string) ?? null,
  }))
}

function messageToRow(user_id: string, m: Omit<Message, 'id'>): Record<string, unknown> {
  return {
    user_id,
    client_id: m.clientId ?? null,
    project_id: m.projectId ?? null,
    channel: m.channel,
    direction: m.direction,
    contact: m.contact,
    contact_key: m.contactKey,
    subject: m.subject ?? null,
    snippet: m.snippet,
    body: m.body ?? null,
    ts: m.ts,
    unread: m.unread,
    source: m.source ?? 'manual',
    external_id: m.externalId ?? null,
  }
}

export async function createMessageRow(m: Omit<Message, 'id'>): Promise<string | null> {
  const user_id = await currentUserId()
  if (!user_id) return null
  const { data, error } = await supabase
    .from('client_messages')
    .insert(messageToRow(user_id, m))
    .select('id')
    .single()
  warnWrite('client_messages.insert', error)
  return (data?.id as string) ?? null
}

/** Bulk insert (WhatsApp import); skips rows that already exist by external_id. */
export async function insertMessages(msgs: Omit<Message, 'id'>[]): Promise<number> {
  const user_id = await currentUserId()
  if (!user_id || !msgs.length) return 0
  const rows = msgs.map((m) => messageToRow(user_id, m))
  const { error, count } = await supabase
    .from('client_messages')
    .upsert(rows, { onConflict: 'user_id,source,external_id', ignoreDuplicates: true, count: 'exact' })
  warnWrite('client_messages.bulk', error)
  return count ?? 0
}

export async function markMessagesReadRow(contactKey: string): Promise<void> {
  const user_id = await currentUserId()
  if (!user_id) return
  const { error } = await supabase
    .from('client_messages')
    .update({ unread: false })
    .eq('contact_key', contactKey)
    .eq('unread', true)
  warnWrite('client_messages.read', error)
}

export async function deleteMessageRow(id: string): Promise<void> {
  if (!isDbId(id)) return
  const { error } = await supabase.from('client_messages').delete().eq('id', id)
  warnWrite('client_messages.delete', error)
}
