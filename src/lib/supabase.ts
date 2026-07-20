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
  AppSettings,
  PlanBlock,
  InferredItem,
  InferenceDecision,
  LifeDomain,
  Person,
  Interaction,
  AdminItem,
  HealthCondition,
  MemorySummary,
  MemoryHit,
  BusinessIdea,
  IdeaSource,
} from '../types'
import { today, habitStreak } from '../domains'
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

// ── Generic row helpers ─────────────────────────────────────────────────────────
// Most tables share the same mechanical CRUD shape; the per-entity functions
// below keep their names/signatures and delegate here. The per-entity column
// maps ARE the behavior — they mirror the historical (sometimes Dutch) column
// names verbatim, so don't "fix" apparent inconsistencies.

/** Insert a row (user_id stamped for RLS) and return the new id, or null when signed out/failed. */
async function insertRow(table: string, row: Record<string, unknown>): Promise<string | null> {
  const user_id = await currentUserId()
  if (!user_id) return null
  const { data, error } = await supabase.from(table).insert({ ...row, user_id }).select('id').single()
  warnWrite(`${table}.insert`, error)
  return (data?.id as string) ?? null
}

/**
 * Update a row: copy every defined camelCase patch field onto its snake_case
 * column. Returns whether the write actually landed — `.select('id')` makes
 * PostgREST echo the affected rows, so a silently-rejected write (RLS mismatch,
 * stale/non-matching id) surfaces as `count === 0` instead of a false success.
 */
async function updateRow(
  table: string,
  id: string,
  patch: object,
  colMap: Record<string, string>,
  extra?: Record<string, unknown>,
): Promise<{ ok: boolean; count: number }> {
  if (!isDbId(id)) return { ok: false, count: 0 }
  const row: Record<string, unknown> = { ...extra }
  const p = patch as Record<string, unknown>
  for (const [key, col] of Object.entries(colMap)) {
    if (p[key] !== undefined) row[col] = p[key]
  }
  if (Object.keys(row).length === 0) return { ok: true, count: 0 }
  const { data, error } = await supabase.from(table).update(row).eq('id', id).select('id')
  warnWrite(`${table}.update`, error)
  const count = data?.length ?? 0
  if (!error && count === 0) {
    console.warn(`[OSLIFE] ${table}.update matched 0 rows for id=${id} — RLS mismatch or stale id?`)
  }
  return { ok: !error && count > 0, count }
}

/** Delete a row by id; no-op for local/seeded (non-DB) ids. */
async function deleteRow(table: string, id: string): Promise<void> {
  if (!isDbId(id)) return
  const { error } = await supabase.from(table).delete().eq('id', id)
  warnWrite(`${table}.delete`, error)
}

/** Simple list fetch: select → order (→ limit) → map each row snake→camel. */
async function fetchRows<T>(
  table: string,
  cols: string,
  by: { column: string; ascending?: boolean; nullsFirst?: boolean; limit?: number; tiebreaker?: string },
  map: (r: Record<string, unknown>) => T,
): Promise<T[]> {
  let query = supabase
    .from(table)
    .select(cols)
    .order(by.column, { ascending: by.ascending, nullsFirst: by.nullsFirst })
  // A date/low-cardinality order column alone doesn't guarantee a stable row
  // set under limit() — ties at the cutoff can resolve differently between
  // requests (seen in practice: finance_tx rows sharing a date straddling the
  // limit, returning a different 300 depending on which device/request asked).
  if (by.tiebreaker) query = query.order(by.tiebreaker, { ascending: false })
  if (by.limit !== undefined) query = query.limit(by.limit)
  const { data } = await query
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(map)
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
  return deleteRow('payments', id)
}

// ── Day blocks (dagplan) ─────────────────────────────────────────────────────
// The "Nu doen" card completes/skips today's blocks; without writing the status
// back to day_blocks it reverts to 'planned' on the next fetchBlocks().
export async function persistBlockStatus(id: string, status: Block['status']): Promise<void> {
  if (!isDbId(id)) return
  const { error } = await supabase.from('day_blocks').update({ status }).eq('id', id)
  warnWrite('day_blocks.status', error)
}

// Sentinel merchant wallet-ingest stores for a real-time bank notification
// that carries only an amount, no merchant (e.g. ABN AMRO's generic "Er is
// een bedrag afgeschreven" alert). MUST match PENDING_MERCHANT in
// supabase/functions/wallet-ingest/index.ts.
const PENDING_MERCHANT = 'Onbekend (bank-melding)'

// ── Finance: ABN AMRO CSV import ──────────────────────────────────────────────
// Persists imported bank transactions to finance_tx. The dedup_key matches the
// one payments-sheet-ingest/wallet-ingest use (`date|amount`), so a purchase
// already logged via the Betalingen Google Sheet or a Wallet/bank notification
// is NOT duplicated. A row a real-time notification wrote as a PENDING_MERCHANT
// placeholder (no merchant known yet) gets enriched with the CSV's real
// merchant/category/domain instead of being dedup-blocked by it — the CSV is
// the closest thing OSLIFE has to ground truth for merchant names. Any other
// existing row (already has a real merchant, or was manually edited) wins as
// before. Returns the number of rows actually inserted or enriched.
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

  const dedupKeys = rows.map((r) => r.dedup_key)
  const { data: pendingRows } = await supabase
    .from('finance_tx')
    .select('dedup_key')
    .eq('user_id', user_id)
    .eq('counterparty', PENDING_MERCHANT)
    .in('dedup_key', dedupKeys)
  const pendingKeys = new Set((pendingRows ?? []).map((r) => r.dedup_key as string))

  const toEnrich = rows.filter((r) => pendingKeys.has(r.dedup_key))
  const toInsert = rows.filter((r) => !pendingKeys.has(r.dedup_key))

  let count = 0
  if (toEnrich.length) {
    const results = await Promise.all(
      toEnrich.map((r) =>
        supabase
          .from('finance_tx')
          .update(
            { counterparty: r.counterparty, category: r.category, domain: r.domain, source: r.source },
            { count: 'exact' },
          )
          .eq('user_id', user_id)
          .eq('dedup_key', r.dedup_key)
          // Re-check counterparty at write time: don't clobber a manual edit
          // that landed between the select above and this update.
          .eq('counterparty', PENDING_MERCHANT),
      ),
    )
    results.forEach((r) => warnWrite('finance_tx.enrich', r.error))
    // Count rows actually enriched, not merely non-erroring updates — the
    // write-time counterparty guard can match 0 rows if a manual edit raced in.
    count += results.reduce((n, r) => n + (r.error ? 0 : r.count ?? 0), 0)
  }
  if (toInsert.length) {
    const { error, count: insCount } = await supabase
      .from('finance_tx')
      .upsert(toInsert, { onConflict: 'user_id,dedup_key', ignoreDuplicates: true, count: 'exact' })
    warnWrite('finance_tx.import', error)
    count += insCount ?? 0
  }
  return count
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
  return insertRow('habits', { name, icon, color: color ?? null, active: true })
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

