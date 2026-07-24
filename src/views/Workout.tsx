import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { TODAY } from '../domains'
import { SectionTitle, Empty, SegmentedProgress, Overlay } from '../components/ui'
import { humanizeAge } from '../lib/syncStatus'
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
  BarChart3,
} from 'lucide-react'

const WEEKDAY_FULL = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag']
const WEEKDAY_SHORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']
const MONTH_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
const MUSCLE_GROUPS = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core']
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
    updateWorkoutPlan,
    deleteWorkoutPlan,
    addWorkoutExercise,
    deleteWorkoutExercise,
    logWorkoutSession,
    deleteWorkoutSession,
  } = useStore()

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [planForm, setPlanForm] = useState(false)
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
        <button className="btn-primary !py-2" onClick={() => setPlanForm((f) => !f)}>
          <Plus className="h-4 w-4" /> Nieuw plan
        </button>
      </div>

      {planForm && (
        <PlanForm
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
                {volumePrev7 > 0 && (
                  <VolumeDelta current={volume7} prev={volumePrev7} />
                )}
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
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPlanId(p.id === selectedPlanId ? null : p.id)}
                    className={`card p-4 text-left ${selectedPlanId === p.id ? 'ring-2 ring-ring' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold border-2"
                        style={{ borderColor: p.color ?? '#34D399', color: p.color ?? '#34D399' }}
                      >
                        {i + 1}
                      </span>
                      {isToday && <span className="chip bg-forest/15 text-forest-hi">Vandaag</span>}
                    </div>
                    <div className="text-base font-medium text-ink mt-3">{p.name}</div>
                    <div className="text-xs text-faint mt-0.5">{nextPlanLabel(p)}</div>
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
                    return (
                      <div key={s.id} className="p-4 flex items-center justify-between gap-3">
                        <div className="min-w-0">
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
        <LogWorkoutModal
          plan={logPlan}
          exercises={exercisesFor(logPlan.id)}
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

function ContributionGrid({ sessionsByDate }: { sessionsByDate: Map<string, number> }) {
  // 12 weeks, columns = weeks (7-day chunks ending today), rows = weekday.
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
    <div className="overflow-x-auto">
      <div className="inline-flex flex-col gap-1 min-w-max">
        <div className="flex gap-1 pl-6">
          {weeks.map((_, wi) => (
            <div key={wi} className="w-3.5 text-[10px] text-faint">
              {monthLabelFor(wi) ?? ''}
            </div>
          ))}
        </div>
        <div className="flex gap-1">
          <div className="flex flex-col gap-1 pr-1 justify-between text-[10px] text-faint w-5 shrink-0">
            {WEEKDAY_SHORT.map((d) => (
              <span key={d} className="h-3.5 leading-[14px]">{d}</span>
            ))}
          </div>
          <div className="flex gap-1">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1">
                {week.map((iso) => {
                  const count = sessionsByDate.get(iso) ?? 0
                  const isToday = iso === TODAY
                  return (
                    <div
                      key={iso}
                      title={`${iso}: ${count} training${count === 1 ? '' : 'en'}`}
                      className="h-3.5 w-3.5 rounded"
                      style={{
                        background: count === 0 ? '#262626' : count === 1 ? '#34D39966' : '#34D399',
                        outline: isToday ? '1.5px solid #34D399' : 'none',
                        outlineOffset: 1,
                      }}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function PlanForm({
  onCancel,
  onSave,
}: {
  onCancel: () => void
  onSave: (draft: Omit<WorkoutPlan, 'id' | 'orderIdx' | 'active'>) => void
}) {
  const [name, setName] = useState('')
  const [dayOfWeek, setDayOfWeek] = useState<number | null>(null)
  const [muscles, setMuscles] = useState<string[]>([])

  const toggleMuscle = (m: string) => setMuscles((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onSave({ name: name.trim(), dayOfWeek, muscleGroups: muscles, color: null })
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
      </div>
      <div className="flex flex-wrap gap-1.5">
        {MUSCLE_GROUPS.map((m) => (
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
  onDeleteExercise,
  onDeletePlan,
  onStart,
}: {
  plan: WorkoutPlan
  exercises: WorkoutExercise[]
  onAddExercise: (ex: Omit<WorkoutExercise, 'id' | 'planId'>) => void
  onDeleteExercise: (id: string) => void
  onDeletePlan: () => void
  onStart: () => void
}) {
  const [exForm, setExForm] = useState(false)
  const [name, setName] = useState('')
  const [muscle, setMuscle] = useState(MUSCLE_GROUPS[0])
  const [targetSets, setTargetSets] = useState('3')
  const [targetReps, setTargetReps] = useState('8-12')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onAddExercise({ name: name.trim(), muscleGroup: muscle, targetSets: Number(targetSets) || 3, targetReps: targetReps.trim() || '8-12', orderIdx: exercises.length })
    setName(''); setExForm(false)
  }

  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-base font-medium text-ink">{plan.name}</div>
          {plan.muscleGroups.length > 0 && <div className="text-xs text-faint mt-0.5">{plan.muscleGroups.join(' · ')}</div>}
        </div>
        <div className="flex items-center gap-2">
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
              <span className="flex-1 text-sm text-ink">{ex.name}</span>
              <span className="chip bg-line text-ink-soft">{ex.muscleGroup}</span>
              <span className="text-xs text-faint w-20 text-right shrink-0">{ex.targetSets} × {ex.targetReps}</span>
              <button onClick={() => onDeleteExercise(ex.id)} className="text-faint hover:text-cross p-1 shrink-0" aria-label="Verwijder oefening">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {exForm ? (
        <form onSubmit={submit} className="flex flex-wrap gap-2 items-center pt-1">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Oefening (bv. Barbell Bench Press)" className="input flex-1 min-w-[180px]" autoFocus />
          <select value={muscle} onChange={(e) => setMuscle(e.target.value)} className="input">
            {MUSCLE_GROUPS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <input type="number" min={1} value={targetSets} onChange={(e) => setTargetSets(e.target.value)} className="input w-16 text-center" aria-label="Sets" />
          <input value={targetReps} onChange={(e) => setTargetReps(e.target.value)} placeholder="8-12" className="input w-20 text-center" aria-label="Reps" />
          <button type="submit" className="btn-primary !py-2"><Plus className="h-4 w-4" /></button>
        </form>
      ) : (
        <button onClick={() => setExForm(true)} className="btn-ghost !py-2 self-start">
          <Pencil className="h-4 w-4" /> Oefening toevoegen
        </button>
      )}
    </div>
  )
}

interface SetRow {
  weight: string
  reps: string
}

function LogWorkoutModal({
  plan,
  exercises,
  onClose,
  onSave,
}: {
  plan: WorkoutPlan
  exercises: WorkoutExercise[]
  onClose: () => void
  onSave: (sets: { exerciseId: string; exerciseName: string; muscleGroup: string; setNumber: number; weightKg: number | null; reps: number | null }[]) => void
}) {
  const [rows, setRows] = useState<Record<string, SetRow[]>>(() =>
    Object.fromEntries(exercises.map((ex) => [ex.id, Array.from({ length: ex.targetSets }, () => ({ weight: '', reps: '' }))])),
  )

  const updateRow = (exId: string, idx: number, patch: Partial<SetRow>) =>
    setRows((r) => ({ ...r, [exId]: r[exId].map((row, i) => (i === idx ? { ...row, ...patch } : row)) }))
  const addRow = (exId: string) => setRows((r) => ({ ...r, [exId]: [...r[exId], { weight: '', reps: '' }] }))
  const removeRow = (exId: string, idx: number) => setRows((r) => ({ ...r, [exId]: r[exId].filter((_, i) => i !== idx) }))

  const submit = () => {
    const sets: { exerciseId: string; exerciseName: string; muscleGroup: string; setNumber: number; weightKg: number | null; reps: number | null }[] = []
    for (const ex of exercises) {
      (rows[ex.id] ?? []).forEach((row, i) => {
        if (!row.weight.trim() && !row.reps.trim()) return
        sets.push({
          exerciseId: ex.id,
          exerciseName: ex.name,
          muscleGroup: ex.muscleGroup,
          setNumber: i + 1,
          weightKg: row.weight.trim() ? Number(row.weight) : null,
          reps: row.reps.trim() ? Number(row.reps) : null,
        })
      })
    }
    onSave(sets)
  }

  return (
    <Overlay tone="black-blur" onClose={onClose} panelClassName="bg-surface rounded-3xl p-5 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-1">
        <div className="font-semibold text-ink flex items-center gap-2"><Play className="h-4 w-4" /> {plan.name}</div>
        <button onClick={onClose} className="text-faint hover:text-ink p-1" aria-label="Sluiten"><X className="h-4 w-4" /></button>
      </div>
      <p className="text-xs text-faint mb-4">Vul gewicht (kg) en reps in per set — leeg laten sla je die set over.</p>

      <div className="flex flex-col gap-4">
        {exercises.map((ex) => (
          <div key={ex.id}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-ink">{ex.name}</span>
              <span className="text-xs text-faint">{ex.muscleGroup} · doel {ex.targetSets}×{ex.targetReps}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {(rows[ex.id] ?? []).map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-faint w-5 shrink-0">{i + 1}</span>
                  <input
                    type="number" step="0.5" min="0" placeholder="kg" value={row.weight}
                    onChange={(e) => updateRow(ex.id, i, { weight: e.target.value })}
                    className="input flex-1 text-center"
                  />
                  <input
                    type="number" min="0" placeholder="reps" value={row.reps}
                    onChange={(e) => updateRow(ex.id, i, { reps: e.target.value })}
                    className="input flex-1 text-center"
                  />
                  <button onClick={() => removeRow(ex.id, i)} className="text-faint hover:text-cross p-1 shrink-0" aria-label="Verwijder set">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => addRow(ex.id)} className="text-xs text-muted hover:text-ink mt-1.5 flex items-center gap-1">
              <Plus className="h-3 w-3" /> Set toevoegen
            </button>
          </div>
        ))}
      </div>

      <button onClick={submit} className="btn-primary w-full !py-2.5 mt-5">
        <BarChart3 className="h-4 w-4" /> Training opslaan
      </button>
    </Overlay>
  )
}
