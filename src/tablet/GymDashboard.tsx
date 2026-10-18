import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { ArrowDownRight, ArrowRight, ArrowUpRight, Dumbbell, Footprints, Moon, Scale, Umbrella } from 'lucide-react'
import { useStore } from '../store'
import { fetchBodyWeightHistory } from '../lib/supabase'
import { useWeather, weatherMeta } from '../hooks/useWeather'
import { CHART_GRID } from '../components/chart'
import type { HealthDay } from '../types'

/**
 * The always-on parts of the gym screen: a small clock/date/weather header and
 * health panels (weight trend, sleep, steps) and a line on this week's training. Read-only:
 * this screen shows, the phone edits.
 */

// recharts needs real colors; these match the --forest and --faint tokens.
const FOREST = 'hsl(152, 55%, 50%)'
const FAINT = 'hsl(0, 0%, 52%)'
const TICK = { fill: '#a8a8a8', fontSize: 13 }

const DAY_SHORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']
const nl1 = (v: number) => v.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const nl0 = (v: number) => Math.round(v).toLocaleString('nl-NL')
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

// ── Header ──────────────────────────────────────────────────────────────────

export function KioskHeader() {
  const now = useNow()
  const weather = useWeather()
  const time = now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  const rawDate = now.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })
  const date = rawDate.charAt(0).toUpperCase() + rawDate.slice(1)
  const { label, Icon } = weatherMeta(weather.code, weather.isDay ?? true)
  const ready = weather.tempC != null

  return (
    <header className="flex items-end justify-between gap-6 pr-10">
      <div className="min-w-0">
        <div className="text-4xl md:text-6xl font-semibold tabular-nums text-ink leading-none">{time}</div>
        <div className="text-base md:text-2xl text-muted mt-1 md:mt-2">{date}</div>
      </div>
      {ready && (
        <div className="flex items-center gap-3 md:gap-4 text-right shrink-0">
          <Icon className="h-9 w-9 md:h-14 md:w-14 text-ink-soft" aria-hidden />
          <div>
            <div className="text-3xl md:text-5xl font-semibold tabular-nums text-ink leading-none">{weather.tempC}°</div>
            <div className="text-sm md:text-lg text-muted mt-1">
              {label}
              {weather.maxC != null && weather.minC != null && (
                <span className="text-faint"> · {weather.maxC}° / {weather.minC}°</span>
              )}
            </div>
            {weather.rainChance != null && weather.rainChance >= 30 && (
              <div className="text-sm md:text-lg text-muted inline-flex items-center gap-1">
                <Umbrella className="h-4 w-4 md:h-5 md:w-5" aria-hidden /> {weather.rainChance}% kans op regen
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  )
}

// ── Health panels ───────────────────────────────────────────────────────────

function Panel({ icon: Icon, title, children, className = '' }: { icon: typeof Scale; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-5 md:p-7 flex flex-col gap-3 md:gap-4 min-w-0 ${className}`}>
      <div className="flex items-center gap-2 text-sm md:text-lg text-faint uppercase tracking-wide">
        <Icon className="h-4 w-4 md:h-5 md:w-5" aria-hidden /> {title}
      </div>
      {children}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-base md:text-xl text-faint">{children}</p>
}

/** Last weigh-in per day over the last 90 days, refreshed when a new weigh-in arrives. */
function useWeightSeries() {
  const bodyWeight = useStore((s) => s.bodyWeight)
  const [rows, setRows] = useState<{ weightKg: number; at: string }[]>([])
  useEffect(() => {
    let alive = true
    const load = () => fetchBodyWeightHistory(90).then((r) => alive && setRows(r))
    void load()
    const id = window.setInterval(load, 30 * 60_000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [bodyWeight?.at])

  return useMemo(() => {
    const byDay = new Map<string, number>()
    for (const r of rows) byDay.set(dayKey(new Date(r.at)), r.weightKg)
    return [...byDay.entries()].map(([day, kg]) => {
      const d = new Date(day + 'T00:00:00')
      return { day, kg, label: d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) }
    })
  }, [rows])
}

function WeightPanel() {
  const series = useWeightSeries()
  const latest = series[series.length - 1]

  // Compare with the last weigh-in at least 30 days before the latest one.
  const ref = useMemo(() => {
    if (!latest) return null
    const cutoff = new Date(latest.day + 'T00:00:00').getTime() - 30 * 86_400_000
    return [...series].reverse().find((p) => new Date(p.day + 'T00:00:00').getTime() <= cutoff) ?? series[0]
  }, [series, latest])

  if (!latest) {
    return (
      <Panel icon={Scale} title="Gewicht" className="col-span-2">
        <Empty>Nog geen weegmomenten van de afgelopen 90 dagen.</Empty>
      </Panel>
    )
  }

  const delta = ref && ref !== latest ? latest.kg - ref.kg : null
  const DeltaIcon = delta == null || Math.abs(delta) < 0.05 ? ArrowRight : delta < 0 ? ArrowDownRight : ArrowUpRight
  const sinceDays = ref ? Math.round((new Date(latest.day).getTime() - new Date(ref.day).getTime()) / 86_400_000) : 0

  return (
    <Panel icon={Scale} title="Gewicht" className="col-span-2">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="text-4xl md:text-6xl font-semibold tabular-nums text-ink leading-none">
          {nl1(latest.kg)} <span className="text-xl md:text-3xl text-muted font-normal">kg</span>
        </div>
        {delta != null && (
          <div className="flex items-center gap-1.5 text-base md:text-xl text-ink-soft">
            <DeltaIcon className="h-5 w-5 md:h-6 md:w-6" aria-hidden />
            {delta > 0 ? '+' : delta < 0 ? '−' : ''}
            {nl1(Math.abs(delta))} kg in {sinceDays} dagen
          </div>
        )}
      </div>
      {series.length >= 2 && (
        <div className="h-32 md:h-52 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={CHART_GRID} vertical={false} />
              <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={false} tickMargin={8} interval="preserveStartEnd" minTickGap={48} />
              <YAxis
                domain={[(min: number) => Math.floor(min - 1), (max: number) => Math.ceil(max + 1)]}
                tick={TICK}
                tickLine={false}
                axisLine={false}
                width={40}
                tickFormatter={(v: number) => nl0(v)}
              />
              <Line type="monotone" dataKey="kg" stroke={FOREST} strokeWidth={2.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="text-sm md:text-base text-faint">
        Laatste meting {new Date(latest.day + 'T00:00:00').toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })} · afgelopen 90 dagen
      </div>
    </Panel>
  )
}

/** The last 7 calendar days, with that day's HealthDay when there is one. */
function useLastWeek(healthDays: HealthDay[]) {
  return useMemo(() => {
    const byDate = new Map(healthDays.map((h) => [h.date, h]))
    const out: { date: string; label: string; day: HealthDay | undefined }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = dayKey(d)
      out.push({ date: key, label: DAY_SHORT[d.getDay()], day: byDate.get(key) })
    }
    return out
  }, [healthDays])
}

function MiniBars({ data, goal }: { data: { label: string; value: number | null }[]; goal?: number }) {
  return (
    <div className="h-20 md:h-28">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap="22%">
          <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={false} />
          <YAxis hide domain={[0, (max: number) => Math.max(max, goal ?? 0)]} />
          {goal != null && <ReferenceLine y={goal} stroke={FAINT} strokeDasharray="4 4" />}
          <Bar dataKey="value" fill={FOREST} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function SleepPanel({ healthDays }: { healthDays: HealthDay[] }) {
  const week = useLastWeek(healthDays)
  const lastNight = [...healthDays].reverse().find((h) => h.sleepHours > 0)
  const logged = week.map((w) => w.day?.sleepHours ?? 0).filter((h) => h > 0)
  const avg = logged.length ? logged.reduce((a, b) => a + b, 0) / logged.length : null
  const fmtH = (h: number) => `${Math.floor(h)}u ${String(Math.round((h % 1) * 60)).padStart(2, '0')}`
  const isToday = lastNight?.date === dayKey(new Date())

  return (
    <Panel icon={Moon} title="Slaap">
      {lastNight ? (
        <>
          <div className="text-3xl md:text-5xl font-semibold tabular-nums text-ink leading-none">{fmtH(lastNight.sleepHours)}</div>
          <div className="text-sm md:text-lg text-muted">
            {isToday ? 'Afgelopen nacht' : `Laatst gemeten ${lastNight.date.slice(8)}-${lastNight.date.slice(5, 7)}`}
            {avg != null && <span className="text-faint"> · gem. 7 dagen {fmtH(avg)}</span>}
          </div>
          <MiniBars data={week.map((w) => ({ label: w.label, value: w.day && w.day.sleepHours > 0 ? +w.day.sleepHours.toFixed(1) : null }))} goal={8} />
        </>
      ) : (
        <Empty>Nog geen slaapdata.</Empty>
      )}
    </Panel>
  )
}

function StepsPanel({ healthDays }: { healthDays: HealthDay[] }) {
  const week = useLastWeek(healthDays)
  const todayRow = week[week.length - 1].day
  const goal = todayRow?.stepGoal || [...healthDays].reverse().find((h) => h.stepGoal > 0)?.stepGoal || 8000
  const steps = todayRow?.steps ?? 0
  const pct = Math.min(100, Math.round((steps / goal) * 100))
  const counted = week.map((w) => w.day?.steps ?? 0).filter((s) => s > 0)
  const avg = counted.length ? counted.reduce((a, b) => a + b, 0) / counted.length : null

  return (
    <Panel icon={Footprints} title="Stappen">
      <div className="text-3xl md:text-5xl font-semibold tabular-nums text-ink leading-none">{nl0(steps)}</div>
      <div className="text-sm md:text-lg text-muted">
        {pct}% van {nl0(goal)}
        {avg != null && <span className="text-faint"> · gem. {nl0(avg)}</span>}
      </div>
      <div className="h-2 rounded-full bg-sunken overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Stappendoel vandaag">
        <div className="h-full bg-forest rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <MiniBars data={week.map((w) => ({ label: w.label, value: w.day && w.day.steps > 0 ? w.day.steps : null }))} goal={goal} />
    </Panel>
  )
}

/** One line under today's training: how many sessions this week, and the last one. */
export function TrainingWeekLine() {
  const sessions = useStore((s) => s.workoutSessions)
  const now = useNow(60_000)
  const { count, last } = useMemo(() => {
    const weekAgo = now.getTime() - 7 * 86_400_000
    const done = sessions.filter((s) => s.completedAt)
    const sorted = [...done].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    return { count: done.filter((s) => new Date(s.startedAt).getTime() >= weekAgo).length, last: sorted[0] }
  }, [sessions, now])

  const lastLabel = (() => {
    if (!last) return null
    const d = new Date(last.startedAt)
    const days = Math.round((new Date(dayKey(now)).getTime() - new Date(dayKey(d)).getTime()) / 86_400_000)
    const when = days === 0 ? 'vandaag' : days === 1 ? 'gisteren' : `${days} dagen geleden`
    return `${last.planName ?? 'Training'}, ${when}`
  })()

  return (
    <div className="text-sm md:text-lg text-muted inline-flex items-center gap-2 flex-wrap">
      <Dumbbell className="h-4 w-4 md:h-5 md:w-5 text-faint" aria-hidden />
      <span className="text-ink-soft">{count} {count === 1 ? 'training' : 'trainingen'} in 7 dagen</span>
      {lastLabel && <span className="text-faint">· laatste: {lastLabel}</span>}
    </div>
  )
}

export function HealthPanels() {
  const healthDays = useStore((s) => s.healthDays)
  return (
    <div className="grid grid-cols-2 gap-4 md:gap-6">
      <WeightPanel />
      <SleepPanel healthDays={healthDays} />
      <StepsPanel healthDays={healthDays} />
    </div>
  )
}
