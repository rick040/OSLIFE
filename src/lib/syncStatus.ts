// ── Data-source sync status ───────────────────────────────────────────────────
// Health check for every live ingestion pipeline. Each table is written by an
// external connection (Apps Script sheet ingest, Edge Function, Notion sync,
// Gmail/Calendar sync, …). Purely-ingested tables carry an `ingested_at` column
// stamped server-side on every write (see migration 20260711120000), so their
// newest value is a TRUE last-synced time. projects/clients are also edited
// in-app, so they fall back to their own updated_at / synced_at columns. We
// read the freshest value per source and grade it against an expected cadence
// to flag connections that went quiet.

import { supabase } from './supabase'

export type SyncHealth = 'up' | 'slow' | 'down' | 'empty' | 'error'

export interface SyncSource {
  key: string
  label: string
  /** Short human description of the connection / pipeline behind this table. */
  pipeline: string
  table: string
  /** Column whose newest value marks the last sync. `ingested_at` where the
   *  trigger stamps it; otherwise a natural / update timestamp. */
  tsColumn: string
  /** 'date' columns are date-only (local midnight); 'ts' are full timestamptz. */
  tsKind: 'date' | 'ts'
  /** Below this age (hours) the source is healthy. */
  warnH: number
  /** Above this age (hours) the source is considered down. */
  downH: number
  /**
   * True when future-dated rows are normal for the chosen column (only when a
   * source has no ingested_at and must fall back to a future-capable column).
   * Now that ingested_at is always a past write time, this is unused.
   */
  futureOk?: boolean
}

export interface SyncSourceStatus extends SyncSource {
  /** ISO timestamp of the most recent row, or null when the table is empty. */
  lastAt: string | null
  rowCount: number
  ageMs: number | null
  health: SyncHealth
}

// Ordered roughly by how often each source should update. warnH/downH are tuned
// per cadence: near-realtime feeds (mail) get tight windows; irregular ones
// (weight, purchases) get generous ones so a quiet-but-alive feed isn't red.
export const SYNC_SOURCES: SyncSource[] = [
  // ── Gezondheid ── (ingested_at = true server-side sync time)
  { key: 'health', label: 'Gezondheid', pipeline: 'Health Sheet → health-sheets-ingest', table: 'health_daily_stats', tsColumn: 'ingested_at', tsKind: 'ts', warnH: 36, downH: 96 },
  { key: 'sleep', label: 'Slaap', pipeline: 'Health Sheet → health-sheets-ingest', table: 'health_sleep', tsColumn: 'ingested_at', tsKind: 'ts', warnH: 36, downH: 96 },
  { key: 'weight', label: 'Gewicht', pipeline: 'Health Sheet · weegschaal-notificatie (MacroDroid)', table: 'health_body_metrics', tsColumn: 'ingested_at', tsKind: 'ts', warnH: 24 * 14, downH: 24 * 45 },
  // ── Geld ──
  { key: 'finance', label: 'Transacties', pipeline: 'Bank-notificatie (MacroDroid) · Wallet · ABN CSV · Betalingen Sheet', table: 'finance_tx', tsColumn: 'ingested_at', tsKind: 'ts', warnH: 96, downH: 24 * 10 },
  { key: 'payments', label: 'Te betalen', pipeline: 'Payments Calendar → syncPayments', table: 'payments', tsColumn: 'ingested_at', tsKind: 'ts', warnH: 24 * 21, downH: 24 * 60 },
  // ── Digitaal gedrag ──
  { key: 'screentime', label: 'Schermtijd', pipeline: 'Schermtijd Sheet → screentime-sheet-ingest', table: 'screentime', tsColumn: 'ingested_at', tsKind: 'ts', warnH: 48, downH: 24 * 5 },
  { key: 'phone_events', label: 'Telefoon-events', pipeline: 'MacroDroid (unlock/screen-off) → phone-events-ingest', table: 'phone_events', tsColumn: 'ingested_at', tsKind: 'ts', warnH: 18, downH: 48 },
  // ── Communicatie / agenda ──
  { key: 'gmail', label: 'Inbox / mail', pipeline: 'Gmail → syncGmail', table: 'gmail_messages', tsColumn: 'ingested_at', tsKind: 'ts', warnH: 12, downH: 48 },
  { key: 'calendar', label: 'Agenda', pipeline: 'Google Calendar → syncCalendarBlocks', table: 'day_blocks', tsColumn: 'ingested_at', tsKind: 'ts', warnH: 24 * 7, downH: 24 * 21 },
  // ── Notion (CRM) ── (edited in-app too → own update/sync columns)
  { key: 'projects', label: 'Projecten', pipeline: 'Notion → notion-sync (of in-app)', table: 'projects', tsColumn: 'updated_at', tsKind: 'ts', warnH: 24 * 7, downH: 24 * 30 },
  { key: 'clients', label: 'Klanten', pipeline: 'Notion → notion-sync', table: 'clients', tsColumn: 'synced_at', tsKind: 'ts', warnH: 24 * 7, downH: 24 * 30 },
]

