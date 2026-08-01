import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { TODAY, fmtDate, daysBetween } from '../domains'
import { computeBalance, balanceOnDates } from '../finance/balance'
import { monthly } from '../finance/BillsTab'
import { dueLabel } from '../lib/dates'
import { OPENING_BALANCE } from '../mockData'
import { clientHealth } from '../lib/crm/followUp'
import { classifyImportance } from '../lib/crm/emailClassify'
import { SetupHint, Sparkline, Ring } from '../components/ui'
import { GreetingHeader, HeroStat, MetricTile, GoalRow, AgendaCard, SuggestedBlockCard, type Tone } from '../components/v3'
import { suggestTodayBlocks, toMin } from '../heyra/blockSuggestions'
import { financeInferenceNudges, findUnactionedWorkoutBraindump, workoutBraindumpNudge } from '../heyra/proactiveNudges'
import { usePersistedState } from '../lib/usePersistedState'
import { useWeather, weatherMeta } from '../hooks/useWeather'
import { PriorityList, storeNudgeToDash, type DashNudge, type NudgeTone } from '../components/NudgeCard'
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
  CalendarDays,
  CheckSquare,
  Target,
  Activity,
  Bell,
  RefreshCw,
  Sparkles,
  Zap,
  Moon,
  Users,
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

/**
 * A planned block whose end time has passed without being completed reads as
 * "missed" instead of forever "nu bezig" — purely a display derivation (never
 * written back to the store/DB), recomputed off a ticking clock so a block
 * actually moves out of the way the moment its window closes, without
 * needing a reload.
 */
function effectiveBlockStatus(
  status: 'planned' | 'done' | 'skipped',
  end: string,
  nowMin: number,
): 'planned' | 'done' | 'skipped' | 'missed' {
  return status === 'planned' && toMin(end) <= nowMin ? 'missed' : status
}

/**
 * The hero slot's swipeable form — one candidate card fills the screen at a
 * time (still a single focal point per docs/design.md §8), but a horizontal
 * swipe pages to the others instead of the runner-up disappearing entirely.
 * Dots only render once there's something to page between.
 */
