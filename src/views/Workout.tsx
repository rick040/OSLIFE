import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { TODAY, DOMAIN_HEX } from '../domains'
import { SectionTitle, Empty, SegmentedProgress, Overlay } from '../components/ui'
import { humanizeAge } from '../lib/syncStatus'
import { BODY_PARTS, TARGET_MUSCLES, titleCase, loadExerciseLibrary, searchExercises, type LibraryExercise } from '../workout/exerciseLibrary'
import GeneratePlanModal from '../workout/GeneratePlanModal'
import WorkoutMode from '../workout/WorkoutMode'
import { buildPreviousByExercise } from '../workout/previousSets'
import type { WorkoutPlan, WorkoutExercise } from '../types'
import {
  Dumbbell,
  Plus,
  X,
  Play,
  TrendingUp,
  TrendingDown,
  Minus,
  Weight,
  Trash2,
  Pencil,
  Scale,
  Search,
  ListPlus,
  Wand2,
} from 'lucide-react'

const WEEKDAY_FULL = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag']
const WEEKDAY_SHORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']
const MONTH_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
/** The app's 5 core accent hues (shared with domain tags elsewhere) — reused as the plan-color palette. */
const PLAN_COLORS = Object.values(DOMAIN_HEX)
/** Evidence-based weekly landmark (roughly MEV→MAV) used only to scale the muscle-progress dots. */
const TARGET_SETS_PER_WEEK = 15

function isoDaysAgo(n: number): string {
  const d = new Date(TODAY + 'T00:00:00')
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}
const last84 = Array.from({ length: 84 }, (_, i) => isoDaysAgo(83 - i)) // oldest → today, 12 weeks

function fmtKg(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : Math.round(n).toLocaleString('nl-NL')
}