// ── Cleaning schedule ────────────────────────────────────────────────────────
// The schedule (zones/tasks) is static content in src/cleaning/schedule.ts —
// only per-task completions round-trip through Supabase, keyed the same way
// the store keeps them in memory: `${on_date}__${task_key}` → done.

export async function fetchCleaningLog(): Promise<Record<string, boolean>> {
  const since = new Date()
  since.setDate(since.getDate() - 90)
  const sinceIso = since.toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' })
  const { data } = await supabase
    .from('cleaning_log')
    .select('task_key,on_date,done')
    .gte('on_date', sinceIso)
  const log: Record<string, boolean> = {}
  for (const row of data ?? []) log[`${row.on_date}__${row.task_key}`] = row.done
  return log
}

export async function persistCleaningTick(taskKey: string, onDate: string, done: boolean): Promise<void> {
  const user_id = await currentUserId()
  if (!user_id) return
  const { error } = await supabase
    .from('cleaning_log')
    .upsert({ user_id, task_key: taskKey, on_date: onDate, done }, { onConflict: 'user_id,task_key,on_date' })
  warnWrite('cleaning_log.upsert', error)
}

// ── Subscriptions ───────────────────────────────────────────────────────────────

const SUBSCRIPTION_COLS: Record<string, string> = {
  name: 'name',
  amount: 'amount',
  cadence: 'cadence',
  nextCharge: 'next_charge_on',
  active: 'active',
  notes: 'notes',
}

export async function createSubscriptionRow(sub: Omit<Subscription, 'id'>): Promise<string | null> {
  return insertRow('subscriptions', {
    name: sub.name,
    amount: sub.amount,
    cadence: sub.cadence,
    next_charge_on: sub.nextCharge,
    active: sub.active,
    notes: sub.notes ?? null,
  })
}

export async function updateSubscriptionRow(id: string, patch: Partial<Subscription>): Promise<void> {
  await updateRow('subscriptions', id, patch, SUBSCRIPTION_COLS)
}

export async function deleteSubscriptionRow(id: string): Promise<void> {
  return deleteRow('subscriptions', id)
}

// ── Dog (Kyra) log ──────────────────────────────────────────────────────────────

export async function createDogEntryRow(entry: {
  kind: string
  at: string
  durationMin?: number | null
  distanceKm?: number | null
  note?: string | null
}): Promise<string | null> {
  return insertRow('dog_log', {
    kind: entry.kind,
    happened_at: entry.at,
    duration_min: entry.durationMin ?? null,
    distance_km: entry.distanceKm ?? null,
    notes: entry.note ?? null,
  })
}

export async function deleteDogEntryRow(id: string): Promise<void> {
  return deleteRow('dog_log', id)
}

const DOG_ENTRY_COLS: Record<string, string> = {
  kind: 'kind',
  at: 'happened_at',
  durationMin: 'duration_min',
  distanceKm: 'distance_km',
  note: 'notes',
}

