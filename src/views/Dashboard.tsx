import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { TODAY, DOMAIN_META, fmtDate, daysBetween } from '../domains'
import { isTransfer } from '../finance/categories'
import { dueLabel } from '../lib/dates'
import { OPENING_BALANCE } from '../mockData'
import { clientHealth } from '../lib/crm/followUp'
import { classifyImportance } from '../lib/crm/emailClassify'
import { Empty, SetupHint, Sparkline, Ring, DomainChip } from '../components/ui'
import { GreetingHeader, HeroStat, MetricTile, GoalRow, ScheduleCard, AgendaCard, TaskRow, type Tone } from '../components/v3'
import { useWeather, weatherMeta } from '../hooks/useWeather'
import { storeNudgeToDash, type DashNudge, type NudgeTone } from '../components/NudgeCard'
import { MarkdownInline } from '../components/Markdown'
import { MetricDetailDialog, type MetricPoint } from '../components/MetricDetailDialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog'
import CheckinCard from '../components/CheckinCard'
import { fetchSyncStatusFor, humanizeAge, type SyncSourceStatus } from '../lib/syncStatus'
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts'
import { CHART_TIP, AXIS_TICK_11 } from '../components/chart'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu'
import {
  CheckCircle2,
  Wallet,
  FolderKanban,
  Mail,
  ArrowRight,
  Receipt,
  CalendarDays,
  CheckSquare,
  Target,
  Activity,
  Bell,
  RefreshCw,
} from 'lucide-react'

// Ranks a source's health for "pick the worse of two" comparisons — down is
// worse than slow/empty/error, which are worse than up.
const SYNC_HEALTH_RANK: Record<SyncSourceStatus['health'], number> = { up: 0, slow: 1, empty: 1, error: 1, down: 2 }
function worseSync(a?: SyncSourceStatus, b?: SyncSourceStatus): SyncSourceStatus | undefined {
  if (!a) return b
  if (!b) return a
  return SYNC_HEALTH_RANK[b.health] > SYNC_HEALTH_RANK[a.health] ? b : a
}
const SYNC_BADGE_CLS: Record<SyncSourceStatus['health'], string> = {
  up: 'bg-sunken text-muted',
  slow: 'bg-personal/15 text-personal-deep',
  down: 'bg-cross/15 text-cross-deep',
  empty: 'bg-sunken text-muted',
  error: 'bg-cross/15 text-cross-deep',
}

import { eur0 as eur, fmtGoalValue } from '../lib/format'

/** Real local hour in Rick's timezone, so the greeting tracks the actual time of day. */
function amsterdamHour(): number {
  const h = new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    hour12: false,
    timeZone: 'Europe/Amsterdam',
  }).format(new Date())
  return parseInt(h, 10) % 24
}

/** Minutes since Amsterdam midnight, for comparing against a block's "HH:MM" start. */
function amsterdamMinutesNow(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    timeZone: 'Europe/Amsterdam',
  }).formatToParts(new Date())
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return h * 60 + m
}

/** How soon a block starts — feeds both the urgency dot color and its label. */
function blockUrgency(start: string): { tone: Tone; label: string } {
  const [h, m] = start.split(':').map(Number)
  const diff = h * 60 + m - amsterdamMinutesNow()
  if (diff <= 0) return { tone: 'danger', label: 'nu bezig' }
  if (diff < 60) return { tone: 'danger', label: `${diff} minuten` }
  const hours = Math.round(diff / 60)
  if (hours <= 3) return { tone: 'warning', label: `${hours} uur` }
  return { tone: 'success', label: `${hours} uur` }
}

/** Cosmetic only — swaps the agenda card's action glyph for a video icon. */
const isCallBlock = (title: string) => /\b(call|bel|overleg|meeting)\b/i.test(title)

const NUDGE_TONE: Record<NudgeTone, Tone> = { urgent: 'danger', attention: 'warning', calm: 'success' }

