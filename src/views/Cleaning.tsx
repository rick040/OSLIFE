import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { TODAY, fmtDate } from '../domains'
import { SectionTitle } from '../components/ui'
import DopamineBar from '../components/DopamineBar'
import {
  DAILY_BASELINE,
  ZONES,
  zoneForDate,
  tasksForDate,
} from '../cleaning/schedule'
import {
  isTaskDone,
  tasksDoneOn,
  isDayComplete,
  totalPoints,
  currentStreak,
  levelFor,
} from '../cleaning/gamify'
import { Check, Flame, Sparkles, Timer, Trophy } from 'lucide-react'

/** Offset an ISO date by N days, in local time (no UTC-shift surprises). */
function isoOffset(iso: string, deltaDays: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + deltaDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const WEEKDAY_SHORT = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']

// Tailwind's content scanner needs full class names to appear literally in the
// source — a template-interpolated `bg-${accent}` would get purged.
const ACCENT_BG: Record<string, string> = {
  parkingyou: 'bg-parkingyou',
  personal: 'bg-personal',
  buurtkaart: 'bg-buurtkaart',
  prjct: 'bg-prjct',
  cross: 'bg-cross',
  faint: 'bg-faint',
  forest: 'bg-forest',
}

/** Monday..Sunday of the week containing `iso`. */
function weekOf(iso: string): string[] {
  const dow = new Date(iso + 'T00:00:00').getDay() // 0=zo..6=za
  const monday = isoOffset(iso, dow === 0 ? -6 : 1 - dow)
  return Array.from({ length: 7 }, (_, i) => isoOffset(monday, i))
}

export default function Cleaning() {
  const { cleaningLog, toggleCleaningTask } = useStore()
  const [selDate, setSelDate] = useState(TODAY)

  const isToday = selDate === TODAY
  const zone = zoneForDate(selDate)
  const tasks = useMemo(() => tasksForDate(selDate), [selDate])
  const done = tasksDoneOn(cleaningLog, selDate)
  const total = tasks.length
  const complete = isDayComplete(cleaningLog, selDate)

  const points = useMemo(() => totalPoints(cleaningLog), [cleaningLog])
  const streak = useMemo(() => currentStreak(cleaningLog), [cleaningLog])
  const { level, next, progress } = useMemo(() => levelFor(points), [points])

  const week = useMemo(() => weekOf(TODAY), [])

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-16">
      {/* ── Header: today's zone + gamification stats ─────────────────────── */}
      <div className="card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <span className="text-2xl leading-none">{zone.emoji}</span> {zone.title}
            </h1>
            <p className="text-sm text-muted mt-0.5">{zone.subtitle}</p>
          </div>
          {zone.minutes > 0 && (
            <span className="chip bg-sunken text-muted shrink-0">
              <Timer className="h-3 w-3" /> {zone.minutes} min
            </span>
          )}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-sunken p-2.5 text-center">
            <div className="text-lg font-bold tabular-nums">{points}</div>
            <div className="text-[10px] uppercase tracking-wide text-faint">punten</div>
          </div>
          <div className="rounded-2xl bg-sunken p-2.5 text-center">
            <div className="text-lg font-bold tabular-nums flex items-center justify-center gap-1">
              <Flame className={`h-4 w-4 ${streak > 0 ? 'text-personal-deep' : 'text-faint'}`} /> {streak}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-faint">streak</div>
          </div>
          <div className="rounded-2xl bg-sunken p-2.5 text-center">
            <div className="text-sm font-bold truncate" title={level.name}>{level.name}</div>
            <div className="text-[10px] uppercase tracking-wide text-faint">niveau</div>
          </div>
        </div>

        {next && (
          <div className="mt-2.5">
            <div className="h-1.5 rounded-full bg-line overflow-hidden">
              <div
                className={`h-full rounded-full ${ACCENT_BG[zone.accent] ?? 'bg-forest'} transition-all duration-700`}
                style={{ width: `${Math.max(4, progress * 100)}%` }}
              />
            </div>
            <div className="text-[11px] text-faint mt-1 text-right">
              nog {next.threshold - points} punten tot {next.name}
            </div>
          </div>
        )}
      </div>

      {/* ── Dopamine bar for the selected day ───────────────────────────────── */}
      <DopamineBar done={done} total={total} />

      {complete && (
        <div className="card p-3.5 bg-buurtkaart/10 border-buurtkaart/30 flex items-center gap-2.5 animate-fade-up">
          <div className="rounded-xl p-2 bg-buurtkaart/15 animate-pulse-ring shrink-0">
            <Trophy className="h-4 w-4 text-buurtkaart-deep" />
          </div>
          <p className="text-sm text-buurtkaart-deep font-medium">
            Zone schoon — luxe-hotel gevoel bereikt. Bonuspunten binnen.
          </p>
        </div>
      )}

      {/* ── Week strip — tap any day to log it (also handy for a missed day) ── */}
      <div>
        <SectionTitle hint="Mis je een dag? Tik erop en log 'm alsnog — geen schuldgevoel nodig.">Deze week</SectionTitle>
        <div className="grid grid-cols-7 gap-1.5">
          {week.map((iso) => {
            const z = zoneForDate(iso)
            const d = tasksDoneOn(cleaningLog, iso)
            const t = tasksForDate(iso).length
            const c = isDayComplete(cleaningLog, iso)
            const sel = iso === selDate
            const isTodayTile = iso === TODAY
            return (
              <button
                key={iso}
                onClick={() => setSelDate(iso)}
                className={`flex flex-col items-center gap-0.5 rounded-2xl py-2.5 border transition-colors ${
                  sel
                    ? 'bg-forest text-white border-forest'
                    : c
                      ? 'bg-buurtkaart/10 border-buurtkaart/30'
                      : 'bg-surface border-line hover:bg-sunken'
                }`}
              >
                <span className={`text-[10px] uppercase tracking-wide ${sel ? 'text-white/70' : 'text-faint'}`}>
                  {WEEKDAY_SHORT[(new Date(iso + 'T00:00:00').getDay() + 6) % 7]}
                </span>
                <span className="text-lg leading-none">{z.emoji}</span>
                <span className={`text-[10px] tabular-nums ${sel ? 'text-white/80' : 'text-faint'}`}>{d}/{t}</span>
                {isTodayTile && <span className={`h-1 w-1 rounded-full ${sel ? 'bg-white' : 'bg-forest'}`} />}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── The log — big, tappable checklist ───────────────────────────────── */}
      <div>
        <SectionTitle hint={zone.minutes > 0 ? `Zet een timer van ${zone.minutes} minuten en ga.` : undefined}>
          Log · {isToday ? 'vandaag' : fmtDate(selDate)}
        </SectionTitle>

        <div className="text-xs font-semibold uppercase tracking-wider text-faint mb-1.5 mt-1">Elke dag</div>
        <div className="space-y-2 mb-4">
          {DAILY_BASELINE.map((t) => (
            <TaskRow key={t.key} label={t.label} done={isTaskDone(cleaningLog, selDate, t.key)} onToggle={() => toggleCleaningTask(t.key, selDate)} />
          ))}
        </div>

        {zone.tasks.length > 0 && (
          <>
            <div className="text-xs font-semibold uppercase tracking-wider text-faint mb-1.5">
              {zone.emoji} {zone.title} · {zone.subtitle}
            </div>
            <div className="space-y-2">
              {zone.tasks.map((t) => (
                <TaskRow
                  key={t.key}
                  label={t.label}
                  done={isTaskDone(cleaningLog, selDate, t.key)}
                  stage={t.key.endsWith('-stage')}
                  onToggle={() => toggleCleaningTask(t.key, selDate)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── The whole rotation, for context ─────────────────────────────────── */}
      <div>
        <SectionTitle hint="De vaste 15-minuten-per-dag rotatie.">Het schema</SectionTitle>
        <div className="card divide-y divide-line">
          {ZONES.map((z) => (
            <div key={z.day} className="p-3 flex items-center gap-2.5">
              <span className="text-lg shrink-0">{z.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{z.title}</div>
                <div className="text-xs text-faint truncate">{z.subtitle}</div>
              </div>
              {z.minutes > 0 && <span className="text-[11px] text-faint shrink-0">{z.minutes} min</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function TaskRow({
  label,
  done,
  stage,
  onToggle,
}: {
  label: string
  done: boolean
  stage?: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 border text-left transition-all active:scale-[0.98] ${
        done
          ? 'bg-buurtkaart/10 border-buurtkaart/30'
          : stage
            ? 'bg-personal/5 border-personal/30'
            : 'bg-surface border-line hover:bg-sunken'
      }`}
    >
      <span
        className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 border-2 transition-transform ${
          done ? 'bg-buurtkaart border-buurtkaart scale-100' : 'border-line text-transparent scale-90'
        }`}
      >
        <Check className="h-4 w-4 text-white" />
      </span>
      <span className={`flex-1 text-sm leading-snug ${done ? 'text-muted line-through decoration-buurtkaart/50' : 'text-ink'}`}>
        {stage && <Sparkles className="h-3.5 w-3.5 inline mr-1 -mt-0.5 text-personal-deep" />}
        {label}
      </span>
    </button>
  )
}
