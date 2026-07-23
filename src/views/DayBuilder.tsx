import { useMemo } from 'react'
import { useStore } from '../store'
import { DOMAIN_META, today } from '../domains'
import { DomainChip, Empty } from '../components/ui'
import { weekDates, PEAK_START, PEAK_END } from '../heyra/planner'
import { googleCalendarUrlForBlock } from '../lib/gcal'
import type { PlanBlock, PlanBlockKind } from '../types'
import {
  CalendarRange,
  CalendarClock,
  Zap,
  Repeat,
  Coffee,
  Utensils,
  Inbox,
  Moon,
  User,
  Lock,
  LockKeyhole,
  CalendarPlus,
  X,
  Sparkles,
  Sun,
  RefreshCw,
} from 'lucide-react'

const KIND_META: Record<PlanBlockKind, { label: string; icon: typeof Zap }> = {
  event: { label: 'afspraak', icon: CalendarClock },
  focus: { label: 'diep werk', icon: Zap },
  routine: { label: 'routine', icon: Repeat },
  break: { label: 'pauze', icon: Coffee },
  meal: { label: 'eten', icon: Utensils },
  admin: { label: 'admin', icon: Inbox },
  'wind-down': { label: 'wind-down', icon: Moon },
  personal: { label: 'persoonlijk', icon: User },
}

function dayHeading(date: string): { weekday: string; rest: string } {
  const d = new Date(date + 'T00:00:00')
  const weekday = d.toLocaleDateString('nl-NL', { weekday: 'long', timeZone: 'Europe/Amsterdam' })
  const rest = d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', timeZone: 'Europe/Amsterdam' })
  return { weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1), rest }
}

