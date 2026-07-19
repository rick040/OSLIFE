import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { TODAY, DOMAIN_META, fmtDate, daysBetween } from '../domains'
import { dueLabel } from '../lib/dates'
import { OPENING_BALANCE } from '../mockData'
import { DomainChip, Empty, SetupHint, Ring, SegmentedProgress, Sparkline } from '../components/ui'
import { useWeather, weatherMeta } from '../hooks/useWeather'
import { storeNudgeToDash, PriorityList, type DashNudge, type NudgeTone } from '../components/NudgeCard'
import { MetricDetailDialog, type MetricPoint } from '../components/MetricDetailDialog'
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts'
import { CHART_TIP, AXIS_TICK_11 } from '../components/chart'
import {
  CheckCircle2,
  SkipForward,
  Clock,
  Moon,
  Zap,
  Target,
  Wallet,
  FolderKanban,
  Mail,
  Flame,
  ArrowRight,
  Receipt,
  Activity,
  CalendarRange,
  CheckSquare,
  Check,
} from 'lucide-react'

import { eur0 as eur } from '../lib/format'

/** Real local hour in Rick's timezone, so the greeting tracks the actual time of day. */
function amsterdamHour(): number {
  const h = new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    hour12: false,
    timeZone: 'Europe/Amsterdam',
  }).format(new Date())
  return parseInt(h, 10) % 24
}

/**
 * Compact KPI tile — the dashboard's "cockpit" row. One glance, one tap
 * through. Icon sits inline beside the text (not stacked on its own row
 * above it) so the tile hugs its content instead of reserving a fixed
 * 76px of height that reads as dead space on narrow 2-col mobile grids.
 */
