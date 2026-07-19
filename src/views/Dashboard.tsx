import { useMemo } from 'react'
import { useStore } from '../store'
import { TODAY, DOMAIN_META, fmtDate, daysBetween } from '../domains'
import { dueLabel } from '../lib/dates'
import { OPENING_BALANCE } from '../mockData'
import { DomainChip, Empty, SetupHint } from '../components/ui'
import { useWeather, weatherMeta } from '../hooks/useWeather'
import NudgeCard, { storeNudgeToDash, type DashNudge } from '../components/NudgeCard'
import DopamineBar from '../components/DopamineBar'
import {
  CheckCircle2,
  SkipForward,
  Clock,
  Footprints,
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

/** Compact KPI tile — the dashboard's "cockpit" row. One glance, one tap through. */
function KpiTile({
  icon: Icon,
  iconClass,
  value,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  iconClass: string
  value: React.ReactNode
  label: string
  onClick?: () => void
}) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      onClick={onClick}
      className={`card p-2.5 text-left ${onClick ? 'hover:border-line transition-colors' : ''}`}
    >
      <Icon className={`h-3.5 w-3.5 ${iconClass}`} />
      <div className="text-base font-semibold mt-1 truncate leading-tight">{value}</div>
      <div className="text-[10px] text-faint truncate">{label}</div>
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

  const openThreads = threads
    .filter((t) => t.status === 'open')
    .sort((a, b) => (a.due ? daysBetween(TODAY, a.due) : 999) - (b.due ? daysBetween(TODAY, b.due) : 999))

  const activeProjects = projects
    .filter((p) => p.status === 'active' || p.status === 'review' || p.status === 'blocked')
    .sort((a, b) => (a.deadline ? daysBetween(TODAY, a.deadline) : 999) - (b.deadline ? daysBetween(TODAY, b.deadline) : 999))

  const importantMail = emails.filter((e) => e.important).slice(0, 3)
  const unreadCount = emails.filter((e) => e.unread).length

  // money — balance is computed identically to the Money screen (opening balance
  // + every known transaction) so the two screens never disagree.
  const balance = OPENING_BALANCE + transactions.reduce((a, t) => a + t.amount, 0)

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
  const unreadImportant = importantMail.filter((e) => e.unread)

  const dashNudge: DashNudge | null = (() => {
    if (nudge.text?.trim()) return storeNudgeToDash(nudge)
    if (overduePay.length)
      return {
        text: `Je hebt ${overduePay.length} betaling${overduePay.length > 1 ? 'en' : ''} over de vervaldatum (o.a. ${overduePay[0].payee}). Regel die eerst — ze blokkeren je hoofd.`,
        domain: 'buurtkaart',
        reason: 'oudste verlopen betaling',
        tone: 'urgent',
        cta: { label: 'Naar Geld', view: 'money' },
      }
    if (overdueProjects.length)
      return {
        text: `${overdueProjects[0].name} staat over de deadline. Plan vandaag één concreet blok om 'm los te trekken.`,
        domain: overdueProjects[0].domain,
        reason: 'project over de deadline',
        tone: 'urgent',
        cta: { label: 'Naar Projecten', view: 'projects' },
      }
    if (today && today.date === TODAY && today.sleepHours > 0 && today.sleepHours < 6.5)
      return {
        text: `Maar ${today.sleepHours}u geslapen. Houd vandaag je zwaarste denkwerk in de ochtend en plan niks na 22:30.`,
        domain: 'cross',
        reason: 'weinig slaap gemeten',
        tone: 'attention',
        cta: { label: 'Naar Gezondheid', view: 'vitals' },
      }
    if (unreadImportant.length)
      return {
        text: `${unreadImportant.length} belangrijke mail wacht op antwoord. Beantwoord 'm nu het nog klein is.`,
        domain: 'parkingyou',
        reason: 'belangrijke mail ongelezen',
        tone: 'attention',
        cta: { label: 'Naar Inbox', view: 'inbox' },
      }
    if (habitsLeft.length && habits.length)
      return {
        text: `Nog ${habitsLeft.length}/${habits.length} gewoonten open vandaag. Pak de makkelijkste eerst voor de momentum.`,
        domain: 'buurtkaart',
        reason: 'gewoonten nog open vandaag',
        tone: 'attention',
        cta: { label: 'Naar Gewoonten', view: 'habits' },
      }
    if (habits.length)
      return {
        text: 'Alle gewoonten staan, geen betaling te laat. Mooie dag — kies één ding dat je vooruit helpt.',
        domain: 'personal',
        reason: 'alles onder controle',
        tone: 'calm',
        cta: { label: 'Naar Noordster', view: 'northstar' },
      }
    return null
  })()

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

      {/* ── focus hero: the one thing to look at first ──────────────────────── */}
      <div className="card p-0 overflow-hidden animate-fade-up" style={{ animationDelay: '40ms' }}>
        {dashNudge && <NudgeCard nudge={dashNudge} onNav={onNav} embedded />}
        <div className={dashNudge ? 'border-t border-line p-3.5' : 'p-3.5'}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-muted font-semibold">Nu doen</span>
            {nextBlock && (
              <span className="text-[11px] text-muted flex items-center gap-1">
                <Clock className="h-3 w-3" /> {nextBlock.start}–{nextBlock.end}
              </span>
            )}
          </div>
          {nextBlock ? (
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <DomainChip domain={nextBlock.domain} small />
              <span className="text-sm font-medium">{nextBlock.title}</span>
              <div className="flex gap-1.5 ml-auto">
                <button className="btn-primary !py-1 !px-2.5 text-xs" onClick={() => completeBlock(nextBlock.id)}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Klaar
                </button>
                <button className="btn-ghost !py-1 !px-2.5 text-xs" onClick={() => skipBlock(nextBlock.id)}>
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 animate-fade-up" style={{ animationDelay: '60ms' }}>
        <button onClick={() => onNav('vitals')} className="card p-2.5 text-left hover:border-line transition-colors col-span-2 sm:col-span-1 lg:col-span-2">
          <Activity className="h-3.5 w-3.5 text-cross" />
          {today ? (
            <div className="flex items-center gap-3 mt-1 text-sm font-semibold tabular-nums">
              <span className="flex items-center gap-1"><Footprints className="h-3.5 w-3.5 text-buurtkaart" />{(today.steps / 1000).toFixed(1)}k</span>
              <span className="flex items-center gap-1"><Moon className="h-3.5 w-3.5 text-parkingyou" />{today.sleepHours}u</span>
              <span className="flex items-center gap-1"><Zap className="h-3.5 w-3.5 text-personal" />{today.energy}/5</span>
            </div>
          ) : (
            <div className="text-sm text-faint mt-1">geen data</div>
          )}
          <div className="text-[10px] text-faint truncate">vitaal vandaag</div>
        </button>

        <KpiTile
          icon={Wallet}
          iconClass="text-buurtkaart"
          value={transactions.length ? eur(balance) : '–'}
          label="saldo"
          onClick={() => onNav('money')}
        />
        <KpiTile
          icon={Receipt}
          iconClass="text-personal"
          value={openPayments.length ? `${eur(toReceive)} / ${eur(toPay)}` : 'niks open'}
          label="te ontv. / te betalen"
          onClick={() => onNav('money')}
        />
        <KpiTile
          icon={Mail}
          iconClass="text-parkingyou"
          value={unreadCount || '0'}
          label="ongelezen mail"
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
          icon={Flame}
          iconClass="text-personal"
          value={habits.length ? `${habits.filter((h) => h.doneToday).length}/${habits.length}` : '–'}
          label="gewoontes"
          onClick={() => onNav('habits')}
        />
      </div>

      {/* ── taken vandaag: project tasks due today, the actual to-do list ───── */}
      {assignedToday > 0 && (
        <div className="card p-3.5 animate-fade-up" style={{ animationDelay: '80ms' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-wider text-muted font-semibold">Vandaag afmaken</span>
            <span className="text-xs text-muted tabular-nums">{doneToday.length}/{assignedToday}</span>
          </div>
          <DopamineBar done={doneToday.length} total={assignedToday} compact />
          {focusTasks.length > 0 && (
            <div className="space-y-1.5 mt-2.5">
              {focusTasks.map((t) => {
                const p = projectById.get(t.projectId)
                const due = dueLabel(t.dueDate ?? null, { prefix: 'deadline ' })
                return (
                  <div key={t.id} className="flex items-center gap-2.5">
                    <button
                      onClick={() => toggleProjectTask(t.id, true)}
                      title="Afvinken"
                      className="shrink-0 h-4.5 w-4.5 rounded-md border border-line flex items-center justify-center text-transparent hover:border-forest hover:text-forest transition-colors"
                    >
                      <Check className="h-3 w-3" strokeWidth={2.5} />
                    </button>
                    <span className="text-sm text-ink truncate flex-1">{t.name}</span>
                    <span className="text-[11px] text-faint truncate shrink-0 max-w-[9rem]">{p?.name ?? 'Project'}</span>
                    <span className={`text-[11px] shrink-0 ${due.overdue ? 'text-cross font-medium' : 'text-faint'}`}>{due.label}</span>
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
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                h.doneToday ? 'border-buurtkaart/50 bg-buurtkaart/10 text-buurtkaart-deep' : 'border-line hover:border-line'
              }`}
            >
              <span>{h.emoji}</span> {h.name}
              <span className="text-[11px] text-faint flex items-center gap-0.5">
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
                <span className="text-2xl font-semibold">{eur(revenueGoal.current)}</span>
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
                    {p.status === 'blocked' && <span className="chip bg-cross/15 text-cross !py-0">geblokkeerd</span>}
                    <span className={`text-[11px] shrink-0 ${due.overdue ? 'text-cross' : 'text-faint'}`}>
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
                    <span className="text-[11px] text-faint truncate block">{e.snippet}</span>
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