function HeroCarousel({ slides }: { slides: React.ReactNode[] }) {
  const [active, setActive] = useState(0)
  const trackRef = useRef<HTMLDivElement>(null)

  if (slides.length === 1) return <>{slides[0]}</>

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={trackRef}
        onScroll={(e) => {
          const el = e.currentTarget
          setActive(Math.round(el.scrollLeft / Math.max(el.clientWidth, 1)))
        }}
        className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto"
      >
        {slides.map((slide, i) => (
          <div key={i} className="w-full shrink-0 snap-center">
            {slide}
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-1.5">
        {slides.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${i === active ? 'w-4 bg-ink-soft' : 'w-1.5 bg-line-strong'}`}
          />
        ))}
      </div>
    </div>
  )
}

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
    balanceCheckpoints,
    payments,
    subscriptions,
    dogReminders,
    clients,
    inferences,
    braindumpEntries,
    braindumpLinks,
    completeBlock,
    skipBlock,
    addSuggestedBlock,
    tickHabit,
    toggleMilestone,
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

  // Ticks once a minute so a block that just ran past its end time flips to
  // "gemist" live, without needing a reload to notice the clock moved on.
  const [nowMin, setNowMin] = useState(() => amsterdamMinutesNow())
  useEffect(() => {
    const id = setInterval(() => setNowMin(amsterdamMinutesNow()), 60_000)
    return () => clearInterval(id)
  }, [])

  const today = healthDays.find((d) => d.date === TODAY) ?? healthDays[healthDays.length - 1]
  // Vandaag: every scheduled block today, soonest first — skipped ones drop
  // off the agenda row since they're no longer part of today's actual plan.
  // Checking one off pushes it after every still-open block (each group still
  // soonest-first) instead of leaving a done card sitting mid-row, so the
  // overview opens on what's actually still ahead of you.
  const todaysBlocks = [...blocks]
    .filter((b) => b.status !== 'skipped')
    .sort((a, b) => {
      const ra = a.status === 'done' || effectiveBlockStatus(a.status, a.end, nowMin) === 'missed'
      const rb = b.status === 'done' || effectiveBlockStatus(b.status, b.end, nowMin) === 'missed'
      return ra === rb ? a.start.localeCompare(b.start) : ra ? 1 : -1
    })

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

  const activeProjects = projects
    .filter((p) => p.status === 'active' || p.status === 'review' || p.status === 'blocked')
    .sort((a, b) => (a.deadline ? daysBetween(TODAY, a.deadline) : 999) - (b.deadline ? daysBetween(TODAY, b.deadline) : 999))
  const activeProjectsValue = activeProjects.reduce((a, p) => a + p.value, 0)

  // The synced `important` flag is unreliable (flags newsletters/social as
  // important) — reclassify locally the same way Inbox.tsx does.
  const allImportantMail = emails.filter((e) => classifyImportance(e) === 'high')

  // money — same balance math as the Money screen: opening balance plus real
  // (non-transfer) transactions, corrected by the latest manual balance
  // checkpoint so the two screens can never silently drift apart.
  const { balance } = computeBalance(transactions, balanceCheckpoints, OPENING_BALANCE)
  const daysAgo = (n: number) => {
    const d = new Date(TODAY + 'T00:00:00')
    d.setDate(d.getDate() - n)
    return d.toISOString().slice(0, 10)
  }
  // 7-day running-balance trend for the saldo tile's sparkline — a glance at
  // direction (climbing/falling), not a substitute for the real chart in Geld.
  const balanceTrend = balanceOnDates(transactions, balanceCheckpoints, OPENING_BALANCE, Array.from({ length: 7 }, (_, i) => daysAgo(6 - i)))

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
  const saldoDates14 = Array.from({ length: 14 }, (_, i) => daysAgo(13 - i))
  const saldoValues14 = balanceOnDates(transactions, balanceCheckpoints, OPENING_BALANCE, saldoDates14)
  const saldoTrend: MetricPoint[] = saldoDates14.map((date, i) => ({ date: date.slice(8), value: saldoValues14[i] }))

  // outstanding payments
  const openPayments = payments
    .filter((p) => p.status === 'open')
    .sort((a, b) => (a.due ? daysBetween(TODAY, a.due) : 999) - (b.due ? daysBetween(TODAY, b.due) : 999))
  // Next couple of payments that aren't already overdue (those get their own
  // red row above) — incoming or outgoing, soonest first.
  const upcomingPayments = openPayments.filter((p) => !(p.due && daysBetween(TODAY, p.due) < 0)).slice(0, 2)
  const activeSubs = subscriptions.filter((s) => s.active)
  const subsMonthlyTotal = activeSubs.reduce((a, s) => a + monthly(s.amount, s.cadence), 0)

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

  // Project tasks due today — waiting-on-client projects excluded so the
  // count only reflects things actually in your control today.
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const notBlocked = (projectId: string) => projectById.get(projectId)?.status !== 'blocked'
  const dueToday = projectTasks.filter((t) => !t.done && t.dueDate && t.dueDate <= TODAY && notBlocked(t.projectId))
  const focusTasks = [...dueToday].sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '')).slice(0, 5)

  // Nudge inputs: every currently-true thing that actually needs attention.
  const overduePay = openPayments.filter((p) => p.due && daysBetween(TODAY, p.due) < 0)
  const overdueOutgoing = overduePay.filter((p) => p.direction === 'outgoing')
  const overdueOutgoingTotal = overdueOutgoing.reduce((a, p) => a + p.amount, 0)
  const overdueProjects = activeProjects.filter((p) => p.deadline && daysBetween(TODAY, p.deadline) < 0)
  const habitsLeft = habits.filter((h) => !h.doneToday)
  // A habit whose streak is about to snap if it stays unchecked today — a
  // sharper, higher-stakes prompt than a generic "N habits open" count.
  const streakAtRisk = [...habitsLeft].filter((h) => h.streak > 0).sort((a, b) => b.streak - a.streak)
  const unreadImportant = allImportantMail.filter((e) => e.unread)
  // Kyra: reminders (vet, meds, ...) due today or overdue — a missed vet
  // appointment matters as much as a missed invoice, so it competes for the
  // same "what needs attention" real estate instead of living only on Dog.
  const dogDue = dogReminders.filter((r) => !r.done && r.due <= TODAY)
  // CRM: clients whose follow-up cadence has lapsed — the same object-
  // permanence problem as an unpaid invoice, just for a relationship instead
  // of money.
  const clientsNeedingFollowUp = clients.filter((c) => clientHealth(c, TODAY) === 'red')

  // Voorgesteld voor vandaag: real suggested blocks for whatever's left of the
  // day — habits still open, tasks due, overdue money/mail, Kyra reminders,
  // a lapsed follow-up, the next milestone, even last night's sleep — instead
  // of the same generic set every time. Dismissals persist for the day so a
  // reload doesn't resurrect something already waved off.
  const [dismissedSuggestions, setDismissedSuggestions] = usePersistedState<string[]>(
    `oslife.dismissedSuggestions.${TODAY}`,
    [],
  )
  const suggestedBlocks = useMemo(() => {
    const all = suggestTodayBlocks({
      nowMinutes: amsterdamMinutesNow(),
      busy: todaysBlocks.map((b) => [toMin(b.start), toMin(b.end)]),
      todaysBlockTitles: todaysBlocks.map((b) => b.title.toLowerCase()),
      habitsOpen: habitsLeft.map((h) => ({ id: h.id, name: h.name, emoji: h.emoji, streak: h.streak })),
      dogDue: dogDue.map((r) => ({ id: r.id, title: r.title })),
      overduePayments: overduePay.map((p) => ({ domain: p.domain })),
      unreadImportantMailCount: unreadImportant.length,
      focusTasks: focusTasks.slice(0, 2).map((t) => ({ id: t.id, name: t.name, domain: projectById.get(t.projectId)?.domain ?? 'prjct' })),
      clientsNeedingFollowUp: clientsNeedingFollowUp.slice(0, 1).map((c) => ({ id: c.id, name: c.name, domain: c.domain })),
      nextMilestone: nextMilestone ? { title: nextMilestone.title, domain: revenueGoal?.domain ?? 'personal' } : null,
      sleepHours: today && today.date === TODAY && today.sleepHours > 0 ? today.sleepHours : null,
    })
    return all.filter((s) => !dismissedSuggestions.includes(s.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todaysBlocks, habitsLeft, dogDue, overduePay, unreadImportant, focusTasks, clientsNeedingFollowUp, nextMilestone, revenueGoal, today, dismissedSuggestions, projectById])

  // Vraagt om aandacht: every currently-true thing that needs attention, most
  // urgent first, each stating what ignoring it actually costs — not just
  // "an open to-do". A Reflect-authored nudge (if the nightly pass has run)
  // always leads; live-derived signals fill in around it so the list never
  // goes stale between Reflect runs.
  const TONE_RANK: Record<NudgeTone, number> = { urgent: 0, attention: 1, calm: 2 }
  const priorities: DashNudge[] = (() => {
    const list: DashNudge[] = []
    if (nudge.text?.trim()) list.push(storeNudgeToDash(nudge))
    if (overduePay.length)
      list.push({
        text: `**${overduePay.length} betaling${overduePay.length > 1 ? 'en' : ''} te laat** — o.a. ${overduePay[0].payee}`,
        domain: 'buurtkaart',
        reason: 'kans op incassokosten',
        tone: 'urgent',
        cta: { label: 'Betaal', view: 'money' },
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
    if (streakAtRisk.length)
      list.push({
        text: `**${streakAtRisk[0].name}-streak van ${streakAtRisk[0].streak} dagen** breekt vanavond als je niet afvinkt`,
        domain: 'personal',
        reason: 'streak op het spel',
        tone: 'attention',
        cta: { label: 'Afvinken', view: 'habits' },
      })
    else if (habitsLeft.length && habits.length)
      list.push({
        text: `**${habitsLeft.length}/${habits.length} gewoonten open** — pak de makkelijkste eerst`,
        domain: 'buurtkaart',
        reason: 'gewoonten open',
        tone: 'attention',
        cta: { label: 'Naar Gewoonten', view: 'habits' },
      })
    if (dueToday.length)
      list.push({
        text: `**${dueToday.length} projecttaak${dueToday.length > 1 ? 'en' : ''}** moet${dueToday.length > 1 ? 'en' : ''} vandaag nog af`,
        domain: 'prjct',
        reason: 'taken vandaag',
        tone: 'attention',
        cta: { label: 'Naar Projecten', view: 'projects' },
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
    for (const n of financeInferenceNudges(inferences))
      list.push({ text: n.text, domain: 'cross', reason: n.reason, tone: 'attention', cta: n.cta })
    const workoutHit = findUnactionedWorkoutBraindump(braindumpEntries, braindumpLinks)
    if (workoutHit) {
      const n = workoutBraindumpNudge(workoutHit)
      list.push({ text: n.text, domain: 'personal', reason: n.reason, tone: 'calm', cta: n.cta })
    }
    if (!list.length && habits.length)
      list.push({
        text: '**Alles staat** — mooie dag, kies één ding dat je vooruit helpt',
        domain: 'personal',
        reason: 'alles onder controle',
        tone: 'calm',
        cta: { label: 'Naar Noordster', view: 'northstar' },
      })
    return list.sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]).slice(0, 6)
  })()
  const [attentionExpanded, setAttentionExpanded] = useState(false)
  const visiblePriorities = attentionExpanded ? priorities : priorities.slice(0, 3)

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
  const weakestDomain = radarData.length ? radarData.reduce((min, d) => (d.score < min.score ? d : min)) : null
  const weakestDetail: Record<string, string> = {
    Gezondheid: today && today.sleepHours > 0 && today.sleepHours < 7 ? 'weinig slaap deze dagen' : 'stappen en energie liggen laag',
    Geld: overduePay.length ? `${overduePay.length} betaling${overduePay.length > 1 ? 'en' : ''} te laat` : 'doel ligt achter op schema',
    Werk: overdueProjects.length ? `${overdueProjects.length} project${overdueProjects.length > 1 ? 'en' : ''} over de deadline` : 'projecten liggen stil',
    Gewoontes: `${habitsLeft.length}/${habits.length} gewoontes nog open`,
    Communicatie: unreadImportant.length ? `${unreadImportant.length} belangrijke mail${unreadImportant.length > 1 ? 's' : ''} wacht nog` : 'weinig recent contact',
  }

  const doneHabits = habits.filter((h) => h.doneToday).length

  // Hero's calm-day copy — vitals are otherwise silent numbers; this is the
  // one sentence that says whether today calls for pushing or resting.
  const heroVitalsSentence = (() => {
    if (!today) return ''
    const lowSleep = today.sleepHours > 0 && today.sleepHours < 7
    const lowEnergy = todaysCheckin ? todaysCheckin.energy <= 2 : false
    const lowSteps = lastStepsDay ? lastStepsDay.steps < lastStepsDay.stepGoal * 0.4 : false
    if (lowSleep && lowEnergy) return 'Kort geslapen en energie laag — vandaag is een dag om het rustig aan te doen.'
    if (lowSleep) return 'Iets kort geslapen — zwaarste werk vroeg inplannen, de rest kan rustig.'
    if (lowEnergy) return 'Energie laag vandaag — een rustige dag is prima, forceer niets.'
    if (lowSteps) return 'Nog weinig beweging vandaag — een korte wandeling helpt meer dan het lijkt.'
    return 'Slaap, energie en beweging staan er gezond bij — een goede basis voor vandaag.'
  })()

  // Hero: every candidate card this slot could show today, not just the
  // auto-picked one — the carousel opens on whichever is most pressing
  // (overdue money first, the calm-day recovery score otherwise) but a
  // swipe reveals the rest instead of hiding them entirely. The money card
  // is always present (an urgent red state when something's overdue, a
  // calm balance summary otherwise) so there's always something to swipe
  // to, not just on the rare day something's actually overdue.
  const geldSlide = (
    <HeroStat
      key="geld"
      label={overdueOutgoing.length > 0 ? 'Te betalen (verlopen)' : 'Geld'}
      value={overdueOutgoing.length > 0 ? eur(overdueOutgoingTotal) : (transactions.length ? eur(balance) : '–')}
    >
      {overdueOutgoing.length > 0 ? (
        <button onClick={() => onNav('money')} className="flex items-start gap-1.5 text-left text-sm font-medium text-cross-deep">
          <span>{overdueOutgoing.length} betaling{overdueOutgoing.length > 1 ? 'en' : ''} over de vervaldatum — bekijk in Geld</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        </button>
      ) : upcomingPayments.length > 0 ? (
        <button onClick={() => onNav('money')} className="flex items-start gap-1.5 text-left text-sm font-medium text-ink-soft">
          <span>{upcomingPayments.length} betaling{upcomingPayments.length > 1 ? 'en' : ''} nog te gaan — bekijk in Geld</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        </button>
      ) : (
        <p className="text-sm text-ink-soft">Niets openstaand — saldo op orde.</p>
      )}
    </HeroStat>
  )
  const vandaagSlide = today && healthScore !== null ? (
    <div key="vandaag" className="card-hero p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">
          Vandaag
          <span
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-forest/15 text-forest-hi"
            title="Automatisch gekozen — dit vak toont altijd wat vandaag het meest telt"
          >
            <Sparkles className="h-3 w-3" />
          </span>
        </span>
        {healthSync && (
          <span className={`chip ${SYNC_BADGE_CLS[healthSync.health]}`}>
            {healthSync.health === 'up' ? `gesynct · ${humanizeAge(healthSync.lastAt)}` : `nog niet gesynct · ${humanizeAge(healthSync.lastAt)}`}
          </span>
        )}
      </div>
      <div className="flex items-center gap-5">
        <Ring value={healthScore / 100} size={92} stroke={9} color="stroke-lime" label={healthScore} sub="herstel" />
        <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink-soft">{heroVitalsSentence}</p>
      </div>
    </div>
  ) : null
  const heroSlides: React.ReactNode[] = overdueOutgoing.length > 0
    ? [geldSlide, vandaagSlide].filter(Boolean)
    : [vandaagSlide, geldSlide].filter(Boolean)
  const heroFooter = heroSlides.length > 1
    ? 'Begint bij wat vandaag het meest telt — swipe voor de rest.'
    : 'Dit vak toont wat vandaag het meest telt.'

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
              <DropdownMenuLabel>Vraagt om aandacht</DropdownMenuLabel>
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

      {/* ── greeting — the one place a full sentence lives, plus today's state
          at a glance so "am I okay right now" never needs a tap ─────────── */}
      <div className="flex flex-col gap-3">
        <GreetingHeader
          eyebrow={fmtDate(TODAY)}
          name={`${greeting}, Rick.`}
          sentence={
            (() => {
              const n = priorities.filter((p) => p.tone !== 'calm').length
              if (!n) return <>Niks dringends vandaag — een goede dag om iets te doen dat je echt vooruit helpt.</>
              return (
                <>
                  <b>{n} ding{n === 1 ? '' : 'en'}</b> {n === 1 ? 'vraagt' : 'vragen'} vandaag om echt aandacht — de rest van de dag oogt rustig.
                </>
              )
            })()
          }
        />
        <div className="flex flex-wrap gap-2">
          {todaysCheckin && (
            <span className="chip bg-sunken text-ink-soft">
              <Zap className="h-3.5 w-3.5 text-faint" /> Energie <b className="font-medium text-ink">{todaysCheckin.energy}/5</b>
            </span>
          )}
          {today && today.sleepHours > 0 && (
            <span className="chip bg-sunken text-ink-soft">
              <Moon className="h-3.5 w-3.5 text-faint" /> Slaap <b className="font-medium tabular-nums text-ink">{today.sleepHours}u</b>
            </span>
          )}
          {!todaysCheckin && (
            <button
              onClick={() => setCheckinOpen(true)}
              className="chip border border-dashed border-line-strong text-muted transition-colors hover:bg-sunken hover:text-ink-soft"
            >
              Nog niet ingecheckt — nu doen →
            </button>
          )}
        </div>
      </div>

      {/* ── vraagt om aandacht: one ranked list, most urgent first, capped
          with the rest a tap away instead of hidden in a bell menu only ──── */}
      {priorities.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted px-1">Vraagt om aandacht</p>
          <div className="card overflow-hidden">
            <PriorityList items={visiblePriorities} onNav={onNav} />
            {priorities.length > 3 && (
              <button
                onClick={() => setAttentionExpanded((v) => !v)}
                className="w-full border-t border-line py-2.5 text-center text-xs text-muted transition-colors hover:bg-sunken hover:text-ink-soft"
              >
                {attentionExpanded ? 'Minder tonen' : `+ ${priorities.length - 3} meer, minder dringend`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── hero: whatever's actually most pressing today earns the one giant-
          number slot — overdue money first, a calm-day recovery score
          otherwise. Both candidates stay swipeable rather than the loser
          disappearing entirely, so "am I okay" is always a swipe away even
          when money is on fire. Vitals detail (steps/sleep/energy) always
          lives in "Lichaam & gewoontes" below either way. ────────────────── */}
      {heroSlides.length > 0 && (
        <div className="flex flex-col gap-2">
          <HeroCarousel slides={heroSlides} />
          <p className="px-1 text-[11px] leading-relaxed text-faint">{heroFooter}</p>
        </div>
      )}

      {/* ── vandaag: every scheduled block today, stacked, soonest-open first —
          a block whose end time has passed auto-flips to "gemist" and sinks
          to the bottom alongside done ones instead of sitting stuck at the
          top forever reading "nu bezig". ───────────────────────────────── */}
      {todaysBlocks.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Vandaag</p>
            <span className="text-xs text-muted tabular-nums">
              {todaysBlocks.filter((b) => b.status === 'done').length}/{todaysBlocks.length} klaar
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {todaysBlocks.map((b) => {
              const status = effectiveBlockStatus(b.status, b.end, nowMin)
              const urgency = status === 'missed' ? { tone: 'neutral' as Tone, label: 'gemist' } : blockUrgency(b.start)
              return (
                <AgendaCard
                  key={b.id}
                  domain={b.domain}
                  title={b.title}
                  start={b.start}
                  status={status}
                  tone={urgency.tone}
                  urgencyLabel={urgency.label}
                  isCall={isCallBlock(b.title)}
                  onComplete={status !== 'done' ? () => completeBlock(b.id) : undefined}
                  onSkip={status === 'planned' || status === 'missed' ? () => skipBlock(b.id) : undefined}
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

      {/* ── voorgesteld voor vandaag: fresh, data-driven block proposals for the
          rest of the day — never the same fixed set, since every candidate is
          conditional on something actually being true right now ──────────── */}
      {suggestedBlocks.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted px-1">Voorgesteld voor vandaag</p>
          <div className="flex flex-col gap-2">
            {suggestedBlocks.map((s) => (
              <SuggestedBlockCard
                key={s.id}
                emoji={s.emoji}
                title={s.title}
                start={s.start}
                domain={s.domain}
                rationale={s.rationale}
                onAdd={() => addSuggestedBlock({ title: s.title, domain: s.domain, start: s.start, end: s.end, rationale: s.rationale })}
                onDismiss={() => setDismissedSuggestions((prev) => (prev.includes(s.id) ? prev : [...prev, s.id]))}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── lichaam & gewoontes: the daily-maintenance rings and habit chips
          together — always visible regardless of what's in the hero above ── */}
      {(today || habits.length > 0) && (
        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted px-1">Lichaam &amp; gewoontes</p>
          {today && (
            <div className="card p-4">
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setMetricDialog('steps')}
                  className="flex flex-col items-center gap-2 rounded-2xl py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Ring value={stepsPct} size={64} color="stroke-forest-hi" label={`${stepsLabel}k`} />
                  <span className="text-xs text-muted">stappen</span>
                </button>
                <button
                  onClick={() => setMetricDialog('sleep')}
                  className="flex flex-col items-center gap-2 rounded-2xl py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Ring value={Math.min(1, today.sleepHours / 8)} size={64} color="stroke-forest-hi" label={`${today.sleepHours}u`} />
                  <span className="text-xs text-muted">slaap</span>
                </button>
                <button
                  onClick={() => (todaysCheckin ? setMetricDialog('energy') : setCheckinOpen(true))}
                  className="flex flex-col items-center gap-2 rounded-2xl py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {todaysCheckin ? (
                    <Ring value={todaysCheckin.energy / 5} size={64} color="stroke-forest-hi" label={`${todaysCheckin.energy}/5`} />
                  ) : (
                    <Ring value={0} size={64} color="stroke-forest-hi" label="–" sub="loggen" />
                  )}
                  <span className="text-xs text-muted">energie</span>
                </button>
              </div>
            </div>
          )}
          {habits.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs text-faint">gewoontes</span>
                <span className="text-xs text-muted tabular-nums">{doneHabits}/{habits.length}</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
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
                    {h.streak > 0 ? (
                      <span className={`text-[10px] font-medium ${h.doneToday ? 'text-buurtkaart-deep' : 'text-faint'}`}>{h.streak}🔥</span>
                    ) : (
                      <CheckCircle2 className={`h-4 w-4 ${h.doneToday ? '' : 'text-faint'}`} />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!today && !habits.length && (
            <SetupHint icon={Activity} title="Nog geen gezondheidsdata" cta="Naar Gezondheid" onCta={() => onNav('vitals')}>
              Koppel je slaap/stappen-databron of stel je eerste gewoonte in.
            </SetupHint>
          )}
        </div>
      )}

      {/* ── geld in één oogopslag: saldo, wat er nu al te laat is, wat er
          eraan komt, en het abonnementen-totaal — één kaart in plaats van
          vijf losse tegels ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Geld in één oogopslag</p>
          <button className="text-xs text-muted hover:text-ink flex items-center gap-1" onClick={() => onNav('money')}>
            alles <ArrowRight className="h-3 w-3" />
          </button>
        </div>
        <div className="card p-4">
          <div className="flex items-end justify-between gap-3 mb-3">
            <button onClick={() => setMetricDialog('saldo')} className="text-left outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
              <span className="flex items-center gap-1.5 text-[11px] text-faint mb-1">
                <Wallet className="h-3.5 w-3.5" /> Saldo
              </span>
              <span className="text-2xl font-medium tabular-nums text-ink">{transactions.length ? eur(balance) : '–'}</span>
            </button>
            {transactions.length >= 2 && <Sparkline values={balanceTrend} className="text-forest-hi" width={96} height={32} />}
          </div>
          {(overdueOutgoing.length > 0 || upcomingPayments.length > 0) && (
            <div className="border-t border-line divide-y divide-line">
              {overdueOutgoing.length > 0 && (
                <button onClick={() => onNav('money')} className="w-full flex items-center justify-between py-2.5 text-left">
                  <span className="flex items-center gap-2 text-sm text-cross-deep">
                    <span className="h-1.5 w-1.5 rounded-full bg-cross shrink-0" />
                    {overdueOutgoing[0].payee} — te laat
                  </span>
                  <span className="text-sm font-medium tabular-nums text-cross-deep">{eur(overdueOutgoingTotal)}</span>
                </button>
              )}
              {upcomingPayments.map((p) => {
                const due = dueLabel(p.due, { none: '–' })
                return (
                  <div key={p.id} className="flex items-center justify-between py-2.5">
                    <span className="text-sm text-ink-soft truncate pr-2">
                      {p.payee} <span className="text-faint">· {due.label}</span>
                    </span>
                    <span className={`text-sm font-medium tabular-nums shrink-0 ${p.direction === 'incoming' ? 'text-buurtkaart-deep' : 'text-ink'}`}>
                      {p.direction === 'incoming' ? '+' : ''}{eur(p.amount)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
          {activeSubs.length > 0 && (
            <p className="mt-3 text-[11px] text-faint">
              {activeSubs.length} abonnement{activeSubs.length > 1 ? 'en' : ''} actief · {eur(subsMonthlyTotal)}/maand
            </p>
          )}
        </div>
      </div>

      {/* ── noordster: segmented progress + fraction, not an abstract percentage,
          kept prominent so this screen isn't purely reactive firefighting ─── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Noordster</p>
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

      {/* ── reflectie — levensbalans: one computed score per domain, closing
          the screen on perspective rather than on a pile of open tasks ───── */}
      {radarData.length >= 3 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted">Reflectie — levensbalans</span>
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
          {weakestDomain && (
            <p className="text-xs text-muted px-1">
              <b className="font-medium text-personal-deep">{weakestDomain.domain}</b> is deze week de zwakste plek ({weakestDomain.score}/100) —{' '}
              {weakestDetail[weakestDomain.domain]}.
            </p>
          )}
        </div>
      )}

      {/* ── werkpuls: projecten, mail en klant-opvolging condensed to counts —
          detail is a tap away in Projecten/Inbox/CRM, not duplicated here ─── */}
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted px-1">Werkpuls</p>
        <div className="grid grid-cols-3 gap-2.5">
          <MetricTile
            icon={FolderKanban}
            value={activeProjects.length}
            label="projecten"
            footer={activeProjects.length ? eur(activeProjectsValue) : undefined}
            onClick={() => onNav('projects')}
          />
          <MetricTile
            icon={Mail}
            value={unreadImportant.length || '0'}
            label="mail"
            onClick={() => onNav('inbox')}
            footer={syncInfo.gmail ? humanizeAge(syncInfo.gmail.lastAt) : undefined}
          />
          <MetricTile icon={Users} value={clientsNeedingFollowUp.length || '0'} label="opvolgen" onClick={() => onNav('crm')} />
        </div>
      </div>

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
          or the greeting's check-in prompt before today's check-in exists. */}
      <Dialog open={checkinOpen} onOpenChange={setCheckinOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Hoe voel je je vandaag?</DialogTitle>
          </DialogHeader>
          <CheckinCard compact onSaved={() => setTimeout(() => setCheckinOpen(false), 900)} />
        </DialogContent>
      </Dialog>

      {/* first-run: nothing connected anywhere yet */}
      {!threads.length && !projects.length && !habits.length && !transactions.length && (
        <SetupHint icon={CheckSquare} title="Verbind je data">
          Zodra je databronnen leven, vult dit scherm zich vanzelf met je dag.
        </SetupHint>
      )}
    </div>
  )
}
