import { useStore } from '../store'
import { TODAY, DOMAIN_META, fmtDate, daysBetween } from '../domains'
import { dueLabel } from '../lib/dates'
import { OPENING_BALANCE } from '../mockData'
import { DomainChip, Empty, Ring, SetupHint } from '../components/ui'
import { useWeather } from '../hooks/useWeather'
import LocationWeather from '../components/LocationWeather'
import NudgeCard, { type DashNudge, type NudgeTone } from '../components/NudgeCard'
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
  ArrowDownLeft,
  ArrowUpRight,
  Activity,
  CalendarRange,
  Inbox as InboxIcon,
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

export default function Dashboard({ onNav }: { onNav: (v: string) => void }) {
  const {
    threads,
    blocks,
    habits,
    nudge,
    healthDays,
    projects,
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
  } = useStore()

  const today = healthDays.find((d) => d.date === TODAY) ?? healthDays[healthDays.length - 1]
  const todayIsLive = !!today && today.date === TODAY
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
  const month = TODAY.slice(0, 7)
  const monthTx = transactions.filter((t) => t.date.slice(0, 7) === month)
  const earned = monthTx.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0)
  const spent = monthTx.filter((t) => t.amount < 0).reduce((a, t) => a + t.amount, 0)
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

  // Live location + temperature (single geolocation request, shared with the card).
  const weather = useWeather()
  const locationLabel = weather.place ?? 'Geldrop'

  // Nudge: a Reflect pass writes a rich cross-domain nudge. Until then (e.g. fresh
  // live data, before any nightly reflect), derive the single most pressing nudge
  // from the live data so the card is never blank. Either way we hand NudgeCard a
  // structured nudge (tone + domain + source + action), not a bare string.
  const overduePay = openPayments.filter((p) => p.due && daysBetween(TODAY, p.due) < 0)
  const overdueProjects = activeProjects.filter((p) => p.deadline && daysBetween(TODAY, p.deadline) < 0)
  const habitsLeft = habits.filter((h) => !h.doneToday)
  const unreadImportant = importantMail.filter((e) => e.unread)

  const dashNudge: DashNudge | null = (() => {
    // Prefer a Reflect-authored nudge when one is present.
    const authored = nudge.text?.trim()
    if (authored) {
      const tone: NudgeTone =
        nudge.id === 'nudge-overdue' || nudge.id === 'nudge-blocked'
          ? 'urgent'
          : nudge.id === 'nudge-calm'
            ? 'calm'
            : 'attention'
      const ctaMap: Record<string, { label: string; view: string } | undefined> = {
        'nudge-overdue': { label: 'Naar Geheugen', view: 'memory' },
        'nudge-blocked': { label: 'Naar Projecten', view: 'projects' },
        'nudge-corr': { label: 'Naar Reflectie', view: 'reflect' },
        'nudge-next': { label: 'Naar Geheugen', view: 'memory' },
        'nudge-calm': { label: 'Naar Noordster', view: 'northstar' },
      }
      return {
        text: authored,
        domain: nudge.domain,
        reason: nudge.reason || 'gekozen uit je geheugen',
        tone,
        cta: ctaMap[nudge.id],
      }
    }
    // Otherwise derive the single most pressing nudge from live data.
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
    if (todayIsLive && today && today.sleepHours > 0 && today.sleepHours < 6.5)
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

  // header summary — only show the stat line once there's something to count,
  // so a freshly-connected account doesn't read "0 · 0 · 0 · 0/0".
  const summaryParts: string[] = []
  if (threads.length) summaryParts.push(`${openThreads.length} open loops`)
  if (projects.length) summaryParts.push(`${activeProjects.length} actieve projecten`)
  if (emails.length) summaryParts.push(`${unreadCount} nieuwe mails`)
  if (habits.length) summaryParts.push(`${habits.filter((h) => h.doneToday).length}/${habits.length} gewoonten`)

  return (
    <div className="space-y-6">
      {/* header: greeting + live location/weather */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch animate-fade-up">
        <div className="lg:col-span-2 flex flex-col justify-center">
          <div className="text-sm text-muted">
            {fmtDate(TODAY)} · {locationLabel}
          </div>
          <h1 className="text-2xl font-semibold mt-1">{greeting}, Rick.</h1>
          <p className="text-muted text-sm mt-1">
            {summaryParts.length ? summaryParts.join(' · ') : 'Verbind je data hieronder om je dag in één oogopslag te zien.'}
          </p>
        </div>
        <LocationWeather weather={weather} onRefresh={weather.refresh} />
      </div>

      {/* nudge */}
      {dashNudge && <NudgeCard nudge={dashNudge} onNav={onNav} />}

      {/* hero row: right-now + vitals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-fade-up" style={{ animationDelay: '80ms' }}>
        {/* right now */}
        <div className="lg:col-span-2 card p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted font-semibold">Nu doen</span>
            {nextBlock && (
              <span className="text-xs text-muted flex items-center gap-1">
                <Clock className="h-3 w-3" /> {nextBlock.start}–{nextBlock.end}
              </span>
            )}
          </div>
          {nextBlock ? (
            <>
              <div className="mt-2 flex items-center gap-2">
                <DomainChip domain={nextBlock.domain} small />
              </div>
              <h3 className="text-lg font-medium mt-1.5">{nextBlock.title}</h3>
              <p className="text-xs text-faint mt-1">{nextBlock.rationale}</p>
              <div className="flex gap-2 mt-3">
                <button className="btn-primary" onClick={() => completeBlock(nextBlock.id)}>
                  <CheckCircle2 className="h-4 w-4" /> Klaar
                </button>
                <button className="btn-ghost" onClick={() => skipBlock(nextBlock.id)}>
                  <SkipForward className="h-4 w-4" /> Overslaan
                </button>
                <button className="btn-ghost ml-auto" onClick={() => onNav('daybuilder')}>
                  Dagplan <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </>
          ) : blocks.length ? (
            <Empty>Niks meer gepland vandaag. 🎉</Empty>
          ) : (
            <SetupHint
              icon={CalendarRange}
              title="Nog geen dagplan"
              cta="Bouw je dag"
              onCta={() => onNav('daybuilder')}
            >
              Laat de Dagplanner je dag in blokken zetten op basis van je agenda en energie — sneller dan zelf plannen.
            </SetupHint>
          )}
        </div>

        {/* vitals */}
        <button
          className="card p-4 text-left hover:border-line transition-colors"
          onClick={() => onNav('vitals')}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted font-semibold">Vitaal vandaag</span>
            {today && <span className="text-[11px] text-faint">{today.restingHR} bpm rust</span>}
          </div>
          {today ? (
            <>
              <div className="flex items-center justify-around mt-3">
                <div className="flex flex-col items-center gap-1">
                  <Ring
                    value={today.steps / today.stepGoal}
                    color="stroke-buurtkaart"
                    label={(today.steps / 1000).toFixed(1) + 'k'}
                    sub="stappen"
                  />
                  <Footprints className="h-3.5 w-3.5 text-buurtkaart" />
                </div>
                <div className="flex flex-col items-center gap-1">
                  <Ring
                    value={today.sleepHours / 8}
                    color="stroke-parkingyou"
                    label={today.sleepHours + 'u'}
                    sub="slaap"
                  />
                  <Moon className="h-3.5 w-3.5 text-parkingyou" />
                </div>
                <div className="flex flex-col items-center gap-1">
                  <Ring value={today.energy / 5} color="stroke-personal" label={today.energy + '/5'} sub="energie" />
                  <Zap className="h-3.5 w-3.5 text-personal" />
                </div>
              </div>
              {!todayIsLive && (
                <div className="text-[10px] text-faint text-center mt-2">laatste meting · {fmtDate(today.date)}</div>
              )}
            </>
          ) : (
            <SetupHint icon={Activity} title="Geen gezondheidsdata">
              Koppel Health Connect / Apple Health via het Apps Script — daarna stromen stappen, slaap en hartslag hier vanzelf binnen.
            </SetupHint>
          )}
        </button>
      </div>

      {/* main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
              Eén meetbaar doel met deadline (bv. €10k omzet) geeft alle andere schermen richting. Begint het snelst in Noordster.
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

        {/* Money */}
        <button
          className="card p-4 text-left animate-fade-up hover:border-line transition-colors"
          style={{ animationDelay: '140ms' }}
          onClick={() => onNav('money')}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Wallet className="h-4 w-4 text-buurtkaart" /> Geld
            </span>
            <span className="text-xs text-faint">ABN AMRO · deze maand</span>
          </div>
          {transactions.length ? (
            <>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-semibold">{eur(balance)}</span>
                <span className="text-sm text-muted">saldo</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div className="rounded-xl bg-buurtkaart/10 p-2">
                  <div className="text-[11px] text-muted">in</div>
                  <div className="text-sm font-medium text-buurtkaart">{eur(earned)}</div>
                </div>
                <div className="rounded-xl bg-cross/10 p-2">
                  <div className="text-[11px] text-muted">uit</div>
                  <div className="text-sm font-medium text-cross">{eur(spent)}</div>
                </div>
              </div>
            </>
          ) : (
            <SetupHint icon={Wallet} title="Nog geen transacties">
              Open Geld en importeer je ABN AMRO CSV (of klik “Demo-import”) — saldo en uitgaven per categorie verschijnen meteen.
            </SetupHint>
          )}
        </button>

        {/* Outstanding payments */}
        <div className="card p-4 animate-fade-up" style={{ animationDelay: '150ms' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Receipt className="h-4 w-4 text-personal" /> Openstaande betalingen
            </span>
            <button className="text-xs text-muted hover:text-ink flex items-center gap-1" onClick={() => onNav('money')}>
              in Geld <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="rounded-xl bg-buurtkaart/10 p-2">
              <div className="text-[11px] text-muted flex items-center gap-1">
                <ArrowDownLeft className="h-3 w-3" /> te ontvangen
              </div>
              <div className="text-sm font-semibold text-buurtkaart-deep">{eur(toReceive)}</div>
            </div>
            <div className="rounded-xl bg-cross/10 p-2">
              <div className="text-[11px] text-muted flex items-center gap-1">
                <ArrowUpRight className="h-3 w-3" /> te betalen
              </div>
              <div className="text-sm font-semibold text-cross-deep">{eur(toPay)}</div>
            </div>
          </div>
          {openPayments.length ? (
            <div className="space-y-1.5">
              {openPayments.slice(0, 3).map((p) => {
                const due = dueLabel(p.due, { none: '–' })
                return (
                  <div key={p.id} className="flex items-center gap-2">
                    <span
                      className={`shrink-0 ${p.direction === 'incoming' ? 'text-buurtkaart' : 'text-cross'}`}
                      title={p.direction === 'incoming' ? 'te ontvangen' : 'te betalen'}
                    >
                      {p.direction === 'incoming' ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                    </span>
                    <span className="text-sm text-ink truncate flex-1">{p.payee}</span>
                    <span className="text-sm tabular-nums shrink-0">{eur(p.amount)}</span>
                    <span className={`text-[11px] shrink-0 w-16 text-right ${due.overdue ? 'text-cross font-medium' : 'text-faint'}`}>
                      {due.label}
                    </span>
                    <button
                      className="text-faint hover:text-buurtkaart shrink-0"
                      title="Markeer als voldaan"
                      onClick={() => markPaymentPaid(p.id)}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <Empty>Niks openstaand. 🎉</Empty>
          )}
        </div>

        {/* Projects */}
        <div className="card p-4 animate-fade-up" style={{ animationDelay: '160ms' }}>
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
              Projecten synchroniseren automatisch uit Notion. Koppel je Notion-database, dan staan deadlines en status hier vanzelf.
            </SetupHint>
          )}
        </div>

        {/* Inbox */}
        <div className="card p-4 animate-fade-up" style={{ animationDelay: '180ms' }}>
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
              Koppel Gmail via het Apps Script — belangrijke mails worden automatisch geclassificeerd en hier gesurfaced.
            </SetupHint>
          )}
        </div>

        {/* Open loops */}
        <div className="card p-4 animate-fade-up" style={{ animationDelay: '200ms' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold">Open loops</span>
            <button className="text-xs text-muted hover:text-ink flex items-center gap-1" onClick={() => onNav('memory')}>
              in Geheugen <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          {openThreads.length ? (
            <div className="space-y-2">
              {openThreads.slice(0, 4).map((t) => {
                const due = dueLabel(t.due, { none: '–' })
                return (
                  <div key={t.id} className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${DOMAIN_META[t.domain].dot}`} />
                    <span className="text-sm text-ink truncate flex-1">{t.title}</span>
                    <span className={`text-[11px] shrink-0 ${due.overdue ? 'text-cross' : 'text-faint'}`}>
                      {due.label}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : threads.length ? (
            <Empty>Alle loops gesloten. 🎉</Empty>
          ) : (
            <SetupHint
              icon={InboxIcon}
              title="Geen open loops"
              cta="Leg iets vast"
              onCta={() => onNav('capture')}
            >
              Loops ontstaan vanzelf: leg een taak of gedachte vast in Vastleggen en HEYRA opent er een loop voor.
            </SetupHint>
          )}
        </div>

        {/* Habits */}
        <div className="card p-4 animate-fade-up" style={{ animationDelay: '220ms' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Flame className="h-4 w-4 text-personal" /> Gewoonten
            </span>
            {habits.length > 0 && (
              <button className="text-xs text-muted hover:text-ink flex items-center gap-1" onClick={() => onNav('habits')}>
                {habits.filter((h) => h.doneToday).length}/{habits.length} <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
          {habits.length ? (
            <div className="space-y-2">
              {habits.map((h) => (
                <button
                  key={h.id}
                  onClick={() => tickHabit(h.id)}
                  className={`w-full p-2.5 rounded-xl border flex items-center justify-between transition-colors ${
                    h.doneToday ? 'border-buurtkaart/50 bg-buurtkaart/5' : 'border-line hover:border-line'
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm">
                    <span className="text-base">{h.emoji}</span> {h.name}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-muted flex items-center gap-0.5">
                      <Flame className="h-3 w-3 text-personal" /> {h.streak}
                    </span>
                    <CheckCircle2 className={`h-5 w-5 ${h.doneToday ? 'text-buurtkaart' : 'text-faint'}`} />
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <SetupHint
              icon={Flame}
              title="Nog geen gewoonten"
              cta="Voeg een gewoonte toe"
              onCta={() => onNav('habits')}
            >
              Begin met één gewoonte (bv. 8.000 stappen). Streaks en afvinken verschijnen daarna direct hier.
            </SetupHint>
          )}
        </div>
      </div>
    </div>
  )
}