export default function Workout() {
  const {
    workoutPlans,
    workoutExercises,
    workoutSessions,
    bodyWeight,
    addWorkoutPlan,
    deleteWorkoutPlan,
    addWorkoutExercise,
    updateWorkoutExercise,
    deleteWorkoutExercise,
    addWorkoutPlanWithExercises,
    logWorkoutSession,
    deleteWorkoutSession,
  } = useStore()

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [planForm, setPlanForm] = useState(false)
  const [generatePlanOpen, setGeneratePlanOpen] = useState(false)
  const [logPlan, setLogPlan] = useState<WorkoutPlan | null>(null)

  const selectedPlan = workoutPlans.find((p) => p.id === selectedPlanId) ?? null
  const exercisesFor = (planId: string) =>
    workoutExercises.filter((e) => e.planId === planId).sort((a, b) => a.orderIdx - b.orderIdx)

  const allSets = useMemo(() => workoutSessions.flatMap((s) => s.sets.map((set) => ({ ...set, at: s.startedAt }))), [workoutSessions])

  const sessionsByDate = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of workoutSessions) {
      const d = s.startedAt.slice(0, 10)
      m.set(d, (m.get(d) ?? 0) + 1)
    }
    return m
  }, [workoutSessions])

  const setsSince = (daysAgo: number) => {
    const cutoff = isoDaysAgo(daysAgo)
    return allSets.filter((s) => s.at.slice(0, 10) >= cutoff)
  }
  const volumeOf = (sets: { weightKg: number | null; reps: number | null }[]) =>
    sets.reduce((sum, s) => sum + (s.weightKg ?? 0) * (s.reps ?? 0), 0)

  const last7Sets = setsSince(6)
  const prev7Sets = allSets.filter((s) => s.at.slice(0, 10) >= isoDaysAgo(13) && s.at.slice(0, 10) < isoDaysAgo(6))
  const volume7 = volumeOf(last7Sets)
  const volumePrev7 = volumeOf(prev7Sets)

  const lastSession = [...workoutSessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null

  const trackedMuscles = useMemo(() => {
    const s = new Set<string>()
    for (const e of workoutExercises) s.add(e.muscleGroup)
    for (const set of allSets) s.add(set.muscleGroup)
    return [...s].sort()
  }, [workoutExercises, allSets])

  /** Most recent logged sets per exercise (across all past sessions) — powers the "vorige keer" hints while logging. */
  const previousByExercise = useMemo(
    () => buildPreviousByExercise(workoutSessions, workoutExercises),
    [workoutSessions, workoutExercises],
  )

  const planLastDone = (planId: string): string | null => {
    const sessions = workoutSessions.filter((s) => s.planId === planId)
    if (!sessions.length) return null
    return [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0].startedAt
  }

  const nextPlanLabel = (p: WorkoutPlan) => (p.dayOfWeek == null ? 'Geen vaste dag' : WEEKDAY_FULL[p.dayOfWeek])

  return (
    <div className="flex flex-col gap-7 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sunken">
            <Dumbbell className="h-5 w-5 text-ink-soft" />
          </span>
          <h1 className="text-xl font-medium text-ink">Workout</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost !py-2" onClick={() => setGeneratePlanOpen(true)}>
            <Wand2 className="h-4 w-4" /> Genereer plan
          </button>
          <button className="btn-primary !py-2" onClick={() => setPlanForm((f) => !f)}>
            <Plus className="h-4 w-4" /> Nieuw plan
          </button>
        </div>
      </div>

      {generatePlanOpen && (
        <GeneratePlanModal
          existingPlanCount={workoutPlans.length}
          onClose={() => setGeneratePlanOpen(false)}
          onCreate={async (drafts) => {
            for (const d of drafts) await addWorkoutPlanWithExercises(d.plan, d.exercises)
          }}
        />
      )}

      {planForm && (
        <PlanForm
          existingCount={workoutPlans.length}
          onCancel={() => setPlanForm(false)}
          onSave={(draft) => {
            addWorkoutPlan(draft)
            setPlanForm(false)
          }}
        />
      )}

      {workoutPlans.length === 0 ? (
        <Empty>Nog geen trainingsplannen. Tik op "Nieuw plan" om je split (bv. Chest + triceps) vast te leggen.</Empty>
      ) : (
        <>
          {/* Top stat row: body weight + volume lifted */}
          <div className="grid grid-cols-2 gap-3">
            <div className="card p-4">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sunken">
                <Scale className="h-4 w-4 text-ink-soft" />
              </span>
              {bodyWeight ? (
                <>
                  <div className="text-2xl font-bold tabular-nums mt-2">
                    {bodyWeight.weightKg.toFixed(1)} <span className="text-sm font-medium text-faint">kg</span>
                  </div>
                  <div className="text-xs text-faint">Lichaamsgewicht · {humanizeAge(bodyWeight.at)}</div>
                </>
              ) : (
                <div className="text-xs text-faint mt-2">Nog geen weegschaal-data.</div>
              )}
            </div>
            <div className="card p-4">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sunken">
                <Weight className="h-4 w-4 text-ink-soft" />
              </span>
              <div className="text-2xl font-bold tabular-nums mt-2">
                {fmtKg(volume7)} <span className="text-sm font-medium text-faint">kg</span>
              </div>
              <div className="text-xs text-faint flex items-center gap-1">
                Volume getild · laatste 7 dagen
                {volumePrev7 > 0 && <VolumeDelta current={volume7} prev={volumePrev7} />}
              </div>
            </div>
          </div>

          {/* Plan cards */}
          <div className="flex flex-col gap-3">
            <SectionTitle hint="Tik op een plan om de oefeningen te zien en een training te loggen.">Trainingsplannen</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {workoutPlans.map((p, i) => {
                const lastDone = planLastDone(p.id)
                const isToday = p.dayOfWeek === new Date(TODAY + 'T00:00:00').getDay()
                const color = p.color ?? PLAN_COLORS[i % PLAN_COLORS.length]
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPlanId(p.id === selectedPlanId ? null : p.id)}
                    className={`card p-4 text-left ${selectedPlanId === p.id ? 'ring-2 ring-ring' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold border-2"
                        style={{ borderColor: color, color }}
                      >
                        {i + 1}
                      </span>
                      {isToday && <span className="chip bg-forest/15 text-forest-hi">Vandaag</span>}
                    </div>
                    <div className="text-base font-medium text-ink mt-3">{p.name}</div>
                    <div className="text-xs text-faint mt-0.5">{nextPlanLabel(p)}</div>
                    {p.muscleGroups.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {p.muscleGroups.slice(0, 3).map((m) => (
                          <span key={m} className="chip bg-sunken text-ink-soft text-[10px] px-1.5 py-0">{m}</span>
                        ))}
                        {p.muscleGroups.length > 3 && (
                          <span className="chip bg-sunken text-faint text-[10px] px-1.5 py-0">+{p.muscleGroups.length - 3}</span>
                        )}
                      </div>
                    )}
                    <div className="text-xs text-faint mt-2">
                      {lastDone ? `Laatst gedaan · ${humanizeAge(lastDone)}` : 'Nog niet gelogd'}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Selected plan detail */}
          {selectedPlan && (
            <PlanDetail
              plan={selectedPlan}
              exercises={exercisesFor(selectedPlan.id)}
              onAddExercise={(ex) => addWorkoutExercise(selectedPlan.id, ex)}
              onUpdateExercise={updateWorkoutExercise}
              onDeleteExercise={deleteWorkoutExercise}
              onDeletePlan={() => {
                deleteWorkoutPlan(selectedPlan.id)
                setSelectedPlanId(null)
              }}
              onStart={() => setLogPlan(selectedPlan)}
            />
          )}

          {/* Calendar heatmap */}
          <div className="card p-5">
            <SectionTitle hint="Elke stip is een dag; hoe voller, hoe meer trainingen die dag.">12 weken</SectionTitle>
            <ContributionGrid sessionsByDate={sessionsByDate} />
          </div>

          {/* Muscle group progress */}
          {trackedMuscles.length > 0 && (
            <div className="flex flex-col gap-3">
              <SectionTitle hint={`Sets per spiergroep, deze week vs. vorige week (streefdoel ${TARGET_SETS_PER_WEEK}/week).`}>
                Spiergroepen
              </SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {trackedMuscles.map((m) => {
                  const thisWeek = last7Sets.filter((s) => s.muscleGroup === m).length
                  const lastWeekCount = prev7Sets.filter((s) => s.muscleGroup === m).length
                  return <MuscleCard key={m} muscle={m} thisWeek={thisWeek} lastWeek={lastWeekCount} />
                })}
              </div>
            </div>
          )}

          {/* Recent sessions */}
          <div className="flex flex-col gap-3">
            <SectionTitle>Recente trainingen</SectionTitle>
            {workoutSessions.length === 0 ? (
              <Empty>Nog geen trainingen gelogd.</Empty>
            ) : (
              <div className="card p-0 divide-y divide-line">
                {[...workoutSessions]
                  .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
                  .slice(0, 8)
                  .map((s) => {
                    const vol = volumeOf(s.sets)
                    const planIdx = workoutPlans.findIndex((p) => p.id === s.planId)
                    const color = planIdx >= 0 ? workoutPlans[planIdx].color ?? PLAN_COLORS[planIdx % PLAN_COLORS.length] : '#737373'
                    return (
                      <div key={s.id} className="p-4 flex items-center gap-3">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-ink truncate">{s.planName ?? 'Vrije training'}</div>
                          <div className="text-xs text-faint">
                            {humanizeAge(s.startedAt)} · {s.sets.length} sets{vol > 0 ? ` · ${fmtKg(vol)} kg` : ''}
                          </div>
                        </div>
                        <button onClick={() => deleteWorkoutSession(s.id)} className="text-faint hover:text-cross p-1 shrink-0" aria-label="Verwijder">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        </>
      )}

      {logPlan && (
        <WorkoutMode
          plan={logPlan}
          exercises={exercisesFor(logPlan.id)}
          previousByExercise={previousByExercise}
          onClose={() => setLogPlan(null)}
          onSave={(sets) => {
            const startedAt = new Date().toISOString()
            logWorkoutSession(
              { planId: logPlan.id, planName: logPlan.name, startedAt, completedAt: new Date().toISOString(), durationMin: null, notes: null },
              sets,
            )
            setLogPlan(null)
          }}
        />
      )}

      {!lastSession && workoutPlans.length > 0 && (
        <p className="text-xs text-faint text-center">Nog geen training gelogd — kies een plan hierboven en tik op "Start workout".</p>
      )}
    </div>
  )
}

function VolumeDelta({ current, prev }: { current: number; prev: number }) {
  const delta = Math.round(((current - prev) / prev) * 100)
  if (delta === 0) return <Minus className="h-3 w-3" />
  const up = delta > 0
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span className={`inline-flex items-center gap-0.5 ${up ? 'text-buurtkaart' : 'text-cross'}`}>
      <Icon className="h-3 w-3" /> {Math.abs(delta)}%
    </span>
  )
}

function MuscleCard({ muscle, thisWeek, lastWeek }: { muscle: string; thisWeek: number; lastWeek: number }) {
  const trend =
    thisWeek === 0 && lastWeek === 0 ? null : thisWeek === 0 ? 'rest' : thisWeek > lastWeek ? 'up' : thisWeek < lastWeek ? 'down' : 'flat'
  const meta = {
    up: { label: 'Groeiend', cls: 'text-buurtkaart', Icon: TrendingUp },
    down: { label: 'Dalend', cls: 'text-cross', Icon: TrendingDown },
    flat: { label: 'Stabiel', cls: 'text-personal-deep', Icon: Minus },
    rest: { label: 'Rust', cls: 'text-faint', Icon: Minus },
  } as const
  const m = trend ? meta[trend] : null
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <span className="text-sm font-medium text-ink">{muscle}</span>
        {m && (
          <span className={`chip bg-sunken ${m.cls}`}>
            <m.Icon className="h-3 w-3" /> {m.label}
          </span>
        )}
      </div>
      <SegmentedProgress done={thisWeek} total={TARGET_SETS_PER_WEEK} color={trend === 'down' ? 'bg-cross' : 'bg-forest'} />
      <div className="flex justify-between text-[11px] text-faint mt-1.5">
        <span>0</span>
        <span>{thisWeek} sets deze week</span>
        <span>{TARGET_SETS_PER_WEEK}</span>
      </div>
    </div>
  )
}

/** 0=leeg .. 3=vol, mirrors a GitHub-style contribution scale. */
function cellShade(count: number): string {
  if (count <= 0) return ''
  if (count === 1) return '#34D39955'
  if (count === 2) return '#34D399AA'
  return '#34D399'
}

function ContributionGrid({ sessionsByDate }: { sessionsByDate: Map<string, number> }) {
  // 12 weeks, columns = weeks (7-day chunks ending today), rows = weekday.
  // Fixed row heights + fluid (1fr) columns so the grid always fills the
  // card's full width instead of a fixed cell size scrolling off to the side.
  const weeks: string[][] = []
  for (let i = 0; i < last84.length; i += 7) weeks.push(last84.slice(i, i + 7))

  // Month label shown once, over the first week column whose Monday falls in that month.
  const monthLabelFor = (weekIdx: number): string | null => {
    const iso = weeks[weekIdx][0]
    const month = new Date(iso + 'T00:00:00').getMonth()
    const prevMonth = weekIdx > 0 ? new Date(weeks[weekIdx - 1][0] + 'T00:00:00').getMonth() : -1
    return month !== prevMonth ? MONTH_SHORT[month] : null
  }

  return (
    <div>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `20px repeat(${weeks.length}, minmax(0, 1fr))`, gridTemplateRows: `14px repeat(7, 1fr)`, height: 160 }}
      >
        {weeks.map((_, wi) => (
          <div key={`m-${wi}`} className="text-[10px] text-faint truncate" style={{ gridColumn: wi + 2, gridRow: 1 }}>
            {monthLabelFor(wi) ?? ''}
          </div>
        ))}
        {WEEKDAY_SHORT.map((d, di) => (
          <div key={`d-${di}`} className="text-[10px] text-faint flex items-center" style={{ gridColumn: 1, gridRow: di + 2 }}>
            {di % 2 === 1 ? d : ''}
          </div>
        ))}
        {weeks.map((week, wi) =>
          week.map((iso, di) => {
            const count = sessionsByDate.get(iso) ?? 0
            const isToday = iso === TODAY
            return (
              <div
                key={iso}
                title={`${iso}: ${count} training${count === 1 ? '' : 'en'}`}
                className={`rounded ${count === 0 ? 'bg-line' : ''}`}
                style={{
                  gridColumn: wi + 2,
                  gridRow: di + 2,
                  background: count > 0 ? cellShade(count) : undefined,
                  outline: isToday ? '1.5px solid #34D399' : 'none',
                  outlineOffset: 1,
                }}
              />
            )
          }),
        )}
      </div>
      <div className="flex items-center justify-end gap-1.5 mt-2 text-[10px] text-faint">
        <span>Minder</span>
        <span className="h-2.5 w-2.5 rounded bg-line" />
        <span className="h-2.5 w-2.5 rounded" style={{ background: cellShade(1) }} />
        <span className="h-2.5 w-2.5 rounded" style={{ background: cellShade(2) }} />
        <span className="h-2.5 w-2.5 rounded" style={{ background: cellShade(3) }} />
        <span>Meer</span>
      </div>
    </div>
  )
}

function PlanForm({
  existingCount,
  onCancel,
  onSave,
}: {
  existingCount: number
  onCancel: () => void
  onSave: (draft: Omit<WorkoutPlan, 'id' | 'orderIdx' | 'active'>) => void
}) {
  const [name, setName] = useState('')
  const [dayOfWeek, setDayOfWeek] = useState<number | null>(null)
  const [muscles, setMuscles] = useState<string[]>([])
  const [color, setColor] = useState(PLAN_COLORS[existingCount % PLAN_COLORS.length])

  const toggleMuscle = (m: string) => setMuscles((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onSave({ name: name.trim(), dayOfWeek, muscleGroups: muscles, color })
  }

  return (
    <form onSubmit={submit} className="card p-4 flex flex-col gap-3">
      <div className="flex flex-wrap gap-2.5 items-center">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Naam (bv. Chest + triceps)" className="input flex-1 min-w-[180px]" autoFocus />
        <select value={dayOfWeek ?? ''} onChange={(e) => setDayOfWeek(e.target.value === '' ? null : Number(e.target.value))} className="input">
          <option value="">Geen vaste dag</option>
          {WEEKDAY_FULL.map((d, i) => (
            <option key={d} value={i}>{d}</option>
          ))}
        </select>
        <div className="flex items-center gap-1.5">
          {PLAN_COLORS.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setColor(c)}
              aria-label={`Kleur ${c}`}
              className={`h-7 w-7 rounded-full shrink-0 transition-transform ${color === c ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface scale-110' : ''}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TARGET_MUSCLES.map((m) => (
          <button type="button" key={m} onClick={() => toggleMuscle(m)} className={`chip ${muscles.includes(m) ? 'bg-ink text-canvas' : 'bg-sunken text-muted'}`}>
            {m}
          </button>
        ))}
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="btn-ghost !py-2">Annuleer</button>
        <button type="submit" className="btn-primary !py-2"><Plus className="h-4 w-4" /> Toevoegen</button>
      </div>
    </form>
  )
}

function PlanDetail({
  plan,
  exercises,
  onAddExercise,
  onUpdateExercise,
  onDeleteExercise,
  onDeletePlan,
  onStart,
}: {
  plan: WorkoutPlan
  exercises: WorkoutExercise[]
  onAddExercise: (ex: Omit<WorkoutExercise, 'id' | 'planId'>) => void
  onUpdateExercise: (id: string, patch: Partial<WorkoutExercise>) => void
  onDeleteExercise: (id: string) => void
  onDeletePlan: () => void
  onStart: () => void
}) {
  const [picker, setPicker] = useState(false)
  const [customForm, setCustomForm] = useState(false)
  const [name, setName] = useState('')
  const [muscle, setMuscle] = useState(TARGET_MUSCLES[0])
  const [targetSets, setTargetSets] = useState('3')
  const [targetReps, setTargetReps] = useState('8-12')

  const submitCustom = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onAddExercise({ name: name.trim(), muscleGroup: muscle, targetSets: Number(targetSets) || 3, targetReps: targetReps.trim() || '8-12', orderIdx: exercises.length })
    setName(''); setCustomForm(false)
  }

  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-base font-medium text-ink">{plan.name}</div>
          {plan.muscleGroups.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {plan.muscleGroups.map((m) => (
                <span key={m} className="chip bg-sunken text-ink-soft text-[11px] px-2 py-0">{m}</span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onDeletePlan} className="text-faint hover:text-cross p-1.5" aria-label="Verwijder plan"><Trash2 className="h-4 w-4" /></button>
          <button onClick={onStart} className="btn-primary !py-2" disabled={exercises.length === 0}>
            <Play className="h-4 w-4" /> Start workout
          </button>
        </div>
      </div>

      {exercises.length === 0 ? (
        <Empty>Nog geen oefeningen in dit plan.</Empty>
      ) : (
        <div className="flex flex-col gap-2">
          {exercises.map((ex) => (
            <div key={ex.id} className="flex items-center gap-3 rounded-2xl bg-sunken px-4 py-2.5">
              <ExerciseThumb src={ex.imageUrl} className="h-9 w-9 shrink-0" />
              <span className="flex-1 text-sm text-ink truncate">{ex.name}</span>
              <span className="chip bg-line text-ink-soft shrink-0">{ex.muscleGroup}</span>
              <input
                type="number" min={1} value={ex.targetSets}
                onChange={(e) => onUpdateExercise(ex.id, { targetSets: Number(e.target.value) || 1 })}
                className="input w-11 !py-1 !px-1 text-xs text-center shrink-0" aria-label="Sets"
              />
              <span className="text-xs text-faint shrink-0">×</span>
              <input
                value={ex.targetReps}
                onChange={(e) => onUpdateExercise(ex.id, { targetReps: e.target.value })}
                className="input w-14 !py-1 !px-1 text-xs text-center shrink-0" aria-label="Reps"
              />
              <button onClick={() => onDeleteExercise(ex.id)} className="text-faint hover:text-cross p-1 shrink-0" aria-label="Verwijder oefening">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {customForm ? (
        <form onSubmit={submitCustom} className="flex flex-wrap gap-2 items-center pt-1">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Oefeningnaam" className="input flex-1 min-w-[160px]" autoFocus />
          <select value={muscle} onChange={(e) => setMuscle(e.target.value)} className="input">
            {TARGET_MUSCLES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <input type="number" min={1} value={targetSets} onChange={(e) => setTargetSets(e.target.value)} className="input w-16 text-center" aria-label="Sets" />
          <input value={targetReps} onChange={(e) => setTargetReps(e.target.value)} placeholder="8-12" className="input w-20 text-center" aria-label="Reps" />
          <button type="submit" className="btn-primary !py-2"><Plus className="h-4 w-4" /></button>
          <button type="button" onClick={() => setCustomForm(false)} className="text-xs text-faint hover:text-ink">Annuleer</button>
        </form>
      ) : (
        <div className="flex items-center gap-4">
          <button onClick={() => setPicker(true)} className="btn-ghost !py-2"><Search className="h-4 w-4" /> Oefening kiezen</button>
          <button onClick={() => setCustomForm(true)} className="text-xs text-muted hover:text-ink flex items-center gap-1">
            <Pencil className="h-3 w-3" /> Handmatig toevoegen
          </button>
        </div>
      )}

      {picker && (
        <ExercisePicker
          onClose={() => setPicker(false)}
          onPick={(picked) => {
            onAddExercise({
              name: picked.name,
              muscleGroup: picked.muscleGroup,
              targetSets: 3,
              targetReps: '8-12',
              orderIdx: exercises.length,
              imageUrl: picked.imageUrl,
              gifUrl: picked.gifUrl,
            })
            setPicker(false)
          }}
          onCustom={() => { setPicker(false); setCustomForm(true) }}
        />
      )}
    </div>
  )
}

/** Library thumbnail with a dumbbell-icon fallback for custom exercises or a broken/missing image. */
function ExerciseThumb({ src, className = 'h-10 w-10' }: { src?: string | null; className?: string }) {
  const [broken, setBroken] = useState(false)
  if (!src || broken) {
    return (
      <span className={`inline-flex items-center justify-center rounded-xl bg-line ${className}`}>
        <Dumbbell className="h-4 w-4 text-faint" />
      </span>
    )
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setBroken(true)}
      className={`rounded-xl object-cover bg-line ${className}`}
    />
  )
}

function ExercisePicker({
  onClose,
  onPick,
  onCustom,
}: {
  onClose: () => void
  onPick: (ex: { name: string; muscleGroup: string; imageUrl: string; gifUrl: string }) => void
  onCustom: () => void
}) {
  const [library, setLibrary] = useState<LibraryExercise[] | null>(null)
  const [query, setQuery] = useState('')
  const [bodyPart, setBodyPart] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    loadExerciseLibrary().then((d) => { if (alive) setLibrary(d) })
    return () => { alive = false }
  }, [])

  const matches = useMemo(() => (library ? searchExercises(library, query, bodyPart) : []), [library, query, bodyPart])
  const results = matches.slice(0, 60)

  return (
    <Overlay tone="black-blur" onClose={onClose} panelClassName="bg-surface rounded-3xl p-5 w-full max-w-lg shadow-2xl max-h-[85vh] flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold text-ink flex items-center gap-2"><Search className="h-4 w-4" /> Oefening kiezen</div>
        <button onClick={onClose} className="text-faint hover:text-ink p-1" aria-label="Sluiten"><X className="h-4 w-4" /></button>
      </div>
      <input
        value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder="Zoek op naam, spiergroep of materiaal…" className="input w-full mb-3" autoFocus
      />
      <div className="flex flex-wrap gap-1.5 mb-3 shrink-0">
        <button onClick={() => setBodyPart(null)} className={`chip ${bodyPart === null ? 'bg-ink text-canvas' : 'bg-sunken text-muted'}`}>Alle</button>
        {BODY_PARTS.map((bp) => (
          <button key={bp} onClick={() => setBodyPart(bp)} className={`chip ${bodyPart === bp ? 'bg-ink text-canvas' : 'bg-sunken text-muted'}`}>
            {titleCase(bp)}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto -mx-1 px-1 min-h-[200px]">
        {!library ? (
          <div className="text-sm text-faint text-center py-10">Oefeningen laden…</div>
        ) : results.length === 0 ? (
          <Empty>Geen oefeningen gevonden.</Empty>
        ) : (
          <div className="flex flex-col gap-1">
            {results.map((ex) => (
              <button
                key={ex.id}
                onClick={() => onPick({ name: ex.name, muscleGroup: titleCase(ex.target), imageUrl: ex.image, gifUrl: ex.gifUrl })}
                className="flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-sunken text-left transition-colors"
              >
                <ExerciseThumb src={ex.image} className="h-11 w-11" />
                <span className="flex-1 text-sm text-ink truncate">{ex.name}</span>
                <span className="chip bg-sunken text-ink-soft shrink-0">{titleCase(ex.target)}</span>
                <span className="text-[11px] text-faint w-20 text-right shrink-0 truncate">{titleCase(ex.equipment)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {library && matches.length > results.length && (
        <p className="text-[11px] text-faint text-center pt-2 shrink-0">{results.length} van {matches.length} — verfijn je zoekopdracht voor meer.</p>
      )}
      <button onClick={onCustom} className="btn-ghost !py-2 mt-3 self-center text-xs shrink-0">
        <ListPlus className="h-3.5 w-3.5" /> Staat er niet bij — aangepaste oefening
      </button>
      <p className="text-[10px] text-faint text-center mt-2 shrink-0">Oefeningfoto's © Gym visual — gymvisual.com</p>
    </Overlay>
  )
}

