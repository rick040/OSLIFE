import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { DOMAIN_META, today } from '../domains'
import { Empty } from '../components/ui'
import { weekDates, PEAK_START, PEAK_END } from '../heyra/planner'
import { googleCalendarUrlForBlock } from '../lib/gcal'
import type { PlanBlock, PlanBlockKind, Domain } from '../types'
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
  ChevronLeft,
  ChevronRight,
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

/** Short weekday + day number for the strip's day chips ("Ma" / "26"). */
function dayChipLabel(date: string): { weekdayShort: string; dayNum: string } {
  const d = new Date(date + 'T00:00:00')
  const weekdayShort = d.toLocaleDateString('nl-NL', { weekday: 'short', timeZone: 'Europe/Amsterdam' }).replace('.', '')
  return { weekdayShort: weekdayShort.charAt(0).toUpperCase() + weekdayShort.slice(1), dayNum: String(d.getDate()) }
}

/**
 * Compact horizontal day-switcher — one day's full timeline is shown at a
 * time below it, with a small colored-dot cluster per chip summarizing which
 * domains that day touches, so you can spot a busy/empty day before tapping in.
 */
function WeekStrip({
  dates,
  selected,
  onSelect,
  byDate,
}: {
  dates: string[]
  selected: string
  onSelect: (date: string) => void
  byDate: Map<string, PlanBlock[]>
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
      {dates.map((date) => {
        const list = byDate.get(date) ?? []
        const isSelected = date === selected
        const isToday = date === today()
        const { weekdayShort, dayNum } = dayChipLabel(date)
        const domains = [...new Set(list.map((b) => b.domain))].slice(0, 4)
        return (
          <button
            key={date}
            onClick={() => onSelect(date)}
            aria-pressed={isSelected}
            className={`flex min-w-[52px] shrink-0 flex-col items-center gap-1.5 rounded-2xl px-3 py-2.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
              isSelected ? 'bg-ink text-canvas' : 'bg-sunken text-ink-soft hover:bg-line'
            }`}
          >
            <span className="text-[10px] uppercase tracking-wide opacity-70">{weekdayShort}</span>
            <span className={`text-base font-semibold leading-none ${!isSelected && isToday ? 'text-forest' : ''}`}>{dayNum}</span>
            <span className="flex h-1.5 items-center gap-0.5">
              {domains.length ? (
                domains.map((d) => <span key={d} className={`h-1.5 w-1.5 rounded-full ${DOMAIN_META[d as Domain].dot}`} />)
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-transparent" />
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Small icon-only action — button or link, same footprint either way. */
function IconAction({
  label,
  onClick,
  href,
  tone = 'neutral',
  children,
}: {
  label: string
  onClick?: () => void
  href?: string
  tone?: 'neutral' | 'primary'
  children: React.ReactNode
}) {
  const cls = `flex h-7 w-7 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-canvas ${
    tone === 'primary' ? 'bg-ink text-canvas hover:bg-ink/85' : 'bg-sunken text-ink-soft hover:bg-line'
  }`
  if (href) {
    return (
      <a className={cls} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>
        {children}
      </a>
    )
  }
  return (
    <button className={cls} onClick={onClick} aria-label={label}>
      {children}
    </button>
  )
}

/** One row of the connected timeline — a colored marker on the spine, the block's info, and compact actions. */
function TimelineRow({ b, isLast, peakStart, peakEnd }: { b: PlanBlock; isLast: boolean; peakStart: string; peakEnd: string }) {
  const { lockPlanBlock, dismissPlanBlock, movePlanBlock } = useStore()
  const meta = DOMAIN_META[b.domain]
  const kind = KIND_META[b.kind]
  const Icon = kind.icon
  const inPeak = b.start >= peakStart && b.start < peakEnd
  const isCalendar = b.source === 'calendar'
  const isLocked = b.locked && !isCalendar
  const isProposal = !isCalendar && !b.locked
  const committed = isCalendar || isLocked

  const statusLabel = isCalendar ? 'agenda' : isLocked ? 'vergrendeld' : 'voorstel'
  // Most-glanceable info first — if the line has to truncate, the end time
  // and status (still just a proposal? already committed?) survive; domain
  // and kind labels are secondary detail.
  const metaLine = [`tot ${b.end}`, statusLabel, inPeak && b.kind === 'focus' ? 'focuspiek' : null, meta.label, kind.label]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="flex gap-3">
      <div className="w-11 shrink-0 pt-1.5 text-right text-xs font-medium tabular-nums text-ink-soft">{b.start}</div>

      <div className="flex shrink-0 flex-col items-center">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            committed ? meta.soft : `${meta.color} border-2 border-dashed border-current bg-transparent`
          }`}
        >
          <Icon className="h-4 w-4" />
        </span>
        {!isLast && <span className="my-0.5 w-0.5 min-h-[16px] flex-1 bg-line" />}
      </div>

      <div className="min-w-0 flex-1 pb-5">
        <p className={`truncate text-sm font-medium ${isCalendar ? 'text-ink-soft' : 'text-ink'}`}>{b.title}</p>
        <p className="truncate text-xs text-faint">{metaLine}</p>
        {b.rationale && <p className="mt-0.5 line-clamp-1 text-xs text-faint/80">{b.rationale}</p>}

        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          {!isCalendar && (
            <>
              <IconAction label="15 minuten eerder" onClick={() => movePlanBlock(b.id, -15)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </IconAction>
              <IconAction label="15 minuten later" onClick={() => movePlanBlock(b.id, 15)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </IconAction>
              {isProposal && (
                <IconAction label="Vergrendel" tone="primary" onClick={() => lockPlanBlock(b.id)}>
                  <LockKeyhole className="h-3.5 w-3.5" />
                </IconAction>
              )}
              <IconAction label={isLocked ? 'Verwijder' : 'Negeer'} onClick={() => dismissPlanBlock(b.id)}>
                <X className="h-3.5 w-3.5" />
              </IconAction>
            </>
          )}
          <IconAction label="Toevoegen aan Google Agenda" href={googleCalendarUrlForBlock(b)}>
            <CalendarPlus className="h-3.5 w-3.5" />
          </IconAction>
        </div>
      </div>
    </div>
  )
}

export default function DayBuilder() {
  const { weekPlan, weekPlanAt, weekPlanBounds, planningWeek, generateWeekPlan, lastPlanError } = useStore()
  // The actually-used window from the last generation — wake/bed-anchored
  // when real sleep data exists, the fixed defaults otherwise.
  const peakStart = weekPlanBounds?.peakStart ?? PEAK_START
  const peakEnd = weekPlanBounds?.peakEnd ?? PEAK_END
  const learnedFromSleep = weekPlanBounds != null && (weekPlanBounds.peakStart !== PEAK_START || weekPlanBounds.dayEnd !== '23:00')

  const dates = useMemo(() => weekDates(today()), [])
  const dateSet = useMemo(() => new Set(dates), [dates])
  const [selectedDate, setSelectedDate] = useState(dates[0])

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

  const selectedList = byDate.get(selectedDate) ?? []
  const { weekday, rest } = dayHeading(selectedDate)
  const isSelectedToday = selectedDate === today()

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
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

      {/* learned-window banner — wake/bed-anchored once real sleep data exists */}
      <div className="card p-3 flex items-center gap-2 text-sm text-ink-soft flex-wrap">
        <Sun className="h-4 w-4 text-personal" />
        {learnedFromSleep ? 'Focuspiek uit je echte slaapritme:' : 'Hoog-energie venster (nog geen echte slaapdata):'}{' '}
        <b className="text-personal">
          {peakStart} – {peakEnd}
        </b>
        . Diep werk wordt hier beschermd
        {weekPlanBounds && (
          <>
            , wind-down richting <b className="text-personal">{weekPlanBounds.dayEnd}</b>
          </>
        )}
        .
      </div>

      {hasPlan && (
        <>
          <WeekStrip dates={dates} selected={selectedDate} onSelect={setSelectedDate} byDate={byDate} />

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-baseline gap-2">
              <h2 className="text-base font-semibold text-ink">{weekday}</h2>
              <span className="text-xs text-faint">{rest}</span>
              {isSelectedToday && <span className="chip bg-forest/15 text-forest">vandaag</span>}
            </div>
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className="chip bg-buurtkaart/15 text-buurtkaart-deep">{events} afspraken</span>
              <span className="chip bg-cross/15 text-cross-deep">{proposed} voorgesteld</span>
              <span className="chip bg-personal/15 text-personal-deep">{locked} vergrendeld</span>
            </div>
          </div>
        </>
      )}

      {!hasPlan ? (
        <Empty>
          {planningWeek
            ? 'HEYRA stelt je week samen…'
            : 'Nog geen plan. Tik op "Genereer plan" — HEYRA bouwt een dagindeling rond je agenda en routines.'}
        </Empty>
      ) : selectedList.length ? (
        <div className="flex flex-col">
          {selectedList.map((b, i) => (
            <TimelineRow key={b.id} b={b} isLast={i === selectedList.length - 1} peakStart={peakStart} peakEnd={peakEnd} />
          ))}
        </div>
      ) : (
        <Empty>Geen blokken op deze dag.</Empty>
      )}

      <p className="text-[11px] text-faint">
        {weekPlanAt && (
          <>
            Bijgewerkt{' '}
            {new Date(weekPlanAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' })}
            {' · '}
          </>
        )}
        Vergrendelde blokken worden opgeslagen in je dagplan (day_blocks) en verschijnen bij "Vandaag". Via Google Agenda opent HEYRA
        een vooraf ingevulde afspraak — jij bevestigt.
      </p>
    </div>
  )
}
