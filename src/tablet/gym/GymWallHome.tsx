import { useEffect, useState } from 'react'
import { Check, Moon, Play, TrendingDown, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { WorkoutExercise, WorkoutPlan, WorkoutSession } from '../../types'
import { BODY_METRICS, deltaOver, fmtDelta, fmtMetric, latestValue, measuredMetrics, seriesFor, type BodyMetricKey } from '../../lib/bodyComposition'
import { MetricTrendChart, SERIES_HEX, StepsChart, fmtDay } from './BodyTrendChart'
import type { BodyDay, BodyStats } from './useBodyStats'

/** The health numbers that get a card + chart: the health screen's core, sized for across-the-room. */
const CHARTED: { key: BodyMetricKey; label: string; color: string }[] = [
  { key: 'weightKg', label: 'Gewicht', color: SERIES_HEX.neutral },
  { key: 'musclePct', label: 'Spierpercentage', color: SERIES_HEX.blue },
  { key: 'bodyFatPct', label: 'Vetpercentage', color: SERIES_HEX.orange },
]
/** The rest of the scale, most useful first — only the first few measured ones are shown. */
const READOUT_ORDER: BodyMetricKey[] = [
  'muscleMassKg', 'bodyWaterPct', 'visceralFat', 'bmrKcal', 'boneMassKg', 'bmi',
  'skeletalMusclePct', 'proteinPct', 'fatFreeMassKg', 'subcutaneousFatPct', 'metabolicAge', 'skeletalMuscleKg',
]
const READOUT_MAX = 6
const CHART_WINDOW_DAYS = 90

/** shadcn Card, restyled to the app's flat cards (no border/shadow, depth from the surface tone). */
const flatCard = 'border-0 shadow-none rounded-3xl'

/**
 * Home screen of the gym's 27" portrait wall display. Deliberately sparse:
 * the clock, today's training with one big start button, and four health
 * cards (weight, muscle %, fat %, steps) — each one number, its change and
 * its trend. The rest of the scale is a quiet one-line readout. Sized in rem,
 * which html.wall-display scales to the screen width, and laid out to fill
 * exactly one screen: nobody scrolls a wall.
 */
export function GymWallHome({
  date,
  weekday,
  stats,
  todaysPlans,
  otherPlans,
  hasPlans,
  exercisesFor,
  sessions,
  justSaved,
  onStart,
}: {
  date: string
  weekday: string
  stats: BodyStats
  todaysPlans: WorkoutPlan[]
  otherPlans: WorkoutPlan[]
  hasPlans: boolean
  exercisesFor: (planId: string) => WorkoutExercise[]
  sessions: WorkoutSession[]
  justSaved: boolean
  onStart: (plan: WorkoutPlan) => void
}) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 10_000)
    return () => window.clearInterval(id)
  }, [])

  const measured = measuredMetrics(stats.days)
  const readout = READOUT_ORDER.filter((k) => measured.includes(k)).slice(0, READOUT_MAX)
  const startable = otherPlans.filter((p) => exercisesFor(p.id).length > 0)

  return (
    <div className="h-screen flex flex-col gap-6 p-8 overflow-hidden">
      {/* day + clock */}
      <header className="flex items-end justify-between gap-6 shrink-0 pr-8">
        <div>
          <div className="text-4xl font-medium text-ink capitalize leading-none">{weekday}</div>
          <div className="text-xl text-muted-foreground mt-2">
            {now.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', timeZone: 'Europe/Amsterdam' })}
          </div>
        </div>
        <div className="text-6xl font-semibold tabular-nums text-ink leading-none">
          {now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' })}
        </div>
      </header>

      {justSaved && (
        <Badge variant="secondary" className="self-center gap-2 rounded-full px-5 py-2 text-xl font-medium text-forest-hi bg-forest/15 shrink-0">
          <Check className="h-6 w-6" /> Training opgeslagen
        </Badge>
      )}

      {/* today's training */}
      <section className="shrink-0 flex flex-col gap-4">
        {!hasPlans ? (
          <Card className={cn(flatCard, 'bg-sunken')}>
            <CardContent className="p-8 text-2xl text-muted-foreground text-center">Nog geen trainingsplannen — maak er een op je telefoon.</CardContent>
          </Card>
        ) : todaysPlans.length > 0 ? (
          todaysPlans.map((p) => (
            <TodayCard key={p.id} plan={p} exerciseCount={exercisesFor(p.id).length} lastSession={lastSessionOf(p, sessions)} onStart={() => onStart(p)} />
          ))
        ) : (
          <Card className={cn(flatCard, 'bg-sunken')}>
            <CardContent className="p-7 flex items-center gap-5">
              <Moon className="h-9 w-9 text-muted-foreground shrink-0" />
              <div>
                <CardTitle className="text-4xl font-medium">Rustdag</CardTitle>
                <CardDescription className="text-xl mt-2">Geen training gepland vandaag.</CardDescription>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {/* health: four numbers, each with its change and trend */}
      <section className="flex-1 min-h-0 grid grid-cols-2 grid-rows-2 gap-4">
        {CHARTED.map((c) => (
          <MetricCard key={c.key} metric={c.key} label={c.label} color={c.color} days={stats.days} until={date} />
        ))}
        <StepsCard stats={stats} />
      </section>

      {/* the rest of the scale, quietly */}
      {readout.length > 0 && (
        <section className="shrink-0 grid grid-cols-3 gap-x-8 gap-y-2 px-2">
          {readout.map((k) => {
            const latest = latestValue(stats.days, k)!
            const meta = BODY_METRICS[k]
            return (
              <div key={k} className="flex items-baseline justify-between gap-3 min-w-0">
                <span className="text-base text-muted-foreground truncate">{meta.short ?? meta.label}</span>
                <span className="text-2xl font-semibold tabular-nums text-ink shrink-0">
                  {fmtMetric(k, latest.value)}
                  {meta.unit && <span className="text-base font-normal text-muted-foreground"> {meta.unit}</span>}
                </span>
              </div>
            )
          })}
        </section>
      )}

      {/* other trainings, for an off-schedule day */}
      {startable.length > 0 && (
        <nav className="shrink-0 flex items-center gap-3 flex-wrap">
          <span className="text-base text-muted-foreground mr-1">Andere training</span>
          {startable.slice(0, 5).map((p) => (
            <Button key={p.id} variant="secondary" onClick={() => onStart(p)} className="h-auto rounded-full px-5 py-2.5 text-lg font-medium">
              {p.name}
            </Button>
          ))}
        </nav>
      )}
    </div>
  )
}

function lastSessionOf(plan: WorkoutPlan, sessions: WorkoutSession[]): WorkoutSession | null {
  let last: WorkoutSession | null = null
  for (const s of sessions) if (s.planId === plan.id && (!last || s.startedAt > last.startedAt)) last = s
  return last
}

function TodayCard({
  plan,
  exerciseCount,
  lastSession,
  onStart,
}: {
  plan: WorkoutPlan
  exerciseCount: number
  lastSession: WorkoutSession | null
  onStart: () => void
}) {
  const facts = [
    exerciseCount > 0 ? `${exerciseCount} oefeningen` : 'nog geen oefeningen — voeg toe op je telefoon',
    lastSession && `vorige keer ${fmtDay(lastSession.startedAt.slice(0, 10))}${lastSession.durationMin ? ` · ${lastSession.durationMin} min` : ''}`,
  ].filter(Boolean)

  return (
    <Card className={cn(flatCard, 'bg-sunken')}>
      <CardContent className="p-7 flex items-center gap-6">
        <div className="flex-1 min-w-0">
          <CardDescription className="text-base uppercase tracking-wider">Vandaag</CardDescription>
          <CardTitle className="text-5xl font-medium leading-tight tracking-tight mt-2 line-clamp-2">{plan.name}</CardTitle>
          {plan.muscleGroups.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {plan.muscleGroups.map((m) => (
                <Badge key={m} variant="outline" className="rounded-full border-line-strong px-3 py-1 text-base font-normal text-ink-soft">
                  {m}
                </Badge>
              ))}
            </div>
          )}
          <p className="text-lg text-muted-foreground mt-4">{facts.join(' · ')}</p>
        </div>
        {exerciseCount > 0 && (
          <Button onClick={onStart} className="h-auto shrink-0 rounded-2xl px-9 py-6 text-2xl font-semibold [&_svg]:size-7">
            <Play className="fill-current" /> Start
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function Trend({ metric, delta }: { metric: BodyMetricKey; delta: number }) {
  const flat = fmtDelta(metric, delta) === '±0'
  const Icon = delta > 0 ? TrendingUp : TrendingDown
  const unit = BODY_METRICS[metric].unit
  return (
    <Badge variant="secondary" className="shrink-0 gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-base font-medium tabular-nums text-ink-soft [&_svg]:size-5">
      {!flat && <Icon />}
      {fmtDelta(metric, delta)}
      {unit && ` ${unit}`}
    </Badge>
  )
}

function MetricCard({ metric, label, color, days, until }: { metric: BodyMetricKey; label: string; color: string; days: BodyDay[]; until: string }) {
  const meta = BODY_METRICS[metric]
  const latest = latestValue(days, metric)
  const delta = deltaOver(days, metric, 30)
  // Fall back to the whole year when the window has fewer than two readings,
  // so a sparse history still draws a line instead of a lone dot.
  const inWindow = seriesFor(days, metric, CHART_WINDOW_DAYS, until)
  const points = inWindow.length >= 2 ? inWindow : seriesFor(days, metric, 365, until)

  return (
    <Card className={cn(flatCard, 'flex flex-col min-h-0 min-w-0 overflow-hidden')}>
      <CardHeader className="p-6 pb-0 space-y-0 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <CardDescription className="text-lg truncate">{label}</CardDescription>
          {delta && <Trend metric={metric} delta={delta.delta} />}
        </div>
        <CardTitle className="mt-2 flex items-baseline gap-2 font-semibold">
          <span className="text-6xl tabular-nums tracking-tight">{latest ? fmtMetric(metric, latest.value) : '—'}</span>
          {latest && meta.unit && <span className="text-2xl font-normal text-muted-foreground">{meta.unit}</span>}
        </CardTitle>
        <CardDescription className="text-base mt-2">
          {!latest
            ? 'Komt binnen via je weegschaal'
            : delta
              ? `sinds ${fmtDay(delta.sinceDate)} · laatste meting ${fmtDay(latest.date)}`
              : `gemeten ${fmtDay(latest.date)}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 p-0">
        {points.length > 1 && <MetricTrendChart metric={metric} points={points} color={color} />}
      </CardContent>
    </Card>
  )
}

function StepsCard({ stats }: { stats: BodyStats }) {
  const steps = stats.today?.steps ?? null
  const goal = stats.today?.stepGoal ?? stats.recentSteps[stats.recentSteps.length - 1]?.stepGoal ?? 8000
  const metDays = stats.recentSteps.filter((d) => d.steps >= d.stepGoal).length
  const pct = steps != null ? Math.round((steps / goal) * 100) : null

  return (
    <Card className={cn(flatCard, 'flex flex-col min-h-0 min-w-0 overflow-hidden')}>
      <CardHeader className="p-6 pb-0 space-y-0 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <CardDescription className="text-lg truncate">Stappen vandaag</CardDescription>
          {pct != null && (
            <Badge
              variant="secondary"
              className={cn('shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-base font-medium tabular-nums', pct >= 100 ? 'bg-forest/15 text-forest-hi' : 'text-ink-soft')}
            >
              {pct >= 100 ? <Check className="mr-1.5 h-5 w-5" /> : null}
              {pct}%
            </Badge>
          )}
        </div>
        <CardTitle className="mt-2 text-6xl font-semibold tabular-nums tracking-tight">{steps != null ? steps.toLocaleString('nl-NL') : '—'}</CardTitle>
        <CardDescription className="text-base mt-2">
          doel {goal.toLocaleString('nl-NL')}
          {stats.recentSteps.length > 0 && ` · ${metDays}/${stats.recentSteps.length} dagen gehaald`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 p-0">{stats.recentSteps.length > 0 && <StepsChart days={stats.recentSteps} />}</CardContent>
    </Card>
  )
}