function KpiTile({
  icon: Icon,
  iconClass,
  value,
  label,
  onClick,
  corner,
}: {
  icon: React.ComponentType<{ className?: string }>
  iconClass: string
  value: React.ReactNode
  label: string
  onClick?: () => void
  /** Optional small visual (sparkline, dots), right-aligned next to the text. */
  corner?: React.ReactNode
}) {
  const Comp = onClick ? 'button' : 'div'
  // Tinted icon tile: same hue as the icon, at low coverage — the bento-card
  // icon-badge pattern, not just a bare glyph floating above the number.
  const tintClass = iconClass.replace('text-', 'bg-') + '/12'
  return (
    <Comp
      onClick={onClick}
      className={`card relative flex items-center gap-2.5 p-2.5 text-left ${onClick ? 'outline-none' : ''}`}
    >
      {/* Sparkline flourish only where a tile has room to spare (sm+, wider
          grid columns) — on the tight 2-col mobile grid it's the first
          thing to go so the number itself gets the full width. */}
      {corner && <span className="absolute right-2.5 top-2.5 hidden sm:inline-flex">{corner}</span>}
      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tintClass}`}>
        <Icon className={`h-4 w-4 ${iconClass}`} />
      </span>
      <div className={`min-w-0 flex-1 ${corner ? 'sm:pr-11' : ''}`}>
        <div className="text-lg font-bold tabular-nums truncate leading-tight">{value}</div>
        <div className="text-xs text-faint truncate">{label}</div>
      </div>
    </Comp>
  )
}

export default function Dashboard({ onNav }: { onNav: (v: string) => void }) {
  const {
    threads,
    blocks,
    habits,
    nudge,
    healthDays,
    projects,
    projectTasks,
    goals,
    milestones,
    emails,
    transactions,
    payments,
    completeBlock,
    skipBlock,
    tickHabit,
    toggleMilestone,
    markEmailRead,
    markPaymentPaid,
    toggleProjectTask,
  } = useStore()

  const today = healthDays.find((d) => d.date === TODAY) ?? healthDays[healthDays.length - 1]
  const nextBlock = blocks.filter((b) => b.status === 'planned')[0]

  // Step sync from the phone can land hours after sleep/energy are already
  // logged — a bare "0.0k" then reads as "you haven't moved" rather than
  // "not synced yet". Fall back to the most recent day that actually has
  // steps, and say so, instead of showing a misleading zero ring.
  const stepsStale = !today || today.steps === 0
  const lastStepsDay = stepsStale ? [...healthDays].reverse().find((d) => d.steps > 0) : today
  const stepsRingValue = lastStepsDay ? lastStepsDay.steps / lastStepsDay.stepGoal : 0
  const stepsRingLabel = lastStepsDay ? (lastStepsDay.steps / 1000).toFixed(1) + 'k' : '–'

  const openThreads = threads
    .filter((t) => t.status === 'open')
    .sort((a, b) => (a.due ? daysBetween(TODAY, a.due) : 999) - (b.due ? daysBetween(TODAY, b.due) : 999))

  const activeProjects = projects
    .filter((p) => p.status === 'active' || p.status === 'review' || p.status === 'blocked')
    .sort((a, b) => (a.deadline ? daysBetween(TODAY, a.deadline) : 999) - (b.deadline ? daysBetween(TODAY, b.deadline) : 999))

  const allImportantMail = emails.filter((e) => e.important)
  const importantMail = allImportantMail.slice(0, 3)

  // money — balance is computed identically to the Money screen (opening balance
  // + every known transaction) so the two screens never disagree.
  const balance = OPENING_BALANCE + transactions.reduce((a, t) => a + t.amount, 0)
  // 7-day running-balance trend for the saldo tile's sparkline — a glance at
  // direction (climbing/falling), not a substitute for the real chart in Geld.
  const daysAgo = (n: number) => {
    const d = new Date(TODAY + 'T00:00:00')
    d.setDate(d.getDate() - n)
    return d.toISOString().slice(0, 10)
  }
  const balanceTrend = Array.from({ length: 7 }, (_, i) => daysAgo(6 - i)).map(
    (date) => OPENING_BALANCE + transactions.filter((t) => t.date <= date).reduce((a, t) => a + t.amount, 0),
  )

  // Tap-to-expand: a quick trend chart for a stat tile, without leaving the
  // dashboard. Health data has no in-app deep link to Samsung Health/Health
  // Connect (OSLIFE ingests it via Sheets/MacroDroid, not a health API), so
  // this in-app expanded graph is the practical version of that request.
  const [metricDialog, setMetricDialog] = useState<'steps' | 'sleep' | 'energy' | 'saldo' | null>(null)
  const last14Health = healthDays.slice(-14)
  const metricSeries: Record<'steps' | 'sleep' | 'energy', MetricPoint[]> = {
    steps: last14Health.map((h) => ({ date: h.date.slice(8), value: h.steps })),
    sleep: last14Health.map((h) => ({ date: h.date.slice(8), value: h.sleepHours })),
    energy: last14Health.map((h) => ({ date: h.date.slice(8), value: h.energy })),
  }
  const saldoTrend: MetricPoint[] = Array.from({ length: 14 }, (_, i) => daysAgo(13 - i)).map((date) => ({
    date: date.slice(8),
    value: OPENING_BALANCE + transactions.filter((t) => t.date <= date).reduce((a, t) => a + t.amount, 0),
  }))

  // outstanding payments
  const openPayments = payments
    .filter((p) => p.status === 'open')
    .sort((a, b) => (a.due ? daysBetween(TODAY, a.due) : 999) - (b.due ? daysBetween(TODAY, b.due) : 999))
  const toReceive = openPayments.filter((p) => p.direction === 'incoming').reduce((a, p) => a + p.amount, 0)
  const toPay = openPayments.filter((p) => p.direction === 'outgoing').reduce((a, p) => a + p.amount, 0)

  // north star — pick the seeded revenue goal if present, otherwise the first live
  // goal (live goals carry generated ids, not "g1"), preferring the nearest deadline.
  const sortedGoals = [...goals].sort(
    (a, b) => (a.deadline ? daysBetween(TODAY, a.deadline) : 9999) - (b.deadline ? daysBetween(TODAY, b.deadline) : 9999),
  )
  const revenueGoal = goals.find((g) => g.id === 'g1') ?? sortedGoals[0]
  const goalPct = revenueGoal && revenueGoal.target ? revenueGoal.current / revenueGoal.target : 0
  const goalDays = revenueGoal && revenueGoal.deadline ? daysBetween(TODAY, revenueGoal.deadline) : 0
  const nextMilestone = revenueGoal
    ? milestones.find((m) => !m.done && (m.goalId === revenueGoal.id || m.goalId === null)) ?? milestones.find((m) => !m.done)
    : milestones.find((m) => !m.done)

  const hour = amsterdamHour()
  const greeting = hour < 12 ? 'Goedemorgen' : hour < 18 ? 'Goedemiddag' : 'Goedenavond'

  // Live location + temperature — a single compact header chip, not a full card.
  const weather = useWeather()
  const { Icon: WeatherIcon } = weatherMeta(weather.code, weather.isDay ?? true)
  const locationLabel = weather.place ?? 'Geldrop'

  // Project tasks due today (cap 5) — waiting-on-client projects excluded so the
  // list only holds things actually in your control today.
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const notBlocked = (projectId: string) => projectById.get(projectId)?.status !== 'blocked'
  const dueToday = projectTasks.filter((t) => !t.done && t.dueDate && t.dueDate <= TODAY && notBlocked(t.projectId))
  const doneToday = projectTasks.filter((t) => t.lastDoneOn === TODAY && notBlocked(t.projectId))
  const assignedToday = dueToday.length + doneToday.length
  const focusTasks = [...dueToday].sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '')).slice(0, 5)

  // Nudge: a Reflect pass writes a rich cross-domain nudge. Until then (e.g. fresh
  // live data, before any nightly reflect), derive the single most pressing nudge
  // from the live data so the card is never blank. Either way we hand NudgeCard a
  // structured nudge (tone + domain + source + action), not a bare string.
  const overduePay = openPayments.filter((p) => p.due && daysBetween(TODAY, p.due) < 0)
  const overdueProjects = activeProjects.filter((p) => p.deadline && daysBetween(TODAY, p.deadline) < 0)
  const habitsLeft = habits.filter((h) => !h.doneToday)
  // Was filtering the already-sliced 3-item preview list — undercounted
  // whenever there were more than 3 important mails. Count against the full set.
  const unreadImportant = allImportantMail.filter((e) => e.unread)

  // Prioriteiten: every currently-true thing that actually needs attention,
  // most urgent first — not just the single loudest one. A Reflect-authored
  // nudge (if the nightly pass has run) always leads; live-derived signals
  // fill in around it so the list never goes stale between Reflect runs.
  const TONE_RANK: Record<NudgeTone, number> = { urgent: 0, attention: 1, calm: 2 }
  const priorities: DashNudge[] = (() => {
    const list: DashNudge[] = []
    if (nudge.text?.trim()) list.push(storeNudgeToDash(nudge))
    if (overduePay.length)
      list.push({
        text: `Je hebt ${overduePay.length} betaling${overduePay.length > 1 ? 'en' : ''} over de vervaldatum (o.a. ${overduePay[0].payee}). Regel die eerst — ze blokkeren je hoofd.`,
        domain: 'buurtkaart',
        reason: 'oudste verlopen betaling',
        tone: 'urgent',
        cta: { label: 'Naar Geld', view: 'money' },
      })
    if (overdueProjects.length)
      list.push({
        text: `${overdueProjects[0].name} staat over de deadline. Plan vandaag één concreet blok om 'm los te trekken.`,
        domain: overdueProjects[0].domain,
        reason: 'project over de deadline',
        tone: 'urgent',
        cta: { label: 'Naar Projecten', view: 'projects' },
      })
    if (today && today.date === TODAY && today.sleepHours > 0 && today.sleepHours < 6.5)
      list.push({
        text: `Maar ${today.sleepHours}u geslapen. Houd vandaag je zwaarste denkwerk in de ochtend en plan niks na 22:30.`,
        domain: 'cross',
        reason: 'weinig slaap gemeten',
        tone: 'attention',
        cta: { label: 'Naar Gezondheid', view: 'vitals' },
      })
    if (unreadImportant.length)
      list.push({
        text: `${unreadImportant.length} belangrijke mail wacht op antwoord. Beantwoord 'm nu het nog klein is.`,
        domain: 'parkingyou',
        reason: 'belangrijke mail ongelezen',
        tone: 'attention',
        cta: { label: 'Naar Inbox', view: 'inbox' },
      })
    if (habitsLeft.length && habits.length)
      list.push({
        text: `Nog ${habitsLeft.length}/${habits.length} gewoonten open vandaag. Pak de makkelijkste eerst voor de momentum.`,
        domain: 'buurtkaart',
        reason: 'gewoonten nog open vandaag',
        tone: 'attention',
        cta: { label: 'Naar Gewoonten', view: 'habits' },
      })
    if (!list.length && habits.length)
      list.push({
        text: 'Alle gewoonten staan, geen betaling te laat. Mooie dag — kies één ding dat je vooruit helpt.',
        domain: 'personal',
        reason: 'alles onder controle',
        tone: 'calm',
        cta: { label: 'Naar Noordster', view: 'northstar' },
      })
    return list.sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]).slice(0, 3)
  })()

  // Levensbalans: one real 0-100 score per life domain, from the same data
  // every other block on this screen already uses — not a vibe, a computed
  // read of where things actually stand right now.
  const healthScore = today
    ? Math.round(
        ((Math.min(1, (lastStepsDay?.steps ?? 0) / (today.stepGoal || 10000)) +
          Math.min(1, today.sleepHours / 8) +
          Math.min(1, today.energy / 5)) /
          3) *
          100,
      )
    : null
  const moneyScore = (() => {
    if (!revenueGoal && !openPayments.length) return null
    let score = revenueGoal ? Math.min(100, Math.round(goalPct * 100)) : 70
    score -= overduePay.length * 20
    return Math.max(0, Math.min(100, score))
  })()
  const werkScore = activeProjects.length
    ? Math.max(
        0,
        100 - overdueProjects.length * 25 - activeProjects.filter((p) => p.status === 'blocked' && !overdueProjects.includes(p)).length * 10,
      )
    : null
  const gewoontesScore = habits.length ? Math.round((habits.filter((h) => h.doneToday).length / habits.length) * 100) : null
  const communicatieScore = emails.length ? Math.max(0, 100 - Math.min(100, unreadImportant.length * 25)) : null
  const radarData = (
    [
      { domain: 'Gezondheid', score: healthScore },
      { domain: 'Geld', score: moneyScore },
      { domain: 'Werk', score: werkScore },
      { domain: 'Gewoontes', score: gewoontesScore },
      { domain: 'Communicatie', score: communicatieScore },
    ] as { domain: string; score: number | null }[]
  ).filter((d): d is { domain: string; score: number } => d.score !== null)

  return (
    <div className="space-y-4">
      {/* ── compact header: one line, no dedicated card ─────────────────────── */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 animate-fade-up">
        <h1 className="text-xl font-semibold">
          {greeting}, Rick. <span className="text-muted font-normal text-sm">{fmtDate(TODAY)}</span>
        </h1>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
          <WeatherIcon className="h-4 w-4 text-parkingyou" />
          {locationLabel}{weather.tempC != null && ` · ${weather.tempC}°C`}
        </span>
      </div>

      {/* ── prioriteiten: every real thing that needs attention today, ranked ── */}
      {priorities.length > 0 && (
        <div className="card p-0 overflow-hidden animate-fade-up" style={{ animationDelay: '20ms' }}>
          <div className="px-3.5 pt-2.5">
            <span className="text-xs uppercase tracking-wider text-muted font-semibold">
              Prioriteiten
            </span>
          </div>
          <PriorityList items={priorities} onNav={onNav} />
        </div>
      )}

      {/* ── focus hero: the one thing to look at first ──────────────────────── */}
      <div className="card p-0 overflow-hidden animate-fade-up" style={{ animationDelay: '40ms' }}>
        <div className="p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted font-semibold">Nu doen</span>
            {nextBlock && (
              <span className="text-xs text-muted flex items-center gap-1">
                <Clock className="h-3 w-3" /> {nextBlock.start}–{nextBlock.end}
              </span>
            )}
          </div>
          {nextBlock ? (
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <DomainChip domain={nextBlock.domain} small />
              <span className="text-sm font-medium">{nextBlock.title}</span>
              <div className="flex gap-1.5 ml-auto">
                <button className="btn-primary min-h-[44px] !py-1.5 !px-3 text-xs" onClick={() => completeBlock(nextBlock.id)}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Klaar
                </button>
                <button className="btn-ghost min-h-[44px] !py-1.5 !px-3 text-xs" onClick={() => skipBlock(nextBlock.id)}>
                  <SkipForward className="h-3.5 w-3.5" /> Overslaan
                </button>
              </div>
            </div>
          ) : blocks.length ? (
            <p className="text-sm text-faint mt-1.5">Niks meer gepland vandaag. 🎉</p>
          ) : (
            <button onClick={() => onNav('daybuilder')} className="text-xs text-muted hover:text-ink flex items-center gap-1 mt-1.5">
              <CalendarRange className="h-3.5 w-3.5" /> Bouw je dag in de Dagplanner <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* ── KPI cockpit strip: everything at a glance, one tap through ──────── */}
      {/* One bold "hero" bento tile (lime, dark text) for the single always-
          relevant daily number — vitals — everything else stays low-key so
          it doesn't compete for attention (one focal point, not eight).
          8 units at lg:grid-cols-4 (hero=2 + six 1-col tiles) fills exactly
          two full rows — no lonely tile stranded on its own row. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 animate-fade-up" style={{ animationDelay: '60ms' }}>
        <div className="card-hero p-3 col-span-2 sm:col-span-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider">Vitaal vandaag</span>
            <button
              onClick={() => onNav('vitals')}
              className="text-xs font-semibold underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded"
            >
              alles
            </button>
          </div>
          {today ? (
            <div className="flex items-center gap-3 mt-1.5">
              <div className="flex flex-col items-center gap-0.5 shrink-0">
                <button
                  onClick={() => setMetricDialog('steps')}
                  className="rounded-xl p-1 -m-1 outline-none transition-colors hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                  aria-label={
                    stepsStale && lastStepsDay
                      ? `Stappen — nog niet gesynchroniseerd vandaag, laatst bekend ${fmtDate(lastStepsDay.date)}. Bekijk 14-daagse grafiek`
                      : 'Stappen — bekijk 14-daagse grafiek'
                  }
                >
                  <Ring value={stepsRingValue} size={56} stroke={6} color="stroke-[#16210f]" label={stepsRingLabel} />
                </button>
                {stepsStale && lastStepsDay && (
                  <span className="text-xs font-medium whitespace-nowrap">nog niet gesynct</span>
                )}
              </div>
              <div className="flex flex-col gap-1 min-w-0">
                <button
                  onClick={() => setMetricDialog('sleep')}
                  className="flex items-center gap-1.5 text-sm font-semibold tabular-nums rounded-lg px-1.5 py-0.5 -mx-1.5 outline-none transition-colors hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                >
                  <Moon className="h-3.5 w-3.5" />{today.sleepHours}u
                </button>
                <button
                  onClick={() => setMetricDialog('energy')}
                  className="flex items-center gap-1.5 text-sm font-semibold tabular-nums rounded-lg px-1.5 py-0.5 -mx-1.5 outline-none transition-colors hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                >
                  <Zap className="h-3.5 w-3.5" />{today.energy}/5
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => onNav('vitals')} className="flex items-center gap-3 mt-1.5 text-left">
              <Activity className="h-6 w-6 shrink-0" />
              <div className="text-sm font-medium">Nog geen gezondheidsdata — tik om te koppelen</div>
            </button>
          )}
        </div>

        <KpiTile
          icon={Wallet}
          iconClass="text-buurtkaart"
          value={transactions.length ? eur(balance) : '–'}
          label="saldo"
          onClick={() => setMetricDialog('saldo')}
          corner={transactions.length >= 2 ? <Sparkline values={balanceTrend} className="text-buurtkaart" width={44} height={20} /> : undefined}
        />
        <KpiTile
          icon={Receipt}
          iconClass="text-personal"
          value={
            openPayments.length ? (
              // Two short stacked amounts, not one squeezed "€1.200 / €45"
              // string — that format either truncated or forced the tile
              // wider than its 2-col mobile column has room for.
              <span className="flex flex-col gap-0.5 text-base leading-tight">
                <span className="text-buurtkaart-deep">+{eur(toReceive)}</span>
                <span className="text-cross-deep">-{eur(toPay)}</span>
              </span>
            ) : (
              'niks open'
            )
          }
          label="te ontv. / te betalen"
          onClick={() => onNav('money')}
        />
        <KpiTile
          icon={Mail}
          iconClass="text-parkingyou"
          value={unreadImportant.length || '0'}
          label="belangrijke mail"
          onClick={() => onNav('inbox')}
        />
        <KpiTile
          icon={CheckSquare}
          iconClass="text-forest"
          value={openThreads.length}
          label="open taken"
          onClick={() => onNav('tasks')}
        />
        <KpiTile
          icon={Target}
          iconClass="text-prjct"
          value={revenueGoal ? `${Math.round(goalPct * 100)}%` : '–'}
          label="North Star"
          onClick={() => onNav('northstar')}
        />
        <button
          onClick={() => onNav('habits')}
          className="card flex items-center gap-2.5 p-2.5 text-left outline-none"
        >
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-personal/12">
            <Flame className="h-4 w-4 text-personal" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold tabular-nums leading-tight">
              {habits.length ? `${habits.filter((h) => h.doneToday).length}/${habits.length}` : '–'}
            </div>
            <div className="text-xs text-faint truncate">gewoontes</div>
            {habits.length > 0 && (
              <div className="mt-1">
                <SegmentedProgress done={habits.filter((h) => h.doneToday).length} total={habits.length} color="bg-personal" />
              </div>
            )}
          </div>
        </button>
      </div>

      {/* ── levensbalans: one computed score per domain, not a vibe ─────────── */}
      {radarData.length >= 3 && (
        <div className="card p-3.5 animate-fade-up" style={{ animationDelay: '70ms' }}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs uppercase tracking-wider text-muted font-semibold">Levensbalans</span>
            <span className="text-xs text-faint">score per domein · vandaag</span>
          </div>
          <ResponsiveContainer width="100%" height={190}>
            <RadarChart data={radarData} outerRadius="68%">
              <PolarGrid stroke="#E7E9DE" />
              <PolarAngleAxis dataKey="domain" tick={AXIS_TICK_11} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar dataKey="score" stroke="#6FA07C" fill="#6FA07C" fillOpacity={0.35} strokeWidth={2} />
              <Tooltip contentStyle={CHART_TIP} formatter={(v: number) => [`${v}/100`, 'score']} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}

      {today && (
        <>
          <MetricDetailDialog
            open={metricDialog === 'steps'}
            onClose={() => setMetricDialog(null)}
            title="Stappen"
            subtitle="Laatste 14 dagen"
            data={metricSeries.steps}
            color="#6FA07C"
            goal={today.stepGoal}
            kind="bar"
            action={{ label: 'Naar Gezondheid', onClick: () => { setMetricDialog(null); onNav('vitals') } }}
          />
          <MetricDetailDialog
            open={metricDialog === 'sleep'}
            onClose={() => setMetricDialog(null)}
            title="Slaap"
            subtitle="Laatste 14 dagen"
            data={metricSeries.sleep}
            unit="u"
            color="#6E8CA8"
            goal={8}
            kind="line"
            action={{ label: 'Naar Gezondheid', onClick: () => { setMetricDialog(null); onNav('vitals') } }}
          />
          <MetricDetailDialog
            open={metricDialog === 'energy'}
            onClose={() => setMetricDialog(null)}
            title="Energie"
            subtitle="Laatste 14 dagen · schaal 1-5"
            data={metricSeries.energy}
            color="#C6A05B"
            kind="line"
            action={{ label: 'Naar Gezondheid', onClick: () => { setMetricDialog(null); onNav('vitals') } }}
          />
        </>
      )}
      <MetricDetailDialog
        open={metricDialog === 'saldo'}
        onClose={() => setMetricDialog(null)}
        title="Saldo"
        subtitle="Laatste 14 dagen"
        data={saldoTrend}
        unit="€"
        color="#6FA07C"
        kind="line"
        action={{ label: 'Naar Geld', onClick: () => { setMetricDialog(null); onNav('money') } }}
      />

      {/* ── taken vandaag: project tasks due today, the actual to-do list ───── */}
      {assignedToday > 0 && (
        <div className="card p-3.5 animate-fade-up" style={{ animationDelay: '80ms' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wider text-muted font-semibold">Vandaag afmaken</span>
            <span className="text-xs text-muted tabular-nums">{doneToday.length}/{assignedToday}</span>
          </div>
          <SegmentedProgress done={doneToday.length} total={assignedToday} color="bg-forest" />
          {focusTasks.length > 0 && (
            <div className="space-y-1.5 mt-2.5">
              {focusTasks.map((t) => {
                const p = projectById.get(t.projectId)
                const due = dueLabel(t.dueDate ?? null, { prefix: 'deadline ' })
                return (
                  <div key={t.id} className="flex items-center gap-2.5">
                    <button
                      onClick={() => toggleProjectTask(t.id, true)}
                      aria-label={`${t.name} afvinken`}
                      className="shrink-0 h-6 w-6 rounded-md border border-line flex items-center justify-center text-transparent hover:border-forest hover:text-forest transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </button>
                    <span className="text-sm text-ink truncate flex-1">{t.name}</span>
                    <span className="text-xs text-faint truncate shrink-0 max-w-[9rem]">{p?.name ?? 'Project'}</span>
                    <span className={`text-xs shrink-0 ${due.overdue ? 'text-cross font-medium' : 'text-faint'}`}>{due.label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── habits: compact tap-to-check chip row ───────────────────────────── */}
      {habits.length > 0 && (
        <div className="flex flex-wrap gap-2 animate-fade-up" style={{ animationDelay: '100ms' }}>
          {habits.map((h) => (
            <button
              key={h.id}
              onClick={() => tickHabit(h.id)}
              aria-pressed={h.doneToday}
              className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                h.doneToday ? 'border-buurtkaart/50 bg-buurtkaart/10 text-buurtkaart-deep' : 'border-line hover:border-line-strong'
              }`}
            >
              <span>{h.emoji}</span> {h.name}
              <span className="text-xs text-faint flex items-center gap-0.5">
                <Flame className="h-3 w-3 text-personal" /> {h.streak}
              </span>
              <CheckCircle2 className={`h-3.5 w-3.5 ${h.doneToday ? 'text-buurtkaart' : 'text-faint'}`} />
            </button>
          ))}
        </div>
      )}

      {/* ── below the fold: secondary detail, scroll for more ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-2">
        {/* North Star */}
        <div className="card p-4 animate-fade-up" style={{ animationDelay: '120ms' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Target className="h-4 w-4 text-prjct" /> North Star
            </span>
            <button className="text-xs text-muted hover:text-ink flex items-center gap-1" onClick={() => onNav('northstar')}>
              alles <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          {revenueGoal ? (
            <>
              <div className="text-sm text-ink truncate">{revenueGoal.title}</div>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-2xl font-bold tabular-nums">{eur(revenueGoal.current)}</span>
                <span className="text-sm text-muted">van {eur(revenueGoal.target)}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-line overflow-hidden mt-2">
                <div className="h-full rounded-full bg-prjct transition-all duration-700" style={{ width: `${Math.min(1, goalPct) * 100}%` }} />
              </div>
              <p className="text-xs text-faint mt-1.5">
                {Math.round(goalPct * 100)}%
                {revenueGoal.deadline && ` · ${goalDays >= 0 ? `nog ${goalDays} dagen tot` : 'verlopen'} ${fmtDate(revenueGoal.deadline)}`}
              </p>
            </>
          ) : (
            <SetupHint
              icon={Target}
              title="Nog geen doel ingesteld"
              cta="Stel je North Star in"
              onCta={() => onNav('northstar')}
            >
              Eén meetbaar doel met deadline geeft alle andere schermen richting.
            </SetupHint>
          )}
          {revenueGoal && nextMilestone && (
            <button
              onClick={() => toggleMilestone(nextMilestone.id)}
              className="mt-3 w-full flex items-center gap-2 rounded-xl border border-line p-2.5 text-left hover:border-prjct/50 transition-colors"
            >
              <CheckCircle2 className="h-4 w-4 text-faint shrink-0" />
              <span className="text-sm flex-1">
                <span className="text-faint text-xs block">volgende mijlpaal</span>
                {nextMilestone.title}
              </span>
            </button>
          )}
        </div>

        {/* Projects */}
        <div className="card p-4 animate-fade-up" style={{ animationDelay: '140ms' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <FolderKanban className="h-4 w-4 text-parkingyou" /> Projecten
            </span>
            <button className="text-xs text-muted hover:text-ink flex items-center gap-1" onClick={() => onNav('projects')}>
              alle {projects.length} <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          {activeProjects.length ? (
            <div className="space-y-2">
              {activeProjects.slice(0, 4).map((p) => {
                const due = dueLabel(p.deadline, { none: '–' })
                return (
                  <div key={p.id} className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${DOMAIN_META[p.domain].dot}`} />
                    <span className="text-sm text-ink truncate flex-1">
                      {p.name} <span className="text-faint">· {p.client}</span>
                    </span>
                    {p.status === 'blocked' && <span className="chip bg-cross/15 text-cross-deep !py-0">geblokkeerd</span>}
                    <span className={`text-xs shrink-0 ${due.overdue ? 'text-cross' : 'text-faint'}`}>
                      {due.label}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : projects.length ? (
            <Empty>Geen actieve projecten. 🎉</Empty>
          ) : (
            <SetupHint
              icon={FolderKanban}
              title="Nog geen projecten"
              cta="Open Projecten"
              onCta={() => onNav('projects')}
            >
              Projecten synchroniseren automatisch uit Notion.
            </SetupHint>
          )}
        </div>

        {/* Inbox */}
        <div className="card p-4 animate-fade-up" style={{ animationDelay: '160ms' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Mail className="h-4 w-4 text-personal" /> Belangrijke mail
            </span>
            <button className="text-xs text-muted hover:text-ink flex items-center gap-1" onClick={() => onNav('inbox')}>
              inbox <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          {importantMail.length ? (
            <div className="space-y-2">
              {importantMail.map((e) => (
                <button
                  key={e.id}
                  onClick={() => markEmailRead(e.id)}
                  className="w-full text-left flex items-start gap-2"
                >
                  {e.unread ? (
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-personal shrink-0" />
                  ) : (
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-line shrink-0" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={`text-sm truncate block ${e.unread ? 'text-ink font-medium' : 'text-muted'}`}>
                      {e.from} <span className="text-faint font-normal">· {e.subject}</span>
                    </span>
                    <span className="text-xs text-faint truncate block">{e.snippet}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : emails.length ? (
            <Empty>Geen belangrijke mail. Inbox is rustig. 🎉</Empty>
          ) : (
            <SetupHint
              icon={Mail}
              title="Inbox nog niet gekoppeld"
              cta="Open Inbox"
              onCta={() => onNav('inbox')}
            >
              Koppel Gmail via het Apps Script.
            </SetupHint>
          )}
        </div>
      </div>

      {/* first-run: nothing connected anywhere yet */}
      {!threads.length && !projects.length && !habits.length && !transactions.length && (
        <SetupHint icon={CheckSquare} title="Verbind je data">
          Zodra je databronnen leven, vult dit scherm zich vanzelf met je dag.
        </SetupHint>
      )}
    </div>
  )
}