export async function updateDogEntryRow(
  id: string,
  patch: { kind?: string; at?: string; durationMin?: number | null; distanceKm?: number | null; note?: string | null },
): Promise<void> {
  await updateRow('dog_log', id, patch, DOG_ENTRY_COLS)
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

  // Union of dates from both sources. A day may have ONLY sleep (phone-derived,
  // with no Samsung-Health activity row for that date) and must still surface —
  // otherwise phone sleep is invisible whenever the health sheet is quiet.
  const statsByDate = new Map<string, Record<string, unknown>>()
  for (const r of statsRes.data ?? []) statsByDate.set(r.date as string, r)
  // Chronological (oldest → newest): the Vitals/Dashboard charts plot the array
  // left-to-right, the `today` fallback reads healthDays[length-1], and the
  // HEYRA sparkline uses slice(-7) — all expect the newest day LAST. ISO date
  // strings sort chronologically, so a plain sort + take the most recent 90.
  const allDates = [...new Set<string>([...statsByDate.keys(), ...asleepByDate.keys()])]
    .sort()
    .slice(-90)

  return allDates.map((date) => {
    const r = statsByDate.get(date) ?? {}
    // Prefer the per-stage sum, but a health_sleep row with all-null stages sums
    // to 0 — treat that as "no breakdown" and fall back to the denormalised
    // sleep_min, otherwise a real night with only sleep_min populated reads as 0h.
    const sleepMin = (asleepByDate.get(date) || (r.sleep_min as number)) ?? 0
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
  return fetchRows('daily_checkin', 'date,energy,mood,note', { column: 'date', ascending: false, limit: 120 }, (r) => ({
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
  return fetchRows('finance_tx', 'id,occurred_on,amount,counterparty,description,category,domain,note', { column: 'occurred_on', ascending: false, limit: 300, tiebreaker: 'ingested_at' }, (r) => ({
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
  await updateRow('finance_tx', id, patch, FINANCE_TX_COLS)
}

const FINANCE_TX_COLS: Record<string, string> = {
  category: 'category',
  domain: 'domain',
  note: 'note',
  merchant: 'counterparty',
}

export async function deleteFinanceTxRow(id: string): Promise<void> {
  return deleteRow('finance_tx', id)
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
  return fetchRows('vendor_tags', 'vendor_key,vendor_name,category,domain,info,source,confidence,updated_at', { column: 'updated_at', ascending: false, limit: 2000 }, (r) => ({
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
  return fetchRows('braindump_entries', BRAINDUMP_COLS, { column: 'created_at', ascending: false, limit: 500 }, mapBraindumpRow)
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

/** A fully-derived braindump row inserted straight as `ready` (no ingest pass) —
 *  used by the Claude-chat importer, which already has the markdown transcript so
 *  it needs no server-side enrichment. */
export interface ReadyBraindumpInput {
  title: string | null
  markdown: string
  summary: string | null
  domain: Domain | null
  kind: BraindumpEntry['kind']
  sentiment: BraindumpEntry['sentiment']
  tags: string[]
  meta?: Record<string, unknown>
}

/** Bulk-insert already-enriched `ready` entries in one round trip. Returns the mapped rows ([] on failure). */
export async function insertReadyBraindumpEntries(rows: ReadyBraindumpInput[]): Promise<BraindumpEntry[]> {
  if (!rows.length) return []
  const user_id = await currentUserId()
  if (!user_id) return []
  const payload = rows.map((r) => ({
    user_id,
    source_kind: 'text',
    status: 'ready',
    title: r.title,
    markdown: r.markdown,
    summary: r.summary,
    domain: r.domain,
    kind: r.kind,
    sentiment: r.sentiment,
    tags: r.tags,
    meta: r.meta ?? {},
  }))
  const { data, error } = await supabase
    .from('braindump_entries')
    .insert(payload)
    .select(BRAINDUMP_COLS)
  warnWrite('braindump_entries.insertReady', error)
  return data ? (data as Record<string, unknown>[]).map(mapBraindumpRow) : []
}

export async function deleteBraindumpEntryRow(id: string): Promise<void> {
  return deleteRow('braindump_entries', id)
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
  return fetchRows('payments', 'id,payee,amount,due,direction,status,domain,source,external_id', { column: 'due', ascending: true, nullsFirst: false }, (r) => ({
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
  return fetchRows('subscriptions', 'id,name,amount,cadence,next_charge_on,active,notes', { column: 'name' }, (r) => ({
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
  // 400 (up from 50) so the label-filtered CRM inbox (deriveGmailMessages) sees
  // enough history — client/Fiverr-labelled mail is interleaved among all mail.
  return fetchRows('gmail_messages', 'id,from_addr,subject,snippet,received_at,read,importance,labels', { column: 'received_at', ascending: false, limit: 400 }, (r) => ({
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
    // Wrap past midnight (end earlier than start) instead of clamping to 0.
    let mins = eh * 60 + em - (sh * 60 + sm)
    if (mins < 0) mins += 24 * 60
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
    .eq('date', today())
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

/**
 * Fetch every calendar/day block in [start, end] (inclusive) as PlanBlocks the
 * Dagplanner treats as fixed appointments. These are the "scheduled calendar
 * events" the AI planner plans around.
 */
export async function fetchBlocksRange(start: string, end: string): Promise<PlanBlock[]> {
  const { data } = await supabase
    .from('day_blocks')
    .select('id,date,start_time,end_time,title,description,block_type,status')
    .gte('date', start)
    .lte('date', end)
    .order('date')
    .order('start_time')

  return (data ?? []).map((r) => ({
    id: r.id as string,
    date: r.date as string,
    title: (r.title as string) ?? '',
    domain: blockTypeToDomain((r.block_type as string) ?? ''),
    start: toHHMM(r.start_time as string),
    end: toHHMM(r.end_time as string),
    rationale: (r.description as string) ?? '',
    kind: 'event' as const,
    source: 'calendar' as const,
    locked: true,
  }))
}

/**
 * Lock a proposed plan block into `day_blocks` (the app's calendar mirror) so it
 * survives reloads and shows up as a real appointment. Returns the new row id.
 */
export async function insertDayBlock(b: {
  date: string
  start: string
  end: string
  title: string
  description?: string
  domain: Domain
  status?: string
}): Promise<string | null> {
  const rand = Math.random().toString(36).slice(2, 8)
  return insertRow('day_blocks', {
    external_id: `plan-${b.date}-${b.start.replace(':', '')}-${rand}`,
    date: b.date,
    start_time: b.start,
    end_time: b.end,
    title: b.title,
    description: b.description ?? '',
    block_type: b.domain,
    status: b.status ?? 'planned',
  })
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

  const day = today()
  return habitRows.map((h) => {
    const datesSet = logByHabit.get(h.id as string) ?? new Set<string>()
    const history = [...datesSet].sort()
    return {
      id: h.id as string,
      name: h.name as string,
      emoji: (h.icon as string) ?? '✅',
      color: (h.color as string) ?? undefined,
      streak: habitStreak(datesSet, day),
      doneToday: datesSet.has(day),
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

const GOAL_COLS: Record<string, string> = {
  title: 'title',
  domain: 'domain',
  target: 'target_value',
  metric: 'unit',
  deadline: 'due_on',
}

/** Progress a goal stores (0..1) from a current/target pair. */
function goalProgress(current: number, target: number): number {
  return target > 0 ? Math.max(0, Math.min(1, current / target)) : 0
}

/** Insert a goal (status 'active') and return the new id, or null when signed out/failed. */
export async function createGoalRow(goal: Omit<Goal, 'id'>): Promise<string | null> {
  return insertRow('goals', {
    title: goal.title,
    domain: goal.domain,
    target_value: goal.target,
    unit: goal.metric,
    due_on: goal.deadline || null,
    progress: goalProgress(goal.current, goal.target),
    status: 'active',
  })
}

/**
 * Patch a goal. `current`/`target` never map to a column directly — they drive
 * the derived `progress` — so the caller passes the final progress in `progress`.
 */
export async function updateGoalRow(
  id: string,
  patch: Partial<Goal>,
  progress?: number,
): Promise<{ ok: boolean; count: number }> {
  // Never send an empty deadline to a `date` column.
  const clean: Partial<Goal> = { ...patch }
  if (clean.deadline === '') delete clean.deadline
  const extra = progress !== undefined ? { progress } : undefined
  return updateRow('goals', id, clean, GOAL_COLS, extra)
}

export async function deleteGoalRow(id: string): Promise<void> {
  return deleteRow('goals', id)
}

// ── Dog tracker ───────────────────────────────────────────────────────────────

export async function fetchDogEntries(): Promise<DogEntry[]> {
  return fetchRows('dog_log', 'id,kind,happened_at,duration_min,distance_km,notes', { column: 'happened_at', ascending: false, limit: 100 }, (r) => ({
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

/** Classify an app by name into the ScreenDay app categories. Known productivity
 *  apps map to 'work'; everything unrecognised is 'other' (NOT 'work' — the old
 *  default silently counted games/browsers/unknown apps as focus time). */
function classifyApp(name: string): 'work' | 'social' | 'media' | 'comms' | 'other' {
  const n = name.toLowerCase()
  if (/whatsapp|instagram|snapchat|tinder|reddit|facebook|tiktok|discord|messenger|twitter|\bx\b|threads|bereal|linkedin/.test(n)) return 'social'
  if (/youtube|spotify|soundcloud|netflix|videoland|twitch|disney|prime video|podcast|muziek|music|film/.test(n)) return 'media'
  if (/gmail|\bmail\b|telefoon|phone|berichten|messages|\bsms\b|teams|outlook|signal|telegram/.test(n)) return 'comms'
  if (/docs|sheets|slides|word|excel|powerpoint|notion|figma|canva|code|github|gitlab|slack|drive|calendar|agenda|jira|linear|vscode|xcode|terminal/.test(n)) return 'work'
  return 'other'
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
  return fetchRows('clients', 'id,name,domain,client_status,potentie,scope,first_contact,email,website_url,notion_url,last_contacted_at,follow_up_cycle_days,aliases,research_note,researched_at', { column: 'name', ascending: true }, (r) => ({
    id:               r.id as string,
    name:             r.name as string,
    domain:           ((r.domain as Domain) ?? 'personal'),
    clientStatus:     (r.client_status as ClientStatus) ?? null,
    potentie:         (r.potentie as Client['potentie']) ?? null,
    scope:            (r.scope as number) ?? null,
    firstContact:     (r.first_contact as string) ?? null,
    email:            (r.email as string) ?? null,
    website:          (r.website_url as string) ?? null,
    lastContactedAt:  (r.last_contacted_at as string) ?? null,
    followUpCycleDays: (r.follow_up_cycle_days as number) ?? 30,
    aliases:          (r.aliases as string[]) ?? [],
    researchNote:     (r.research_note as string) ?? null,
    researchedAt:     (r.researched_at as string) ?? null,
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

const CLIENT_COLS: Record<string, string> = {
  name: 'name',
  clientStatus: 'client_status',
  potentie: 'potentie',
  scope: 'scope',
  firstContact: 'first_contact',
  email: 'email',
  website: 'website_url',
  domain: 'domain',
  lastContactedAt: 'last_contacted_at',
  followUpCycleDays: 'follow_up_cycle_days',
  aliases: 'aliases',
  researchNote: 'research_note',
  researchedAt: 'researched_at',
}

export async function createClientRow(c: Omit<Client, 'id'>): Promise<Client | null> {
  const id = await insertRow('clients', {
    external_id: localExternalId(),
    name: c.name,
    client_status: c.clientStatus ?? null,
    potentie: c.potentie ?? null,
    scope: c.scope ?? null,
    first_contact: c.firstContact ?? null,
    email: c.email ?? null,
    website_url: c.website ?? null,
    domain: c.domain,
    last_contacted_at: c.lastContactedAt ?? null,
    follow_up_cycle_days: c.followUpCycleDays ?? 30,
    research_note: c.researchNote ?? null,
    researched_at: c.researchedAt ?? null,
  })
  return id ? { ...c, id } : null
}

export async function updateClientRow(id: string, patch: Partial<Client>): Promise<void> {
  await updateRow('clients', id, patch, CLIENT_COLS)
}

export async function deleteClientRow(id: string): Promise<void> {
  if (!isDbId(id)) return
  // Detach projects first so the FK (on delete set null) leaves them orphaned-but-alive.
  await supabase.from('projects').update({ client_id: null }).eq('client_id', id)
  return deleteRow('clients', id)
}

// ── Projects (native create / update / delete) ──────────────────────────────

const PROJECT_COLS: Record<string, string> = {
  name: 'name',
  client: 'client',
  clientId: 'client_id',
  domain: 'domain',
  status: 'status',
  deadline: 'deadline',
  startDate: 'start_datum',
  value: 'value',
  progress: 'progress',
  type: 'type',
  priority: 'prioriteit',
  deliverables: 'deliverables',
  scope: 'scope_text',
  notes: 'notes',
  archived: 'archived',
}

export async function createProjectRow(p: Omit<Project, 'id'>): Promise<Project | null> {
  const id = await insertRow('projects', {
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
  return id ? { ...p, id } : null
}

/**
 * Full update of any editable project field (always stamps updated_at).
 * Returns whether the write landed; retries once if the first attempt does not
 * affect a row (transient auth/session races on a just-loaded page).
 */
export async function updateProjectRow(id: string, patch: Partial<Project>): Promise<{ ok: boolean; count: number }> {
  const res = await updateRow('projects', id, patch, PROJECT_COLS, { updated_at: new Date().toISOString() })
  if (res.ok || !isDbId(id)) return res
  return updateRow('projects', id, patch, PROJECT_COLS, { updated_at: new Date().toISOString() })
}

export async function deleteProjectRow(id: string): Promise<void> {
  return deleteRow('projects', id)
}

// ── Milestones ──────────────────────────────────────────────────────────────

export async function fetchMilestones(): Promise<ProjectMilestone[]> {
  return fetchRows('project_milestones', 'id,project_id,title,due_date,progress,done,order_idx', { column: 'order_idx', ascending: true }, (r) => ({
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
  if (!isDbId(projectId)) return null
  return insertRow('project_milestones', {
    project_id: projectId,
    title: m.title, due_date: m.dueDate ?? null,
    progress: m.progress ?? 0, done: m.done ?? false,
  })
}

const MILESTONE_COLS: Record<string, string> = {
  title: 'title',
  dueDate: 'due_date',
  progress: 'progress',
  done: 'done',
}

export async function updateMilestoneRow(id: string, patch: Partial<ProjectMilestone>): Promise<void> {
  await updateRow('project_milestones', id, patch, MILESTONE_COLS)
}

export async function deleteMilestoneRow(id: string): Promise<void> {
  return deleteRow('project_milestones', id)
}

// ── Project tasks ─────────────────────────────────────────────────────────────

export async function fetchProjectTaskRows(): Promise<ProjectTask[]> {
  return fetchRows('project_tasks', 'id,project_id,name,done,due_date,priority,recurrence,recur_every,last_done_on,order_idx', { column: 'order_idx', ascending: true }, (r) => ({
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
  if (!isDbId(projectId)) return null
  return insertRow('project_tasks', {
    project_id: projectId,
    name: t.name, done: t.done ?? false, due_date: t.dueDate ?? null,
    priority: t.priority ?? null, recurrence: t.recurrence ?? null,
    recur_every: t.recurEvery ?? 1, last_done_on: t.lastDoneOn ?? null,
  })
}

const PROJECT_TASK_COLS: Record<string, string> = {
  name: 'name',
  done: 'done',
  dueDate: 'due_date',
  priority: 'priority',
  recurrence: 'recurrence',
  recurEvery: 'recur_every',
  lastDoneOn: 'last_done_on',
}

export async function updateProjectTaskRow(id: string, patch: Partial<ProjectTask>): Promise<void> {
  await updateRow('project_tasks', id, patch, PROJECT_TASK_COLS)
}

export async function deleteProjectTaskRow(id: string): Promise<void> {
  return deleteRow('project_tasks', id)
}

// ── Hours (time tracker) ──────────────────────────────────────────────────────

export async function fetchHours(): Promise<HourEntry[]> {
  return fetchRows('project_hours', 'id,project_id,on_date,hours,note,billable,billed', { column: 'on_date', ascending: false }, (r) => ({
    id: r.id as string,
    projectId: r.project_id as string,
    date: r.on_date as string,
    hours: (r.hours as number) ?? 0,
    note: (r.note as string) ?? null,
    billable: (r.billable as boolean) ?? true,
    billed: (r.billed as boolean) ?? false,
  }))
}

/** Flag hours as billed once an invoice has drawn from them (no-op for non-DB ids). */
export async function markHoursBilled(ids: string[]): Promise<void> {
  const dbIds = ids.filter(isDbId)
  if (!dbIds.length) return
  const { error } = await supabase.from('project_hours').update({ billed: true }).in('id', dbIds)
  warnWrite('project_hours.billed', error)
}

export async function createHourRow(
  projectId: string,
  h: Omit<HourEntry, 'id' | 'projectId'>,
): Promise<string | null> {
  if (!isDbId(projectId)) return null
  return insertRow('project_hours', {
    project_id: projectId,
    on_date: h.date, hours: h.hours, note: h.note ?? null, billable: h.billable ?? true,
  })
}

export async function deleteHourRow(id: string): Promise<void> {
  return deleteRow('project_hours', id)
}

// ── Invoices ──────────────────────────────────────────────────────────────────

export async function fetchInvoices(): Promise<Invoice[]> {
  return fetchRows('project_invoices', 'id,project_id,number,amount,status,issued_on,due_on,paid_on,note', { column: 'issued_on', ascending: false, nullsFirst: false }, (r) => ({
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
  if (!isDbId(projectId)) return null
  return insertRow('project_invoices', {
    project_id: projectId,
    number: inv.number ?? '', amount: inv.amount ?? 0, status: inv.status ?? 'draft',
    issued_on: inv.issuedOn ?? null, due_on: inv.dueOn ?? null, paid_on: inv.paidOn ?? null,
    note: inv.note ?? null,
  })
}

const INVOICE_COLS: Record<string, string> = {
  number: 'number',
  amount: 'amount',
  status: 'status',
  issuedOn: 'issued_on',
  dueOn: 'due_on',
  paidOn: 'paid_on',
  note: 'note',
}

export async function updateInvoiceRow(id: string, patch: Partial<Invoice>): Promise<void> {
  await updateRow('project_invoices', id, patch, INVOICE_COLS)
}

export async function deleteInvoiceRow(id: string): Promise<void> {
  return deleteRow('project_invoices', id)
}

// ── Activity log ──────────────────────────────────────────────────────────────

export async function fetchActivity(): Promise<ActivityEntry[]> {
  return fetchRows('project_activity', 'id,project_id,body,link_type,link_id,action,created_at', { column: 'created_at', ascending: false, limit: 500 }, (r) => ({
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
  if (!isDbId(projectId)) return null
  return insertRow('project_activity', {
    project_id: projectId,
    body: a.body, link_type: a.linkType ?? null, link_id: a.linkId ?? null, action: a.action ?? null,
  })
}

export async function deleteActivityRow(id: string): Promise<void> {
  return deleteRow('project_activity', id)
}

// ── Client messages (unified inbox) ───────────────────────────────────────────

export async function fetchClientMessages(): Promise<Message[]> {
  return fetchRows('client_messages', 'id,client_id,project_id,channel,direction,contact,contact_key,subject,snippet,body,ts,unread,source,external_id', { column: 'ts', ascending: false, limit: 2000 }, (r) => ({
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

function messageToRow(m: Omit<Message, 'id'>): Record<string, unknown> {
  return {
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
  const id = await insertRow('client_messages', messageToRow(m))
  // Fire-and-forget: mirror as a real vault note ("chat inputs" — email/
  // WhatsApp/Fiverr). Deliberately not wired into insertMessages() (bulk
  // WhatsApp import) — materialising an entire historical import as
  // individual files would flood the vault; this covers new/live messages.
  const text = m.body ?? m.snippet
  if (id && text) {
    void supabase.functions
      .invoke('materialize-note', {
        body: { source: 'message', id, frontmatter: { channel: m.channel, direction: m.direction, contact: m.contact, client_id: m.clientId, subject: m.subject }, body: text },
      })
      .catch(() => {})
    // Fire-and-forget: feed the cognee knowledge-graph worker (no-op without
    // COGNEE_WORKER_URL/COGNEE_WORKER_SECRET configured server-side).
    void supabase.functions
      .invoke('cognee-remember', { body: { source: 'message', id, text } })
      .catch(() => {})
  }
  return id
}

/** Bulk insert (WhatsApp import); skips rows that already exist by external_id. */
export async function insertMessages(msgs: Omit<Message, 'id'>[]): Promise<number> {
  const user_id = await currentUserId()
  if (!user_id || !msgs.length) return 0
  const rows = msgs.map((m) => ({ ...messageToRow(m), user_id }))
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
  return deleteRow('client_messages', id)
}

// ── App settings (one owner-scoped row) ───────────────────────────────────────

export async function fetchAppSettings(): Promise<AppSettings | null> {
  const { data } = await supabase.from('app_settings').select('hourly_rate').maybeSingle()
  if (!data) return null
  return { hourlyRate: (data.hourly_rate as number) ?? 0 }
}

export async function upsertAppSettings(patch: Partial<AppSettings>): Promise<boolean> {
  const user_id = await currentUserId()
  if (!user_id) return false
  const { error } = await supabase.from('app_settings').upsert(
    {
      user_id,
      ...(patch.hourlyRate !== undefined && { hourly_rate: patch.hourlyRate }),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )
  warnWrite('app_settings', error)
  return !error
}

// ── Inference engine (PM-201 Slice 1) ─────────────────────────────────────────
// Pending inferences are events with status='inferred', produced by the
// run_inference() rules. confirm_inference() resolves one (status + effect).

export async function fetchPendingInferences(): Promise<InferredItem[]> {
  const { data } = await supabase
    .from('events')
    .select('id,rule_id,type,domains,confidence,occurred_at,payload')
    .eq('status', 'inferred')
    .order('occurred_at', { ascending: false })
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const payload = (r.payload as Record<string, unknown>) ?? {}
    return {
      id: r.id as string,
      ruleId: (r.rule_id as string) ?? null,
      type: r.type as string,
      domains: ((r.domains as LifeDomain[]) ?? []),
      confidence: Number(r.confidence ?? 0),
      question: (payload.question as string) ?? `Bevestig: ${r.type as string}`,
      occurredAt: r.occurred_at as string,
      payload,
    }
  })
}

/** Resolve a pending inference. The RPC enforces ownership and applies the effect. */
export async function confirmInference(id: string, decision: InferenceDecision): Promise<boolean> {
  const { data, error } = await supabase.rpc('confirm_inference', { p_event_id: id, p_decision: decision })
  warnWrite('confirm_inference', error)
  return data === true
}

// ── Mensen / relaties (Slice 2) ───────────────────────────────────────────────

export async function fetchPeople(): Promise<Person[]> {
  return fetchRows('person', 'id,display_name,kind,emails,phones,birthday,cadence_days,last_interaction_at,client_id,notes,tier', { column: 'display_name' }, (r) => ({
    id: r.id as string,
    displayName: (r.display_name as string) ?? '',
    kind: (r.kind as Person['kind']) ?? 'network',
    emails: (r.emails as string[]) ?? [],
    phones: (r.phones as string[]) ?? [],
    birthday: (r.birthday as string) ?? null,
    cadenceDays: (r.cadence_days as number) ?? null,
    lastInteractionAt: (r.last_interaction_at as string) ?? null,
    clientId: (r.client_id as string) ?? null,
    notes: (r.notes as string) ?? null,
    tier: (r.tier as Person['tier']) ?? 'normaal',
  }))
}

const PERSON_COLS: Record<string, string> = {
  displayName: 'display_name', kind: 'kind', emails: 'emails', phones: 'phones',
  birthday: 'birthday', cadenceDays: 'cadence_days', lastInteractionAt: 'last_interaction_at',
  clientId: 'client_id', notes: 'notes', tier: 'tier',
}

export async function createPersonRow(p: Omit<Person, 'id'>): Promise<string | null> {
  return insertRow('person', {
    display_name: p.displayName, kind: p.kind, emails: p.emails, phones: p.phones,
    birthday: p.birthday, cadence_days: p.cadenceDays, client_id: p.clientId,
    notes: p.notes, tier: p.tier,
  })
}

export async function updatePersonRow(id: string, patch: Partial<Person>): Promise<void> {
  await updateRow('person', id, patch, PERSON_COLS, { updated_at: new Date().toISOString() })
}

export async function deletePersonRow(id: string): Promise<void> {
  return deleteRow('person', id)
}

export async function fetchInteractions(): Promise<Interaction[]> {
  return fetchRows('interaction', 'id,person_id,channel,direction,summary,owed_reply,occurred_at', { column: 'occurred_at', ascending: false }, (r) => ({
    id: r.id as string,
    personId: (r.person_id as string) ?? null,
    channel: (r.channel as Interaction['channel']) ?? 'mail',
    direction: (r.direction as Interaction['direction']) ?? 'in',
    summary: (r.summary as string) ?? null,
    owedReply: (r.owed_reply as boolean) ?? false,
    occurredAt: r.occurred_at as string,
  }))
}

export async function createInteractionRow(i: Omit<Interaction, 'id'>): Promise<string | null> {
  const id = await insertRow('interaction', {
    person_id: i.personId, channel: i.channel, direction: i.direction,
    summary: i.summary, owed_reply: i.owedReply, occurred_at: i.occurredAt,
  })
  // Keep the person's last_interaction_at fresh so "too long since contact" stays honest.
  if (id && i.personId) await updateRow('person', i.personId, { lastInteractionAt: i.occurredAt }, PERSON_COLS)
  // Fire-and-forget: feed search_memory()'s hybrid recall. No-op without
  // VOYAGE_API_KEY configured server-side — never blocks or throws here.
  if (id && i.summary) {
    void supabase.functions
      .invoke('embed-memory', { body: { source: 'interaction', id, text: i.summary } })
      .catch(() => {})
    // Fire-and-forget: mirror as a real vault note (rows created here are
    // always tier='normaal' — the app never sets tier='geheim' on insert).
    void supabase.functions
      .invoke('materialize-note', {
        body: {
          source: 'interaction', id,
          frontmatter: { channel: i.channel, direction: i.direction, person_id: i.personId, created: i.occurredAt?.slice(0, 10) },
          body: i.summary,
        },
      })
      .catch(() => {})
    // Fire-and-forget: feed the cognee knowledge-graph worker (no-op without
    // COGNEE_WORKER_URL/COGNEE_WORKER_SECRET configured server-side).
    void supabase.functions
      .invoke('cognee-remember', { body: { source: 'interaction', id, text: i.summary } })
      .catch(() => {})
  }
  return id
}

// ── Huis & admin (Slice 2) ────────────────────────────────────────────────────

export async function fetchAdminItems(): Promise<AdminItem[]> {
  return fetchRows('admin_item', 'id,title,category,provider,renewal_on,notice_period_days,amount,cancellable,notes,tier', { column: 'renewal_on', ascending: true, nullsFirst: false }, (r) => ({
    id: r.id as string,
    title: (r.title as string) ?? '',
    category: (r.category as AdminItem['category']) ?? 'contract',
    provider: (r.provider as string) ?? null,
    renewalOn: (r.renewal_on as string) ?? null,
    noticePeriodDays: (r.notice_period_days as number) ?? null,
    amount: (r.amount as number) ?? null,
    cancellable: (r.cancellable as boolean) ?? false,
    notes: (r.notes as string) ?? null,
    tier: (r.tier as AdminItem['tier']) ?? 'normaal',
  }))
}

const ADMIN_COLS: Record<string, string> = {
  title: 'title', category: 'category', provider: 'provider', renewalOn: 'renewal_on',
  noticePeriodDays: 'notice_period_days', amount: 'amount', cancellable: 'cancellable',
  notes: 'notes', tier: 'tier',
}

export async function createAdminItemRow(a: Omit<AdminItem, 'id'>): Promise<string | null> {
  return insertRow('admin_item', {
    title: a.title, category: a.category, provider: a.provider, renewal_on: a.renewalOn,
    notice_period_days: a.noticePeriodDays, amount: a.amount, cancellable: a.cancellable,
    notes: a.notes, tier: a.tier,
  })
}

export async function updateAdminItemRow(id: string, patch: Partial<AdminItem>): Promise<void> {
  await updateRow('admin_item', id, patch, ADMIN_COLS, { updated_at: new Date().toISOString() })
}

export async function deleteAdminItemRow(id: string): Promise<void> {
  return deleteRow('admin_item', id)
}

// ── Gezondheidsdossier (Slice 2) ──────────────────────────────────────────────

export async function fetchHealthConditions(): Promise<HealthCondition[]> {
  return fetchRows('health_condition', 'id,subject,label,opened_at,status,notes,tier', { column: 'opened_at', ascending: false }, (r) => ({
    id: r.id as string,
    subject: (r.subject as string) ?? 'rick',
    label: (r.label as string) ?? '',
    openedAt: (r.opened_at as string) ?? '',
    status: (r.status as HealthCondition['status']) ?? 'active',
    notes: (r.notes as string) ?? null,
    tier: (r.tier as HealthCondition['tier']) ?? 'geheim',
  }))
}

// ── Geheugen & retrieval (Slice 3) ────────────────────────────────────────────

export async function fetchSummaries(): Promise<MemorySummary[]> {
  return fetchRows('summaries', 'id,period,period_start,domain,text,event_count,tier', { column: 'period_start', ascending: false, limit: 60 }, (r) => ({
    id: r.id as string,
    period: (r.period as string) ?? 'day',
    periodStart: (r.period_start as string) ?? '',
    domain: (r.domain as string) ?? 'all',
    text: (r.text as string) ?? '',
    eventCount: (r.event_count as number) ?? 0,
    tier: (r.tier as MemorySummary['tier']) ?? 'normaal',
  }))
}

// Tables the vault mirrors (materialize-note) → their vault folder. Used only
// to purge the matching .md file below — forget() itself has no reach into
// Storage, and content "mag niet achterblijven" applies just as much to a
// vault file as to the row/event-log copies it already handles.
const VAULT_SOURCE_BY_TABLE: Record<string, string> = {
  braindump_entries: 'braindump',
  interaction: 'interaction',
}

/**
 * Right-to-be-forgotten (Slice 4): hard-delete a record, purge its mirrored copy
 * in the event-log, and leave a contentless tombstone. The RPC enforces ownership
 * and the allowed-table list. Use for tier=geheim records the user wants gone.
 */
export async function forgetRecord(table: string, id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('forget', { p_table: table, p_id: id })
  warnWrite('forget', error)
  const forgotten = data === true
  const vaultSource = VAULT_SOURCE_BY_TABLE[table]
  if (forgotten && vaultSource) {
    void supabase.storage.from('vault').remove([`${vaultSource}/${id}.md`]).catch(() => {})
  }
  return forgotten
}

/**
 * Tier-safe hybrid recall over normaal-tier memory (braindump/interaction/summaries).
 * Proxies through the memory-search Edge Function so the Voyage embedding key
 * never ships to the frontend; falls back to plain full-text ranking
 * server-side when no embedding key is configured.
 */
export async function searchMemory(query: string, limit = 8): Promise<MemoryHit[]> {
  if (!query.trim()) return []
  const { data, error } = await supabase.functions.invoke('memory-search', { body: { query, limit } })
  warnWrite('search_memory', error)
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    source: (r.source as string) ?? '',
    title: (r.title as string) ?? '',
    snippet: (r.snippet as string) ?? '',
    ts: (r.ts as string) ?? '',
    rank: Number(r.rank ?? 0),
  }))
}

// ── Strategie HQ: business ideas ─────────────────────────────────────────────
// A voice note or typed text becomes one row, then idea-elaborate (an edge
// function, invoked fire-and-forget like braindump-ingest) fills in every
// analysis field. jsonb columns default to '[]'/'{}' server-side, but a idea
// stuck in 'pending'/'processing' has them null — the mapper below always
// returns array/object shapes so the UI never has to null-check.

const BUSINESS_IDEA_COLS =
  'id,created_at,updated_at,source,raw_input,elaboration_status,error,status,title,overview,domain,tags,feasibility_score,feasibility_reasoning,timeline,milestones,financials,risks,opportunities,swot,markdown,tier'

function mapBusinessIdeaRow(r: Record<string, unknown>): BusinessIdea {
  const financials = (r.financials as Record<string, unknown>) ?? {}
  const swot = (r.swot as Record<string, unknown>) ?? {}
  return {
    id: r.id as string,
    createdAt: (r.created_at as string) ?? new Date().toISOString(),
    updatedAt: (r.updated_at as string) ?? (r.created_at as string) ?? new Date().toISOString(),
    source: ((r.source as BusinessIdea['source']) ?? 'text'),
    rawInput: (r.raw_input as string) ?? null,
    elaborationStatus: ((r.elaboration_status as BusinessIdea['elaborationStatus']) ?? 'pending'),
    error: (r.error as string) ?? null,
    status: ((r.status as BusinessIdea['status']) ?? 'idea'),
    title: (r.title as string) ?? 'Nieuw idee',
    overview: (r.overview as string) ?? null,
    domain: (r.domain as BusinessIdea['domain']) ?? 'cross',
    tags: (r.tags as string[]) ?? [],
    feasibilityScore: (r.feasibility_score as number) ?? null,
    feasibilityReasoning: (r.feasibility_reasoning as string) ?? null,
    timeline: (r.timeline as string) ?? null,
    milestones: (r.milestones as BusinessIdea['milestones']) ?? [],
    financials: {
      investmentNeeded: (financials.investmentNeeded as number) ?? null,
      revenueProjection: (financials.revenueProjection as BusinessIdea['financials']['revenueProjection']) ?? [],
      costs: (financials.costs as BusinessIdea['financials']['costs']) ?? [],
      breakEven: (financials.breakEven as string) ?? null,
      notes: (financials.notes as string) ?? null,
    },
    risks: (r.risks as BusinessIdea['risks']) ?? [],
    opportunities: (r.opportunities as BusinessIdea['opportunities']) ?? [],
    swot: {
      strengths: (swot.strengths as string[]) ?? [],
      weaknesses: (swot.weaknesses as string[]) ?? [],
      opportunities: (swot.opportunities as string[]) ?? [],
      threats: (swot.threats as string[]) ?? [],
    },
    markdown: (r.markdown as string) ?? null,
    tier: (r.tier as BusinessIdea['tier']) ?? 'normaal',
  }
}

export async function fetchBusinessIdeas(): Promise<BusinessIdea[]> {
  return fetchRows('business_ideas', BUSINESS_IDEA_COLS, { column: 'created_at', ascending: false, limit: 300 }, mapBusinessIdeaRow)
}

/** Insert a fresh idea row (elaboration_status/status default server-side) and return it. */
export async function insertBusinessIdeaRow(input: {
  title: string
  source: IdeaSource
  rawInput: string
  domain?: BusinessIdea['domain']
}): Promise<BusinessIdea | null> {
  const user_id = await currentUserId()
  if (!user_id) return null
  const { data, error } = await supabase
    .from('business_ideas')
    .insert({
      user_id,
      title: input.title,
      source: input.source,
      raw_input: input.rawInput,
      domain: input.domain ?? 'cross',
    })
    .select(BUSINESS_IDEA_COLS)
    .single()
  warnWrite('business_ideas.insert', error)
  return data ? mapBusinessIdeaRow(data) : null
}

const BUSINESS_IDEA_COL_MAP: Record<string, string> = {
  title: 'title',
  overview: 'overview',
  domain: 'domain',
  tags: 'tags',
  status: 'status',
  feasibilityScore: 'feasibility_score',
  feasibilityReasoning: 'feasibility_reasoning',
  timeline: 'timeline',
  milestones: 'milestones',
  financials: 'financials',
  risks: 'risks',
  opportunities: 'opportunities',
  swot: 'swot',
  markdown: 'markdown',
  tier: 'tier',
}

/** Manual edit from the detail/edit form — only the fields users can actually change. */
export async function updateBusinessIdeaRow(
  id: string,
  patch: Partial<
    Pick<
      BusinessIdea,
      | 'title'
      | 'overview'
      | 'domain'
      | 'tags'
      | 'status'
      | 'feasibilityScore'
      | 'feasibilityReasoning'
      | 'timeline'
      | 'milestones'
      | 'financials'
      | 'risks'
      | 'opportunities'
      | 'swot'
      | 'markdown'
      | 'tier'
    >
  >,
): Promise<void> {
  await updateRow('business_ideas', id, patch, BUSINESS_IDEA_COL_MAP, { updated_at: new Date().toISOString() })
}

export async function deleteBusinessIdeaRow(id: string): Promise<void> {
  await deleteRow('business_ideas', id)
  if (isDbId(id)) {
    void supabase.storage.from('vault').remove([`business_idea/${id}.md`]).catch(() => {})
  }
}

/**
 * Fire the idea-elaborate pipeline for an entry. Best-effort, same resilience
 * contract as invokeBraindumpIngest(): on failure the row simply stays
 * 'pending'/'processing' and the UI offers a retry.
 */
export async function invokeIdeaElaborate(ideaId: string): Promise<void> {
  try {
    await supabase.functions.invoke('idea-elaborate', { body: { entryId: ideaId } })
  } catch (err) {
    console.warn('[OSLIFE] idea-elaborate invoke failed', err)
  }
}
