import { useStore } from '../store'
import { TODAY, DOMAIN_META, fmtDate, daysBetween } from '../domains'
import { DomainChip, SectionTitle, Empty, Ring } from '../components/ui'
import {
  Bell,
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
} from 'lucide-react'

const eur = (n: number) =>
  `${n < 0 ? '-' : ''}€${Math.abs(n).toLocaleString('nl-NL', { maximumFractionDigits: 0 })}`

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
  const nextBlock = blocks.filter((b) => b.status === 'planned')[0]
  if (!today) return (
    <div className="flex flex-col items-center justify-center h-64 gap-2 text-faint">
      <p className="text-sm font-medium text-muted">Nog geen data</p>
      <p className="text-xs text-center max-w-xs">
        Gezondheidsdata verschijnt zodra je datapipelines gesynchroniseerd zijn.
      </p>
    </div>
  )

  const openThreads = threads
    .filter((t) => t.status === 'open')
    .sort((a, b) => (a.due ? daysBetween(TODAY, a.due) : 999) - (b.due ? daysBetween(TODAY, b.due) : 999))

  const activeProjects = projects
    .filter((p) => p.status === 'active' || p.status === 'review' || p.status === 'blocked')
    .sort((a, b) => (a.deadline ? daysBetween(TODAY, a.deadline) : 999) - (b.deadline ? daysBetween(TODAY, b.deadline) : 999))

  const importantMail = emails.filter((e) => e.important).slice(0, 3)
  const unreadCount = emails.filter((e) => e.unread).length

  // money
  const month = TODAY.slice(0, 7)
  const monthTx = transactions.filter((t) => t.date.slice(0, 7) === month)
  const earned = monthTx.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0)
  const spent = monthTx.filter((t) => t.amount < 0).reduce((a, t) => a + t.amount, 0)
  const balance = 2840 + earned + spent

  // outstanding payments
  const openPayments = payments
    .filter((p) => p.status === 'open')
    .sort((a, b) => (a.due ? daysBetween(TODAY, a.due) : 999) - (b.due ? daysBetween(TODAY, b.due) : 999))
  const toReceive = openPayments.filter((p) => p.direction === 'incoming').reduce((a, p) => a + p.amount, 0)
  const toPay = openPayments.filter((p) => p.direction === 'outgoing').reduce((a, p) => a + p.amount, 0)

  const revenueGoal = goals.find((g) => g.id === 'g1')
  const goalPct = revenueGoal ? revenueGoal.current / revenueGoal.target : 0
  const goalDays = revenueGoal ? daysBetween(TODAY, revenueGoal.deadline) : 0
  const nextMilestone = milestones.find((m) => !m.done)

  const hour = 9
  const greeting = hour < 12 ? 'Goedemorgen' : hour < 18 ? 'Goedemiddag' : 'Goedenavond'

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="animate-fade-up">
        <div className="text-sm text-muted">{fmtDate(TODAY)} · Geldrop</div>
        <h1 className="text-2xl font-semibold mt-1">{greeting}, Rick.</h1>
        <p className="text-muted text-sm mt-1">
          {openThreads.length} open loops · {activeProjects.length} actieve projecten · {unreadCount} nieuwe mails ·{' '}
          {habits.filter((h) => h.doneToday).length}/{habits.length} gewoonten
        </p>
      </div>

      {/* nudge */}
      <div className="card p-4 border-cross/40 bg-cross/5 animate-fade-up" style={{ animationDelay: '40ms' }}>
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-cross/15 p-2 animate-pulse-ring">
            <Bell className="h-4 w-4 text-cross" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-cross font-semibold">Nudge van vandaag</div>
            <p className="text-sm text-ink mt-1">{nudge.text}</p>
          </div>
        </div>
      </div>

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
          ) : (
            <Empty>Niks meer gepland vandaag. Open Day Builder.</Empty>
          )}
        </div>

        {/* vitals */}
        <button
          className="card p-4 text-left hover:border-line transition-colors"
          onClick={() => onNav('vitals')}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted font-semibold">Vitaal vandaag</span>
            <span className="text-[11px] text-faint">{today.restingHR} bpm rust</span>
          </div>
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
          {revenueGoal && (
            <>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-semibold">{eur(revenueGoal.current)}</span>
                <span className="text-sm text-muted">van {eur(revenueGoal.target)}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-line overflow-hidden mt-2">
                <div className="h-full rounded-full bg-prjct transition-all duration-700" style={{ width: `${goalPct * 100}%` }} />
              </div>
              <p className="text-xs text-faint mt-1.5">
                {Math.round(goalPct * 100)}% · nog {goalDays} dagen tot {fmtDate(revenueGoal.deadline)}
              </p>
            </>
          )}
          {nextMilestone && (
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
                const dd = p.due ? daysBetween(TODAY, p.due) : null
                const overdue = dd !== null && dd < 0
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
                    <span className={`text-[11px] shrink-0 w-16 text-right ${overdue ? 'text-cross font-medium' : 'text-faint'}`}>
                      {p.due ? (overdue ? `${-dd!}d te laat` : fmtDate(p.due)) : '–'}
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
          <div className="space-y-2">
            {activeProjects.slice(0, 4).map((p) => {
              const dd = p.deadline ? daysBetween(TODAY, p.deadline) : null
              const overdue = dd !== null && dd < 0
              return (
                <div key={p.id} className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${DOMAIN_META[p.domain].dot}`} />
                  <span className="text-sm text-ink truncate flex-1">
                    {p.name} <span className="text-faint">· {p.client}</span>
                  </span>
                  {p.status === 'blocked' && <span className="chip bg-cross/15 text-cross !py-0">geblokkeerd</span>}
                  <span className={`text-[11px] shrink-0 ${overdue ? 'text-cross' : 'text-faint'}`}>
                    {p.deadline ? (overdue ? `${-dd!}d te laat` : fmtDate(p.deadline)) : '–'}
                  </span>
                </div>
              )
            })}
          </div>
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
                const dd = t.due ? daysBetween(TODAY, t.due) : null
                const overdue = dd !== null && dd < 0
                return (
                  <div key={t.id} className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${DOMAIN_META[t.domain].dot}`} />
                    <span className="text-sm text-ink truncate flex-1">{t.title}</span>
                    <span className={`text-[11px] shrink-0 ${overdue ? 'text-cross' : 'text-faint'}`}>
                      {t.due ? (overdue ? `${-dd!}d te laat` : fmtDate(t.due)) : '–'}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <Empty>Alle loops gesloten. 🎉</Empty>
          )}
        </div>

        {/* Habits */}
        <div className="card p-4 animate-fade-up" style={{ animationDelay: '220ms' }}>
          <div className="flex items-center gap-2 text-sm font-semibold mb-3">
            <Flame className="h-4 w-4 text-personal" /> Gewoonten
          </div>
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
        </div>
      </div>
    </div>
  )
}