export default function Dashboard({ onNav }: { onNav: (v: string) => void }) {
  const {
    threads,
    blocks,
    habits,
    nudge,
    healthDays,
    checkins,
    projects,
    projectTasks,
    goals,
    milestones,
    emails,
    transactions,
    payments,
    dogReminders,
    clients,
    completeBlock,
    tickHabit,
    toggleMilestone,
    markEmailRead,
    toggleProjectTask,
    closeThread,
    toggleDogReminder,
    loadLiveData,
  } = useStore()

  // Real ingestion freshness for the health rings + saldo/mail tiles — the
  // same sync-health system Reflect's SourceStatusStrip uses, so the two
  // screens can never disagree about whether a source is actually stale.
  const [syncInfo, setSyncInfo] = useState<Record<string, SyncSourceStatus>>({})
  const [refreshing, setRefreshing] = useState(false)
  const SYNC_KEYS = ['health', 'sleep', 'finance', 'gmail']
  useEffect(() => {
    let alive = true
    fetchSyncStatusFor(SYNC_KEYS).then((rows) => {
      if (alive) setSyncInfo(Object.fromEntries(rows.map((r) => [r.key, r])))
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await loadLiveData()
      const rows = await fetchSyncStatusFor(SYNC_KEYS)
      setSyncInfo(Object.fromEntries(rows.map((r) => [r.key, r])))
    } finally {
      setRefreshing(false)
    }
  }

  // Energy is a manual check-in, not an ingested feed — read it straight from
  // `checkins` rather than `today.energy` (which defaults to a fake 3 for any
  // day nobody has actually logged), so an un-logged day never masquerades as
  // real data.
  const todaysCheckin = checkins.find((c) => c.date === TODAY)
  const [checkinOpen, setCheckinOpen] = useState(false)

  const today = healthDays.find((d) => d.date === TODAY) ?? healthDays[healthDays.length - 1]
  // Vandaag: every scheduled block today, soonest first — skipped ones drop
  // off the agenda row since they're no longer part of today's actual plan.
  const todaysBlocks = [...blocks].filter((b) => b.status !== 'skipped').sort((a, b) => a.start.localeCompare(b.start))

  // Step sync from the phone can land hours after sleep/energy are already
  // logged — a bare "0.0k" then reads as "you haven't moved" rather than
  // "not synced yet". Fall back to the most recent day that actually has
  // steps, and say so, instead of showing a misleading zero ring.
  const stepsStale = !today || today.steps === 0
  const lastStepsDay = stepsStale ? [...healthDays].reverse().find((d) => d.steps > 0) : today
  const stepsPct = lastStepsDay ? Math.min(1, lastStepsDay.steps / lastStepsDay.stepGoal) : 0
  const stepsLabel = lastStepsDay ? (lastStepsDay.steps / 1000).toFixed(1) : '–'

  // Real freshness for the "Vandaag" badge — the worse of the two feeds that
  // actually back these rings, so the badge always says how old the data
  // really is instead of a static "not synced" guess.
  const healthSync = worseSync(syncInfo.health, syncInfo.sleep)

  const openThreads = threads
    .filter((t) => t.status === 'open')
    .sort((a, b) => (a.due ? daysBetween(TODAY, a.due) : 999) - (b.due ? daysBetween(TODAY, b.due) : 999))

  const activeProjects = projects
    .filter((p) => p.status === 'active' || p.status === 'review' || p.status === 'blocked')
    .sort((a, b) => (a.deadline ? daysBetween(TODAY, a.deadline) : 999) - (b.deadline ? daysBetween(TODAY, b.deadline) : 999))

  // The synced `important` flag is unreliable (flags newsletters/social as
  // important) — reclassify locally the same way Inbox.tsx does, and show the
  // most recent ones first.
  const allImportantMail = emails
    .filter((e) => classifyImportance(e) === 'high')
    .sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1))
  const importantMail = allImportantMail.slice(0, 3)

  // money — balance is computed identically to the Money screen (opening balance
  // + every known real transaction, excluding internal transfers between the
  // user's own accounts) so the two screens never disagree.
  const realTx = transactions.filter((t) => !isTransfer(t.category))
  const balance = OPENING_BALANCE + realTx.reduce((a, t) => a + t.amount, 0)
  // 7-day running-balance trend for the saldo tile's sparkline — a glance at
  // direction (climbing/falling), not a substitute for the real chart in Geld.
  const daysAgo = (n: number) => {
    const d = new Date(TODAY + 'T00:00:00')
    d.setDate(d.getDate() - n)
    return d.toISOString().slice(0, 10)
  }
  const balanceTrend = Array.from({ length: 7 }, (_, i) => daysAgo(6 - i)).map(
    (date) => OPENING_BALANCE + realTx.filter((t) => t.date <= date).reduce((a, t) => a + t.amount, 0),
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
    value: OPENING_BALANCE + realTx.filter((t) => t.date <= date).reduce((a, t) => a + t.amount, 0),
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
  // from the live data so the card is never blank. Either way the priority carousel
  // gets a structured nudge (tone + domain + source + action), not a bare string.
  const overduePay = openPayments.filter((p) => p.due && daysBetween(TODAY, p.due) < 0)
  // Overdue money is the thing most likely to actually cost something if
  // ignored, so it earns the one hero slot over vitals — vitals only gets it
  // back when nothing more pressing is true today.
  const overdueOutgoing = overduePay.filter((p) => p.direction === 'outgoing')
  const overdueOutgoingTotal = overdueOutgoing.reduce((a, p) => a + p.amount, 0)
  const overdueProjects = activeProjects.filter((p) => p.deadline && daysBetween(TODAY, p.deadline) < 0)
  const habitsLeft = habits.filter((h) => !h.doneToday)
  // Was filtering the already-sliced 3-item preview list — undercounted
  // whenever there were more than 3 important mails. Count against the full set.
  const unreadImportant = allImportantMail.filter((e) => e.unread)
  // Kyra: reminders (vet, meds, ...) due today or overdue — a missed vet
  // appointment matters as much as a missed invoice, so it competes for the
  // same "what needs attention" real estate instead of living only on Dog.
  const dogDue = dogReminders.filter((r) => !r.done && r.due <= TODAY)
  // CRM: clients whose follow-up cadence has lapsed — the same object-
  // permanence problem as an unpaid invoice, just for a relationship instead
  // of money.
  const clientsNeedingFollowUp = clients.filter((c) => clientHealth(c, TODAY) === 'red')

  // Niet vergeten: date-bound reminders — dog care plus any open thread with
  // a real due date — due within a few days or already overdue. Same
  // object-permanence concern as the priority nudges above, surfaced here as
  // a checkable list instead of a single line.
  const upcomingReminders = [
    ...dogReminders.filter((r) => !r.done).map((r) => ({ id: r.id, title: r.title, due: r.due, kind: 'dog' as const })),
    ...openThreads.filter((t) => t.due).map((t) => ({ id: t.id, title: t.title, due: t.due as string, kind: 'thread' as const })),
  ]
    .filter((r) => daysBetween(TODAY, r.due) <= 3)
    .sort((a, b) => daysBetween(TODAY, a.due) - daysBetween(TODAY, b.due))
    .slice(0, 4)

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
        text: `**${overduePay.length} betaling${overduePay.length > 1 ? 'en' : ''} te laat** — o.a. ${overduePay[0].payee}`,
        domain: 'buurtkaart',
        reason: 'verlopen betaling',
        tone: 'urgent',
        cta: { label: 'Naar Geld', view: 'money' },
        badge: overduePay[0].due ? `${-daysBetween(TODAY, overduePay[0].due)}d te laat` : undefined,
      })
    if (overdueProjects.length)
      list.push({
        text: `**${overdueProjects[0].name}** over deadline — plan er vandaag een blok voor`,
        domain: overdueProjects[0].domain,
        reason: 'over de deadline',
        tone: 'urgent',
        cta: { label: 'Naar Projecten', view: 'projects' },
        badge: overdueProjects[0].deadline ? `${-daysBetween(TODAY, overdueProjects[0].deadline)}d te laat` : undefined,
      })
    if (today && today.date === TODAY && today.sleepHours > 0 && today.sleepHours < 6.5)
      list.push({
        text: `**${today.sleepHours}u geslapen** — zwaarste werk in de ochtend, niks na 22:30`,
        domain: 'cross',
        reason: 'weinig slaap',
        tone: 'attention',
        cta: { label: 'Naar Gezondheid', view: 'vitals' },
      })
    if (unreadImportant.length)
      list.push({
        text: `**${unreadImportant.length} belangrijke mail${unreadImportant.length > 1 ? 's' : ''}** wacht op antwoord`,
        domain: 'parkingyou',
        reason: 'mail ongelezen',
        tone: 'attention',
        cta: { label: 'Naar Inbox', view: 'inbox' },
      })
    if (habitsLeft.length && habits.length)
      list.push({
        text: `**${habitsLeft.length}/${habits.length} gewoonten open** — pak de makkelijkste eerst`,
        domain: 'buurtkaart',
        reason: 'gewoonten open',
        tone: 'attention',
        cta: { label: 'Naar Gewoonten', view: 'habits' },
      })
    if (dogDue.length)
      list.push({
        text: `**${dogDue[0].title}**${dogDue.length > 1 ? ` (+${dogDue.length - 1} meer)` : ''} voor Kyra`,
        domain: 'personal',
        reason: 'kyra-reminder',
        tone: 'attention',
        cta: { label: 'Naar Kyra', view: 'dog' },
      })
    if (clientsNeedingFollowUp.length)
      list.push({
        text: `**${clientsNeedingFollowUp.length} klant${clientsNeedingFollowUp.length > 1 ? 'en' : ''}** wacht op opvolging — o.a. ${clientsNeedingFollowUp[0].name}`,
        domain: clientsNeedingFollowUp[0].domain,
        reason: 'opvolging klant',
        tone: 'attention',
        cta: { label: 'Naar CRM', view: 'crm' },
      })
    if (!list.length && habits.length)
      list.push({
        text: '**Alles staat** — mooie dag, kies één ding dat je vooruit helpt',
        domain: 'personal',
        reason: 'alles onder controle',
        tone: 'calm',
        cta: { label: 'Naar Noordster', view: 'northstar' },
      })
    return list.sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]).slice(0, 4)
  })()

  // Levensbalans: one real 0-100 score per life domain, from the same data
  // every other block on this screen already uses — not a vibe, a computed
  // read of where things actually stand right now.
  const healthScore = today
    ? Math.round(
        ((Math.min(1, (lastStepsDay?.steps ?? 0) / (today.stepGoal || 10000)) +
          Math.min(1, today.sleepHours / 8) +
          Math.min(1, (todaysCheckin?.energy ?? 3) / 5)) /
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

  const doneHabits = habits.filter((h) => h.doneToday).length

  return (
    <div className="flex flex-col gap-5">
      {/* ── utility bar — weather, day, notifications ────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
          <WeatherIcon className="h-4 w-4" />
          {locationLabel}
          {weather.tempC != null && ` · ${weather.tempC}°C`}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="Nu synchroniseren"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-sunken text-ink-soft outline-none transition-colors hover:bg-line focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <span className="h-5 w-px bg-line" aria-hidden />
          <button
            onClick={() => onNav('daybuilder')}
            aria-label="Naar dagplanning"
            className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-sunken text-ink-soft outline-none transition-colors hover:bg-line focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            <CalendarDays className="h-4 w-4" />
            <span className="absolute -bottom-1 -right-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-ink px-0.5 text-[9px] font-medium tabular-nums text-canvas">
              {Number(TODAY.slice(8, 10))}
            </span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Meldingen"
                className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-sunken text-ink-soft outline-none transition-colors hover:bg-line focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              >
                <Bell className="h-4 w-4" />
                {priorities.length > 0 && <span className="absolute right-1.5 top-1 h-1.5 w-1.5 rounded-full bg-cross" />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>Prioriteiten vandaag</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {priorities.length ? (
                priorities.map((p, i) => (
                  <DropdownMenuItem
                    key={i}
                    onClick={() => p.cta && onNav(p.cta.view)}
                    className="flex flex-col items-start gap-0.5 whitespace-normal"
                  >
                    <span className="text-[11px] uppercase tracking-wide text-faint">{p.reason}</span>
                    <span className="text-sm leading-snug"><MarkdownInline text={p.text} /></span>
                  </DropdownMenuItem>
                ))
              ) : (
                <DropdownMenuItem disabled>Niks openstaand — mooie dag 🎉</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── greeting — the one place a full sentence lives, inline-bold stats ── */}
      <GreetingHeader
        eyebrow={fmtDate(TODAY)}
        name={`${greeting}, Rick.`}
        sentence={
          <>
            Je hebt vandaag <b>{focusTasks.length} taken</b>
            {blocks.length > 0 && (
              <>
                {' '}
                en <b>{blocks.filter((b) => b.status === 'planned').length} geplande blokken</b>
              </>
            )}
            {todaysCheckin && (
              <>
                , en je energie staat op <b>{todaysCheckin.energy}/5</b>
              </>
            )}
            .
          </>
        }
      />

      {/* ── priorities — horizontal carousel, most urgent first ─────────────── */}
      {priorities.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted px-1">Prioriteiten</p>
          <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1">
            {priorities.map((p, i) => (
              <ScheduleCard
                key={i}
                tone={NUDGE_TONE[p.tone]}
                urgencyLabel={p.reason}
                title={p.text}
                badge={p.badge}
                onAction={p.cta ? () => onNav(p.cta!.view) : undefined}
                actionLabel={p.cta?.label}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── vandaag: every scheduled block today, horizontal, soonest first ─── */}
      {todaysBlocks.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted px-1">Vandaag</p>
          <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1">
            {todaysBlocks.map((b) => {
              const urgency = blockUrgency(b.start)
              return (
                <AgendaCard
                  key={b.id}
                  domain={b.domain}
                  title={b.title}
                  start={b.start}
                  status={b.status}
                  tone={urgency.tone}
                  urgencyLabel={urgency.label}
                  isCall={isCallBlock(b.title)}
                  onComplete={b.status === 'planned' ? () => completeBlock(b.id) : undefined}
                />
              )
            })}
          </div>
        </div>
      ) : (
        <SetupHint icon={CalendarDays} title="Nog niks ingepland vandaag" cta="Bouw je dag" onCta={() => onNav('daybuilder')}>
          Laat de planner je dag vullen met taken, routines en pauzes.
        </SetupHint>
      )}

      {/* ── niet vergeten: date-bound reminders, most overdue first ─────────── */}
      {upcomingReminders.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted px-1">Niet vergeten</p>
          <div className="flex flex-col gap-2">
            {upcomingReminders.map((r) => {
              const days = daysBetween(TODAY, r.due)
              const priority = days < 0 ? 'high' : days <= 1 ? 'medium' : 'low'
              return (
                <TaskRow
                  key={r.id}
                  title={r.title}
                  meta={
                    <>
                      <Bell className="h-3 w-3" />
                      {days < 0 ? `${-days}d te laat` : days === 0 ? 'vandaag' : `${days} dagen`}
                    </>
                  }
                  priority={priority}
                  checked={false}
                  onToggle={() => (r.kind === 'dog' ? toggleDogReminder(r.id) : closeThread(r.id))}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* ── hero: whatever's actually most pressing today earns the one giant-
          number slot — overdue money first, vitals only as the calm-day
          fallback, not the permanent default. ───────────────────────────── */}
      {overdueOutgoing.length > 0 ? (
        <HeroStat label="Te betalen (verlopen)" value={eur(overdueOutgoingTotal)}>
          <button onClick={() => onNav('money')} className="chip bg-cross/15 text-cross-deep">
            {overdueOutgoing.length} betaling{overdueOutgoing.length > 1 ? 'en' : ''} over de vervaldatum — bekijk in Geld →
          </button>
        </HeroStat>
      ) : today ? (
        <div className="card-hero p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Vandaag</p>
            {healthSync && (
              <span className={`chip ${SYNC_BADGE_CLS[healthSync.health]}`}>
                {healthSync.health === 'up' ? `gesynct · ${humanizeAge(healthSync.lastAt)}` : `nog niet gesynct · ${humanizeAge(healthSync.lastAt)}`}
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setMetricDialog('steps')}
              className="flex flex-col items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-2xl py-1"
            >
              <Ring value={stepsPct} size={72} color="stroke-forest-hi" label={`${stepsLabel}k`} />
              <span className="text-xs text-muted">stappen</span>
            </button>
            <button
              onClick={() => setMetricDialog('sleep')}
              className="flex flex-col items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-2xl py-1"
            >
              <Ring value={Math.min(1, today.sleepHours / 8)} size={72} color="stroke-forest-hi" label={`${today.sleepHours}u`} />
              <span className="text-xs text-muted">slaap</span>
            </button>
            <button
              onClick={() => (todaysCheckin ? setMetricDialog('energy') : setCheckinOpen(true))}
              className="flex flex-col items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-2xl py-1"
            >
              {todaysCheckin ? (
                <Ring value={todaysCheckin.energy / 5} size={72} color="stroke-forest-hi" label={`${todaysCheckin.energy}/5`} />
              ) : (
                <Ring value={0} size={72} color="stroke-forest-hi" label="–" sub="loggen" />
              )}
              <span className="text-xs text-muted">energie</span>
            </button>
          </div>
        </div>
      ) : null}

      {/* ── metrics: neutral tiles, one tap through — vitals lives here now as
          one tile among equals, not a permanent oversized hero. ───────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        <MetricTile
          icon={Wallet}
          value={transactions.length ? eur(balance) : '–'}
          label="saldo"
          onClick={() => setMetricDialog('saldo')}
          corner={transactions.length >= 2 ? <Sparkline values={balanceTrend} className="text-ink-soft" width={40} height={18} /> : undefined}
          footer={syncInfo.finance ? `bijgewerkt ${humanizeAge(syncInfo.finance.lastAt)}` : undefined}
        />
        <MetricTile
          icon={Receipt}
          value={
            openPayments.length ? (
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
        <MetricTile
          icon={Mail}
          value={unreadImportant.length || '0'}
          label="belangrijke mail"
          onClick={() => onNav('inbox')}
          footer={syncInfo.gmail ? `bijgewerkt ${humanizeAge(syncInfo.gmail.lastAt)}` : undefined}
        />
        <MetricTile icon={CheckSquare} value={openThreads.length} label="open taken" onClick={() => onNav('tasks')} />
        <MetricTile
          icon={Activity}
          value={today ? `${stepsLabel}k` : '–'}
          label="stappen vandaag"
          onClick={() => (today ? setMetricDialog('steps') : onNav('vitals'))}
        />
      </div>

      {/* ── goals — segmented progress + fraction, not an abstract percentage ── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Doelen</p>
          <button className="text-xs text-muted hover:text-ink flex items-center gap-1" onClick={() => onNav('northstar')}>
            alles <ArrowRight className="h-3 w-3" />
          </button>
        </div>
        {revenueGoal ? (
          <>
            <GoalRow
              label={revenueGoal.title}
              current={revenueGoal.current}
              target={revenueGoal.target}
              format={(n) => fmtGoalValue(n, revenueGoal.metric)}
              onClick={() => onNav('northstar')}
            />
            <p className="text-xs text-faint px-1">
              {Math.round(goalPct * 100)}%
              {revenueGoal.deadline && ` · ${goalDays >= 0 ? `nog ${goalDays} dagen tot` : 'verlopen'} ${fmtDate(revenueGoal.deadline)}`}
            </p>
            {nextMilestone && (
              <button
                onClick={() => toggleMilestone(nextMilestone.id)}
                className="flex items-center gap-2 rounded-full bg-sunken px-4 py-2.5 text-left hover:bg-line transition-colors"
              >
                <CheckCircle2 className="h-4 w-4 text-faint shrink-0" />
                <span className="text-sm flex-1">
                  <span className="text-faint text-xs block">volgende mijlpaal</span>
                  {nextMilestone.title}
                </span>
              </button>
            )}
          </>
        ) : (
          <SetupHint icon={Target} title="Nog geen doel ingesteld" cta="Stel je North Star in" onCta={() => onNav('northstar')}>
            Eén meetbaar doel met deadline geeft alle andere schermen richting.
          </SetupHint>
        )}
      </div>

      {/* ── habits: compact tap-to-check chip row ───────────────────────────── */}
      {habits.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Gewoontes</p>
            <span className="text-xs text-muted tabular-nums">{doneHabits}/{habits.length}</span>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {habits.map((h) => (
              <button
                key={h.id}
                onClick={() => tickHabit(h.id)}
                aria-pressed={h.doneToday}
                className={`aspect-square flex flex-col items-center justify-center gap-1.5 rounded-2xl p-2 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  h.doneToday ? 'bg-buurtkaart/12 text-buurtkaart-deep' : 'bg-sunken text-ink-soft hover:text-ink'
                }`}
              >
                <span className="text-2xl leading-none">{h.emoji}</span>
                <span className="text-xs font-medium leading-tight line-clamp-2">{h.name}</span>
                <CheckCircle2 className={`h-4 w-4 ${h.doneToday ? '' : 'text-faint'}`} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── tasks due today — checklist + a real count, mirroring the priority
          cards' number treatment above ────────────────────────────────────── */}
      {assignedToday > 0 && (
        <div className="card p-4 flex items-stretch justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-cross-deep">
                <span className="h-1.5 w-1.5 rounded-full bg-cross" />
                Vandaag afmaken
              </span>
              <span className="text-xs text-muted tabular-nums">{doneToday.length}/{assignedToday} klaar</span>
            </div>
            {focusTasks.length > 0 && (
              <div className="flex flex-col gap-2">
                {focusTasks.map((t) => {
                  const p = projectById.get(t.projectId)
                  const due = dueLabel(t.dueDate ?? null, { prefix: 'deadline ' })
                  return (
                    <TaskRow
                      key={t.id}
                      title={t.name}
                      meta={p?.name}
                      priority={due.overdue ? 'high' : 'medium'}
                      checked={false}
                      onToggle={() => toggleProjectTask(t.id, true)}
                    />
                  )
                })}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-center justify-center border-l border-line pl-4">
            <span className="text-4xl font-medium tabular-nums leading-none text-ink">{dueToday.length}</span>
            <span className="mt-1 whitespace-nowrap text-[10px] uppercase tracking-wider text-faint">taken</span>
          </div>
        </div>
      )}

      {/* ── levensbalans: one computed score per domain, not a vibe ─────────── */}
      {radarData.length >= 3 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted">Levensbalans</span>
            <span className="text-xs text-faint">score per domein · vandaag</span>
          </div>
          <ResponsiveContainer width="100%" height={190}>
            <RadarChart data={radarData} outerRadius="68%">
              <PolarGrid stroke="#2a2a2a" />
              <PolarAngleAxis dataKey="domain" tick={AXIS_TICK_11} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar dataKey="score" stroke="#34D399" fill="#34D399" fillOpacity={0.35} strokeWidth={2} />
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
            color="#34D399"
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
            color="#60A5FA"
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
            color="#FBBF24"
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
        color="#34D399"
        kind="line"
        action={{ label: 'Naar Geld', onClick: () => { setMetricDialog(null); onNav('money') } }}
      />

      {/* Quick energie/stemming check-in — reached by tapping the energy ring
          before today's check-in has been logged, instead of a trend chart
          with nothing today to show. */}
      <Dialog open={checkinOpen} onOpenChange={setCheckinOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Hoe voel je je vandaag?</DialogTitle>
          </DialogHeader>
          <CheckinCard compact onSaved={() => setTimeout(() => setCheckinOpen(false), 900)} />
        </DialogContent>
      </Dialog>

      {/* ── below the fold: secondary detail ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
        {/* Projects */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="flex items-center gap-2 text-sm font-medium">
              <FolderKanban className="h-4 w-4 text-muted" /> Projecten
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
                    <span className={`text-xs shrink-0 ${due.overdue ? 'text-cross' : 'text-faint'}`}>{due.label}</span>
                  </div>
                )
              })}
            </div>
          ) : projects.length ? (
            <Empty>Geen actieve projecten. 🎉</Empty>
          ) : (
            <SetupHint icon={FolderKanban} title="Nog geen projecten" cta="Open Projecten" onCta={() => onNav('projects')}>
              Maak je eerste project aan om te beginnen.
            </SetupHint>
          )}
        </div>

        {/* Inbox */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Mail className="h-4 w-4 text-muted" /> Belangrijke mail
            </span>
            <button className="text-xs text-muted hover:text-ink flex items-center gap-1" onClick={() => onNav('inbox')}>
              inbox <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          {importantMail.length ? (
            <div className="space-y-2">
              {importantMail.map((e) => (
                <button key={e.id} onClick={() => markEmailRead(e.id)} className="w-full text-left flex items-start gap-2">
                  <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${e.unread ? 'bg-personal' : 'bg-line'}`} />
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
            <SetupHint icon={Mail} title="Inbox nog niet gekoppeld" cta="Open Inbox" onCta={() => onNav('inbox')}>
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