/** Turn a date-only string into an ISO timestamp at local end-of-day so a
 *  same-day sync doesn't read as ~24h stale. */
function normalizeTs(value: string, kind: 'date' | 'ts'): string {
  if (kind === 'ts') return value
  // date-only → end of that day (best-case freshness for a daily feed)
  return `${value}T23:59:59`
}

function grade(source: SyncSource, lastAt: string | null): { ageMs: number | null; health: SyncHealth } {
  if (!lastAt) return { ageMs: null, health: 'empty' }
  let ageMs = Date.now() - new Date(lastAt).getTime()
  // Future-dated rows (planned agenda / payments) are fresh, not stale.
  if (ageMs < 0) ageMs = source.futureOk ? 0 : Math.max(0, ageMs)
  const ageH = ageMs / 3_600_000
  if (ageH <= source.warnH) return { ageMs, health: 'up' }
  if (ageH <= source.downH) return { ageMs, health: 'slow' }
  return { ageMs, health: 'down' }
}

async function fetchOne(source: SyncSource): Promise<SyncSourceStatus> {
  try {
    const [latest, counted] = await Promise.all([
      supabase
        .from(source.table)
        .select(source.tsColumn)
        .order(source.tsColumn, { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
      supabase.from(source.table).select('*', { count: 'exact', head: true }),
    ])

    if (latest.error) throw latest.error

    const raw = (latest.data as Record<string, unknown> | null)?.[source.tsColumn] as string | undefined
    const lastAt = raw ? normalizeTs(raw, source.tsKind) : null
    const { ageMs, health } = grade(source, lastAt)
    return { ...source, lastAt, rowCount: counted.count ?? 0, ageMs, health }
  } catch (err) {
    console.warn(`[OSLIFE] sync status failed for ${source.table}`, err)
    return { ...source, lastAt: null, rowCount: 0, ageMs: null, health: 'error' }
  }
}

/** Query every source's latest-row timestamp + row count in parallel. */
export async function fetchSyncStatus(): Promise<SyncSourceStatus[]> {
  return Promise.all(SYNC_SOURCES.map(fetchOne))
}

// ── Presentation helpers ──────────────────────────────────────────────────────

/** Dutch relative time: "3 uur geleden", "over 2 dagen", "zojuist", "nooit". */
export function humanizeAge(lastAt: string | null): string {
  if (!lastAt) return 'nooit'
  const ms = Date.now() - new Date(lastAt).getTime()
  const future = ms < 0
  const abs = Math.abs(ms)
  const min = Math.floor(abs / 60_000)
  const fmt = (n: number, unit: string, plural: string) =>
    future ? `over ${n} ${n === 1 ? unit : plural}` : `${n} ${n === 1 ? unit : plural} geleden`

  if (min < 1) return future ? 'zo meteen' : 'zojuist'
  if (min < 60) return fmt(min, 'min', 'min')
  const h = Math.floor(min / 60)
  if (h < 24) return fmt(h, 'uur', 'uur')
  const d = Math.floor(h / 24)
  if (d < 30) return fmt(d, 'dag', 'dagen')
  const mo = Math.floor(d / 30)
  if (mo < 12) return fmt(mo, 'maand', 'maanden')
  return fmt(Math.floor(mo / 12), 'jaar', 'jaar')
}

/** Absolute local timestamp for the tooltip / subline. */
export function formatAbsolute(lastAt: string | null): string {
  if (!lastAt) return '—'
  return new Date(lastAt).toLocaleString('nl-NL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Amsterdam',
  })
}

export const HEALTH_META: Record<SyncHealth, { label: string; hex: string; dot: string }> = {
  up: { label: 'Actief', hex: '#6FA07C', dot: '#6FA07C' },
  slow: { label: 'Vertraagd', hex: '#C6A05B', dot: '#C6A05B' },
  down: { label: 'Offline', hex: '#C58392', dot: '#C58392' },
  empty: { label: 'Geen data', hex: '#8C9080', dot: '#B4B8AC' },
  error: { label: 'Fout', hex: '#C58392', dot: '#C58392' },
}
