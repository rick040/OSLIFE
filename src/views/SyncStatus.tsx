import { useEffect, useState, useCallback } from 'react'
import {
  Activity,
  Moon,
  Scale,
  Wallet,
  CalendarClock,
  MonitorSmartphone,
  Mail,
  CalendarRange,
  FolderKanban,
  Users,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  MinusCircle,
} from 'lucide-react'
import { SectionTitle } from '../components/ui'
import {
  fetchSyncStatus,
  humanizeAge,
  formatAbsolute,
  HEALTH_META,
  type SyncSourceStatus,
  type SyncHealth,
} from '../lib/syncStatus'

// Per-source icon + accent colour (presentation only; the data lives in the lib).
const META: Record<string, { icon: typeof Activity; hex: string }> = {
  health: { icon: Activity, hex: '#C58392' },
  sleep: { icon: Moon, hex: '#6E8CA8' },
  weight: { icon: Scale, hex: '#9385B0' },
  finance: { icon: Wallet, hex: '#C6A05B' },
  payments: { icon: CalendarClock, hex: '#C6A05B' },
  screentime: { icon: MonitorSmartphone, hex: '#6E8CA8' },
  gmail: { icon: Mail, hex: '#6FA07C' },
  calendar: { icon: CalendarRange, hex: '#6FA07C' },
  projects: { icon: FolderKanban, hex: '#7C6FA0' },
  clients: { icon: Users, hex: '#7C6FA0' },
}

const HEALTH_ICON: Record<SyncHealth, typeof CheckCircle2> = {
  up: CheckCircle2,
  slow: AlertTriangle,
  down: XCircle,
  empty: MinusCircle,
  error: XCircle,
}

function StatusPill({ health }: { health: SyncHealth }) {
  const meta = HEALTH_META[health]
  const Icon = HEALTH_ICON[health]
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ background: `${meta.hex}1A`, color: meta.hex }}
    >
      <Icon className="h-3 w-3" /> {meta.label}
    </span>
  )
}

function SourceCard({ s }: { s: SyncSourceStatus }) {
  const meta = META[s.key] ?? { icon: Activity, hex: '#8C9080' }
  const Icon = meta.icon
  const dot = HEALTH_META[s.health].dot
  return (
    <div className="card p-4 flex gap-3.5">
      <span
        className="h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 relative"
        style={{ background: `${meta.hex}22` }}
      >
        <Icon className="h-5 w-5" style={{ color: meta.hex }} />
        <span
          className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface"
          style={{ background: dot }}
        />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-ink truncate">{s.label}</span>
          <StatusPill health={s.health} />
        </div>
        <div className="text-[11px] text-faint truncate mt-0.5">{s.pipeline}</div>
        <div className="flex items-center justify-between gap-2 mt-2">
          <div className="text-xs text-muted" title={formatAbsolute(s.lastAt)}>
            <span className="text-faint">Laatste data: </span>
            <span className="font-medium text-ink">{humanizeAge(s.lastAt)}</span>
          </div>
          <span className="chip bg-sunken text-muted tabular-nums shrink-0">
            {s.rowCount.toLocaleString('nl-NL')} rijen
          </span>
        </div>
      </div>
    </div>
  )
}

export default function SyncStatus() {
  const [sources, setSources] = useState<SyncSourceStatus[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const data = await fetchSyncStatus()
    setSources(data)
    setLastChecked(new Date())
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const counts = (sources ?? []).reduce(
    (acc, s) => {
      acc.total++
      if (s.health === 'up') acc.up++
      else if (s.health === 'slow') acc.slow++
      else if (s.health === 'down' || s.health === 'error') acc.down++
      else acc.empty++
      return acc
    },
    { total: 0, up: 0, slow: 0, down: 0, empty: 0 },
  )

  const allGood = counts.total > 0 && counts.up === counts.total
  const anyDown = counts.down > 0
  const bannerHex = anyDown ? '#C58392' : counts.slow > 0 ? '#C6A05B' : allGood ? '#6FA07C' : '#8C9080'

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Databronnen</h1>
          <p className="text-sm text-muted">
            Status van elke live-verbinding en wanneer er voor het laatst data binnenkwam.
          </p>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={loading}
          className="btn-ghost !py-1.5 shrink-0"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Ververs
        </button>
      </div>

      {/* Summary banner */}
      <div
        className="card p-4 flex items-center gap-4"
        style={{ borderColor: `${bannerHex}55`, background: `${bannerHex}0D` }}
      >
        <span
          className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: `${bannerHex}22` }}
        >
          {anyDown ? (
            <XCircle className="h-6 w-6" style={{ color: bannerHex }} />
          ) : allGood ? (
            <CheckCircle2 className="h-6 w-6" style={{ color: bannerHex }} />
          ) : (
            <AlertTriangle className="h-6 w-6" style={{ color: bannerHex }} />
          )}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-base font-semibold text-ink">
            {loading && !sources
              ? 'Verbindingen controleren…'
              : allGood
                ? 'Alle verbindingen actief'
                : anyDown
                  ? `${counts.down} verbinding${counts.down > 1 ? 'en' : ''} offline`
                  : counts.slow > 0
                    ? `${counts.slow} verbinding${counts.slow > 1 ? 'en' : ''} vertraagd`
                    : 'Nog geen data ontvangen'}
          </div>
          <div className="text-xs text-muted mt-0.5 tabular-nums">
            {counts.up} actief · {counts.slow} vertraagd · {counts.down} offline · {counts.empty} leeg
            {lastChecked && (
              <span className="text-faint">
                {' '}
                · gecontroleerd{' '}
                {lastChecked.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Source cards */}
      <div>
        <SectionTitle hint="“Laatste data” = het echte moment waarop er voor het laatst is gesynct.">
          Verbindingen
        </SectionTitle>
        {loading && !sources ? (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card p-4 h-24 animate-pulse bg-sunken/50" />
            ))}
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {(sources ?? []).map((s) => (
              <SourceCard key={s.key} s={s} />
            ))}
          </div>
        )}
      </div>

      <p className="text-[11px] text-faint leading-relaxed">
        “Laatste data” komt uit een <code className="text-muted">ingested_at</code>-stempel die de
        database bij elke schrijfactie server-side zet — dus het echte moment van synchroniseren,
        ongeacht welke verbinding de rij schreef. Projecten en Klanten worden ook in-app bewerkt en
        gebruiken daarom hun eigen <code className="text-muted">updated_at</code>/
        <code className="text-muted">synced_at</code>. Onregelmatige bronnen zoals Gewicht en
        Transacties krijgen ruimere marges voordat ze op vertraagd/offline springen.
      </p>
    </div>
  )
}