function BlockRow({ b }: { b: PlanBlock }) {
  const { lockPlanBlock, dismissPlanBlock } = useStore()
  const meta = DOMAIN_META[b.domain]
  const kind = KIND_META[b.kind]
  const Icon = kind.icon
  const inPeak = b.start >= PEAK_START && b.start < PEAK_END
  const isCalendar = b.source === 'calendar'
  const isLocked = b.locked && !isCalendar // a proposal Rick committed
  const isProposal = !isCalendar && !b.locked

  return (
    <div
      className={`card p-3 flex items-stretch gap-3 transition-all ${
        isCalendar ? 'bg-sunken/60' : isLocked ? 'border-buurtkaart/40' : inPeak ? 'border-personal/40' : ''
      }`}
    >
      {/* time rail */}
      <div className="flex flex-col items-center justify-center w-14 shrink-0">
        <span className="text-sm font-medium tabular-nums">{b.start}</span>
        <span className="text-[10px] text-faint tabular-nums">{b.end}</span>
      </div>
      <div className={`w-1 rounded-full ${meta.dot}`} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="chip bg-sunken text-muted flex items-center gap-1">
            <Icon className="h-3 w-3" /> {kind.label}
          </span>
          <DomainChip domain={b.domain} small />
          {inPeak && b.kind === 'focus' && <span className="chip bg-personal/15 text-personal-deep">focuspiek</span>}
          {isCalendar && (
            <span className="chip bg-sunken text-muted flex items-center gap-1">
              <Lock className="h-3 w-3" /> agenda
            </span>
          )}
          {isLocked && (
            <span className="chip bg-buurtkaart/15 text-buurtkaart-deep flex items-center gap-1">
              <Lock className="h-3 w-3" /> vergrendeld
            </span>
          )}
          {isProposal && (
            <span className="chip bg-cross/15 text-cross-deep flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> voorstel
            </span>
          )}
        </div>
        <p className="text-sm mt-1 text-ink">{b.title}</p>
        {b.rationale && <p className="text-[11px] text-faint mt-0.5">{b.rationale}</p>}

        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {isProposal && (
            <>
              <button className="btn-ghost !py-1 !px-2.5 text-xs" onClick={() => lockPlanBlock(b.id)}>
                <LockKeyhole className="h-3.5 w-3.5" /> Vergrendel
              </button>
              <button className="btn-ghost !py-1 !px-2.5 text-xs" onClick={() => dismissPlanBlock(b.id)}>
                <X className="h-3.5 w-3.5" /> Negeer
              </button>
            </>
          )}
          <a
            className="btn-ghost !py-1 !px-2.5 text-xs"
            href={googleCalendarUrlForBlock(b)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <CalendarPlus className="h-3.5 w-3.5" /> Google Agenda
          </a>
        </div>
      </div>
    </div>
  )
}

export default function DayBuilder() {
  const { weekPlan, weekPlanAt, planningWeek, generateWeekPlan, lastPlanError } = useStore()

  const dates = useMemo(() => weekDates(today()), [])
  const dateSet = useMemo(() => new Set(dates), [dates])

  // Only show blocks in the current week; group by day, sort by start.
  const byDate = useMemo(() => {
    const map = new Map<string, PlanBlock[]>()
    for (const d of dates) map.set(d, [])
    for (const b of weekPlan) {
      if (!dateSet.has(b.date)) continue
      map.get(b.date)!.push(b)
    }
    for (const list of map.values()) list.sort((a, b) => a.start.localeCompare(b.start))
    return map
  }, [weekPlan, dates, dateSet])

  const inWeek = weekPlan.filter((b) => dateSet.has(b.date))
  const events = inWeek.filter((b) => b.source === 'calendar').length
  const proposed = inWeek.filter((b) => b.source !== 'calendar' && !b.locked).length
  const locked = inWeek.filter((b) => b.source !== 'calendar' && b.locked).length
  const hasPlan = inWeek.length > 0

  return (
    <div className="flex flex-col gap-7 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sunken">
            <CalendarRange className="h-5 w-5 text-ink-soft" />
          </span>
          <h1 className="text-xl font-medium text-ink">Dagplanner</h1>
        </div>
        <button className="btn-primary" onClick={generateWeekPlan} disabled={planningWeek}>
          {planningWeek ? (
            <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
          ) : hasPlan ? (
            <RefreshCw className="h-4 w-4" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {planningWeek ? 'Plannen…' : hasPlan ? 'Herbereken' : 'Genereer plan'}
        </button>
      </div>

      {lastPlanError && !planningWeek && (
        <div className="card p-3 text-sm text-personal-deep bg-personal/10">{lastPlanError}</div>
      )}

      {/* learned-window banner */}
      <div className="card p-3 flex items-center gap-2 text-sm text-ink-soft">
        <Sun className="h-4 w-4 text-personal" />
        Aangeleerd hoog-energie venster:{' '}
        <b className="text-personal">
          {PEAK_START} – {PEAK_END}
        </b>
        . Diep werk wordt hier beschermd.
      </div>

      {hasPlan && (
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <span className="chip bg-buurtkaart/15 text-buurtkaart-deep">{events} afspraken</span>
          <span className="chip bg-cross/15 text-cross-deep">{proposed} voorgesteld</span>
          <span className="chip bg-personal/15 text-personal-deep">{locked} vergrendeld</span>
          {weekPlanAt && (
            <span className="text-faint">
              bijgewerkt{' '}
              {new Date(weekPlanAt).toLocaleTimeString('nl-NL', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Europe/Amsterdam',
              })}
            </span>
          )}
        </div>
      )}

      {!hasPlan ? (
        <Empty>
          {planningWeek
            ? 'HEYRA stelt je week samen…'
            : 'Nog geen plan. Tik op "Genereer plan" — HEYRA bouwt een dagindeling rond je agenda en routines.'}
        </Empty>
      ) : (
        <div className="space-y-6">
          {dates.map((date) => {
            const list = byDate.get(date) ?? []
            const { weekday, rest } = dayHeading(date)
            const isToday = date === today()
            return (
              <div key={date} className="space-y-2">
                <div className="flex items-baseline gap-2 sticky top-0 bg-canvas/80 backdrop-blur-sm py-1 z-10">
                  <h2 className="text-base font-semibold">{weekday}</h2>
                  <span className="text-xs text-faint">{rest}</span>
                  {isToday && <span className="chip bg-forest/15 text-forest">vandaag</span>}
                </div>
                {list.length ? (
                  list.map((b) => <BlockRow key={b.id} b={b} />)
                ) : (
                  <p className="text-[11px] text-faint italic pl-1">Geen blokken.</p>
                )}
              </div>
            )
          })}
        </div>
      )}

      <p className="text-[11px] text-faint">
        Vergrendelde blokken worden opgeslagen in je dagplan (day_blocks) en verschijnen bij "Vandaag". Via Google
        Agenda opent HEYRA een vooraf ingevulde afspraak — jij bevestigt.
      </p>
    </div>
  )
}
