import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  ReferenceLine,
  CartesianGrid,
  Cell,
} from 'recharts'
import { CHART_TIP, AXIS_TICK_10 } from '../components/chart'
import { useStore } from '../store'
import { computeCorrelations, computeAnomalies } from '../reflect'
import { deriveDeadlines, hasSleepSignal, hasEnergySignal } from '../derive'
import { isTransfer } from '../finance/categories'
import { fmtDate } from '../domains'
import { DomainChip, SectionTitle, Empty } from '../components/ui'
import { fetchSyncStatus, humanizeAge, HEALTH_META, type SyncSourceStatus } from '../lib/syncStatus'
import { Brain, Moon, Wallet, AlertTriangle, ArrowUpRight, ArrowDownRight, Play, Smartphone, CalendarClock, Database, RefreshCw } from 'lucide-react'

function SourceStatusStrip() {
  const [sources, setSources] = useState<SyncSourceStatus[] | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    setSources(await fetchSyncStatus())
    setLoading(false)
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const counts = (sources ?? []).reduce(
    (acc, s) => {
      if (s.health === 'up') acc.up++
      else if (s.health === 'down' || s.health === 'error') acc.down++
      return acc
    },
    { up: 0, down: 0 },
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <SectionTitle hint="Live verbindingsstatus per bron — wanneer er voor het laatst data binnenkwam.">
          Databronnen & verbindingen
        </SectionTitle>
        <button onClick={() => void refresh()} disabled={loading} className="btn-ghost !py-1.5 !px-2.5 text-xs shrink-0 -mt-6">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Ververs
        </button>
      </div>
      {!sources ? (
        <div className="text-sm text-faint py-2">Verbindingen controleren…</div>
      ) : (
        <>
          <p className="text-xs text-faint -mt-2 mb-2">{counts.up} actief · {counts.down} offline van de {sources.length} verbindingen</p>
          <div className="flex flex-wrap gap-1.5">
            {sources.map((s) => {
              const meta = HEALTH_META[s.health]
              return (
                <span
                  key={s.key}
                  title={`${s.pipeline} · laatste data ${humanizeAge(s.lastAt)}`}
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
                  style={{ background: `${meta.hex}18`, color: meta.hex }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.hex }} />
                  {s.label} · {humanizeAge(s.lastAt)}
                </span>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export default function Reflect() {
  const { dayLogs, transactions, threads, patterns, lastDigest, reflectCount, runNightlyReflect, screenDays, meetingDays, projects, healthDays, emails, habits } = useStore()

  const deadlines = useMemo(() => deriveDeadlines(projects), [projects])
  // Internal transfers between the user's own accounts aren't real spend —
  // exclude them from every correlation/anomaly/coverage calc below.
  const realTx = useMemo(() => transactions.filter((t) => !isTransfer(t.category)), [transactions])

  const correlations = useMemo(
    () => computeCorrelations(dayLogs, realTx, screenDays, meetingDays, deadlines, habits),
    [dayLogs, realTx, screenDays, meetingDays, deadlines, habits],
  )
  const anomalies = useMemo(
    () => computeAnomalies(dayLogs, realTx, threads),
    [dayLogs, realTx, threads],
  )

  // Honest data coverage — REFLECT can only correlate what's actually flowing.
  const coverage = useMemo(() => {
    const spend = realTx.filter((t) => t.amount < 0).length
    return [
      { key: 'Slaap', ok: hasSleepSignal(dayLogs), detail: hasSleepSignal(dayLogs) ? `${dayLogs.filter((l) => l.sleepHours > 0).length} dagen` : 'geen ingest' },
      { key: 'Energie', ok: hasEnergySignal(dayLogs), detail: hasEnergySignal(dayLogs) ? 'gevarieerd' : 'niet gemeten' },
      { key: 'Stappen', ok: healthDays.some((h) => h.steps > 0), detail: `${healthDays.filter((h) => h.steps > 0).length} dagen` },
      { key: 'Schermtijd', ok: screenDays.length >= 4, detail: `${screenDays.length} dagen` },
      { key: 'Financiën', ok: spend >= 5, detail: `${spend} uitgaven` },
      { key: 'Agenda', ok: meetingDays.length > 0, detail: `${meetingDays.length} dagen` },
      { key: 'Projecten', ok: deadlines.length > 0, detail: `${deadlines.length} deadlines` },
      { key: 'Mail', ok: emails.length > 0, detail: `${emails.length} berichten` },
    ]
  }, [dayLogs, healthDays, screenDays, realTx, meetingDays, deadlines, emails])

  const noSleep = !hasSleepSignal(dayLogs)

  const sleepEnergy = dayLogs.map((l) => ({
    date: fmtDate(l.date).replace(/\s*(jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec)\s*/i, ''),
    sleep: l.sleepHours,
    energy: l.energy,
    low: l.sleepHours < 6,
  }))

  const spendByDay = useMemo(() => {
    const map = new Map<string, number>()
    realTx.forEach((t) => {
      if (t.amount < 0) map.set(t.date, (map.get(t.date) || 0) + Math.abs(t.amount))
    })
    return dayLogs.map((l) => ({
      date: fmtDate(l.date).replace(/\s*(jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec)\s*/i, ''),
      iso: l.date,
      spend: Math.round(map.get(l.date) || 0),
      deadline: deadlines.includes(l.date),
    }))
  }, [realTx, dayLogs, deadlines])

  const corrIcon: Record<string, typeof Brain> = {
    c1: Moon,
    c2: Wallet,
    c3: Wallet,
    c4: Smartphone,
    c5: CalendarClock,
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Brain className="h-5 w-5 text-cross" /> Reflect
          </h1>
          <p className="text-sm text-muted mt-1 max-w-xl">
            De laag die je <span className="text-ink">volledige</span> geheugen over alle domeinen tegelijk leest.
            Vindt verbanden die geen enkele losse tracker kan zien, en schrijft verfijnde patronen terug.
          </p>
        </div>
        <button className="btn-primary bg-cross hover:bg-cross/80" onClick={runNightlyReflect}>
          <Play className="h-4 w-4" /> Nachtelijke reflectie uitvoeren
        </button>
      </div>

      {lastDigest && (
        <div className="card p-3 border-cross/40 bg-cross/5 text-sm text-ink-soft animate-fade-up">
          Reflectie heeft <b>{reflectCount}×</b> gedraaid. Patronen zijn versterkt en het Overzicht (dagelijkse nudge) is bijgewerkt.
          {lastDigest.narrative && (
            <p className="mt-2 text-ink flex items-start gap-2">
              <Brain className="h-4 w-4 shrink-0 mt-0.5 text-cross" />
              <span>{lastDigest.narrative}</span>
            </p>
          )}
        </div>
      )}

      {/* DATA COVERAGE — what REFLECT actually has to work with */}
      <div>
        <SectionTitle hint="Reflectie kan alleen verbanden vinden tussen databronnen die binnenkomen.">
          Correlatie-dekking
        </SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {coverage.map((c) => (
            <div key={c.key} className="card p-2.5">
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${c.ok ? 'bg-buurtkaart' : 'bg-cross/60'}`} />
                <span className="text-sm font-medium">{c.key}</span>
              </div>
              <p className="text-[11px] text-faint mt-0.5">{c.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {/* SYNC STATUS — per-source live connection health (voorheen Databronnen-scherm) */}
      <SourceStatusStrip />

      {/* CROSS-DOMAIN CORRELATIONS */}
      <div>
        <SectionTitle hint="Live berekend; alleen getoond als er genoeg data is voor een betrouwbaar verband.">
          Domein-overstijgende verbanden
        </SectionTitle>
        {correlations.length === 0 && (
          <Empty>
            Nog te weinig signaal voor betrouwbare verbanden. Zie de dekking hierboven — zodra slaap, energie of meer financiële data binnenkomt, verschijnen hier de cross-domein correlaties.
          </Empty>
        )}
        <div className="space-y-3">
          {correlations.map((c, idx) => {
            const Icon = corrIcon[c.id] || Brain
            return (
              <div key={c.id} className="card p-4 animate-fade-up" style={{ animationDelay: `${idx * 60}ms` }}>
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-cross/15 p-2 shrink-0">
                    <Icon className="h-4 w-4 text-cross" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <h3 className="font-medium text-ink">{c.title}</h3>
                      <div className="flex flex-wrap gap-1 shrink-0">
                        {c.domains.map((d) => (
                          <DomainChip key={d} domain={d} small />
                        ))}
                      </div>
                    </div>
                    <p className="text-sm text-muted mt-1">{c.detail}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <div className="h-1.5 w-28 rounded-full bg-line overflow-hidden">
                        <div className="h-full bg-cross rounded-full" style={{ width: `${Math.round(c.strength * 100)}%` }} />
                      </div>
                      <span className="text-[11px] text-faint">{c.evidence}</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* CHARTS, the evidence */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-4">
          <h3 className="text-sm font-medium mb-1 flex items-center gap-2">
            <Moon className="h-4 w-4 text-personal" /> Slaap vs. energie
          </h3>
          {noSleep ? (
            <p className="text-[11px] text-cross mb-2 flex items-center gap-1">
              <Database className="h-3 w-3" /> Slaapdata komt nog niet binnen — koppel je slaapbron om dit verband te activeren.
            </p>
          ) : (
            <p className="text-[11px] text-faint mb-2">Lijnen bewegen mee; korte nachten trekken energie omlaag.</p>
          )}
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={sleepEnergy} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
              <XAxis dataKey="date" tick={AXIS_TICK_10} />
              <YAxis yAxisId="l" domain={[0, 9]} tick={AXIS_TICK_10} />
              <YAxis yAxisId="r" orientation="right" domain={[0, 5]} hide />
              <Tooltip
                contentStyle={CHART_TIP}
              />
              <ReferenceLine yAxisId="l" y={6} stroke="#C58392" strokeDasharray="4 4" />
              <Line yAxisId="l" type="monotone" dataKey="sleep" stroke="#C6A05B" strokeWidth={2} dot={false} name="sleep (h)" />
              <Line yAxisId="r" type="monotone" dataKey="energy" stroke="#6E8CA8" strokeWidth={2} dot={false} name="energy (1-5)" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-4">
          <h3 className="text-sm font-medium mb-1 flex items-center gap-2">
            <Wallet className="h-4 w-4 text-prjct" /> Dagelijkse uitgaven vs. deadlines
          </h3>
          <p className="text-[11px] text-faint mb-2">
            Roze balken = dagen op/rond een PRJCT/campagne deadline.
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={spendByDay} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
              <XAxis dataKey="date" tick={AXIS_TICK_10} />
              <YAxis tick={AXIS_TICK_10} />
              <Tooltip
                contentStyle={CHART_TIP}
                formatter={(v: number) => [`€${v}`, 'spend']}
              />
              <Bar dataKey="spend" radius={[4, 4, 0, 0]}>
                {spendByDay.map((d) => (
                  <Cell key={d.iso} fill={d.deadline ? '#C58392' : '#333333'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ANOMALIES */}
      <div>
        <SectionTitle>Afwijkingen</SectionTitle>
        <div className="space-y-2">
          {anomalies.map((a) => (
            <div key={a.id} className="card p-3 border-orange-500/30 bg-orange-500/5 flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 text-orange-300 mt-0.5 shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink">{a.title}</span>
                  <DomainChip domain={a.domain} small />
                </div>
                <p className="text-xs text-muted mt-0.5">{a.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* PATTERN WRITE-BACK */}
      <div>
        <SectionTitle hint="Reflectie schrijft verfijnde betrouwbaarheidsscores terug naar het Geheugen.">
          Patronen versterkt / afgenomen
        </SectionTitle>
        {lastDigest ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {lastDigest.reinforced.map((r) => {
              const p = patterns.find((x) => x.id === r.patternId)
              return (
                <div key={r.patternId} className="card p-3 border-buurtkaart/30">
                  <div className="flex items-center gap-1.5 text-buurtkaart text-xs font-medium">
                    <ArrowUpRight className="h-3.5 w-3.5" /> versterkt
                  </div>
                  <p className="text-sm text-ink-soft mt-1">{p?.text}</p>
                  <p className="text-[11px] text-faint mt-1 tabular-nums">
                    {Math.round(r.from * 100)}% → {Math.round(r.to * 100)}%
                  </p>
                </div>
              )
            })}
            {lastDigest.decayed.map((r) => {
              const p = patterns.find((x) => x.id === r.patternId)
              return (
                <div key={r.patternId} className="card p-3 border-cross/20">
                  <div className="flex items-center gap-1.5 text-cross text-xs font-medium">
                    <ArrowDownRight className="h-3.5 w-3.5" /> afgenomen (niet versterkt)
                  </div>
                  <p className="text-sm text-ink-soft mt-1">{p?.text}</p>
                  <p className="text-[11px] text-faint mt-1 tabular-nums">
                    {Math.round(r.from * 100)}% → {Math.round(r.to * 100)}%
                  </p>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="card p-4 text-sm text-muted">
            Klik op <b className="text-ink">Nachtelijke reflectie uitvoeren</b> om betrouwbaarheidsscores te zien bewegen: versterkte patronen stijgen, verouderde nemen af.
          </div>
        )}
      </div>
    </div>
  )
}
