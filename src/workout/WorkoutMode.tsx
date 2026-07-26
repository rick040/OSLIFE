import { useEffect, useMemo, useRef, useState } from 'react'
import { Overlay, ConfirmDialog, SegmentedProgress } from '../components/ui'
import type { WorkoutPlan, WorkoutExercise, WorkoutSet } from '../types'
import { X, Check, ChevronLeft, ChevronRight, Minus, Plus, Dumbbell } from 'lucide-react'

interface SetRow {
  weight: number
  reps: number
  logged: boolean
}

type LoggedSet = { exerciseId: string; exerciseName: string; muscleGroup: string; setNumber: number; weightKg: number | null; reps: number | null }

/** First number found in a free-text reps target ("8-12" → 8), or a sane fallback. */
function parseTargetReps(target: string): number {
  const m = target.match(/\d+/)
  return m ? Number(m[0]) : 10
}

function fmtWeight(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

function ExerciseVisual({ ex }: { ex: WorkoutExercise }) {
  const src = ex.gifUrl || ex.imageUrl
  const [broken, setBroken] = useState(false)
  if (!src || broken) {
    return (
      <div className="w-full max-w-xs aspect-square rounded-3xl bg-sunken flex items-center justify-center">
        <Dumbbell className="h-14 w-14 text-faint" />
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={ex.name}
      onError={() => setBroken(true)}
      className="w-full max-w-xs aspect-square rounded-3xl object-cover bg-sunken"
    />
  )
}

function BigStepper({
  label,
  value,
  step,
  min = 0,
  onChange,
}: {
  label: string
  value: number
  step: number
  min?: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-2xl bg-sunken py-3.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))}
          className="h-12 w-12 shrink-0 rounded-full bg-surface flex items-center justify-center active:scale-90 transition-transform"
          aria-label={`${label} verlagen`}
        >
          <Minus className="h-5 w-5 text-ink" />
        </button>
        <span className="text-4xl font-semibold tabular-nums w-16 text-center text-ink">{fmtWeight(value)}</span>
        <button
          type="button"
          onClick={() => onChange(+(value + step).toFixed(2))}
          className="h-12 w-12 shrink-0 rounded-full bg-surface flex items-center justify-center active:scale-90 transition-transform"
          aria-label={`${label} verhogen`}
        >
          <Plus className="h-5 w-5 text-ink" />
        </button>
      </div>
      <span className="text-[11px] text-faint uppercase tracking-wide">{label}</span>
    </div>
  )
}

export default function WorkoutMode({
  plan,
  exercises,
  previousByExercise,
  onClose,
  onSave,
}: {
  plan: WorkoutPlan
  exercises: WorkoutExercise[]
  previousByExercise: Map<string, WorkoutSet[]>
  onClose: () => void
  onSave: (sets: LoggedSet[]) => void
}) {
  const [exIdx, setExIdx] = useState(0)
  const [setIdx, setSetIdx] = useState(0)
  const [confirmExit, setConfirmExit] = useState(false)
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const [rows, setRows] = useState<Record<string, SetRow[]>>(() =>
    Object.fromEntries(
      exercises.map((ex) => {
        const prev = previousByExercise.get(ex.id) ?? []
        return [
          ex.id,
          Array.from({ length: ex.targetSets }, (_, i) => ({
            weight: prev[i]?.weightKg ?? 0,
            reps: prev[i]?.reps ?? parseTargetReps(ex.targetReps),
            logged: false,
          })),
        ]
      }),
    ),
  )

  const ex = exercises[exIdx]
  const exRows = rows[ex.id] ?? []
  const row = exRows[setIdx]
  const prev = previousByExercise.get(ex.id) ?? []

  const anyLogged = useMemo(() => Object.values(rows).some((rs) => rs.some((r) => r.logged)), [rows])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext()
      else if (e.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exIdx])

  const patchRow = (patch: Partial<SetRow>) =>
    setRows((r) => ({ ...r, [ex.id]: r[ex.id].map((row, i) => (i === setIdx ? { ...row, ...patch } : row)) }))

  const goToExercise = (idx: number) => {
    if (idx < 0 || idx >= exercises.length) return
    setExIdx(idx)
    const nextRows = rows[exercises[idx].id] ?? []
    const firstUnlogged = nextRows.findIndex((r) => !r.logged)
    setSetIdx(firstUnlogged >= 0 ? firstUnlogged : 0)
  }
  const goNext = () => goToExercise(exIdx + 1)
  const goPrev = () => goToExercise(exIdx - 1)

  const logSet = () => {
    patchRow({ logged: true })
    const firstUnlogged = exRows.findIndex((r, i) => i !== setIdx && !r.logged)
    if (firstUnlogged >= 0) setSetIdx(firstUnlogged)
  }

  const requestClose = () => {
    if (anyLogged) setConfirmExit(true)
    else onClose()
  }

  const finish = () => {
    const sets: LoggedSet[] = []
    for (const e of exercises) {
      ;(rows[e.id] ?? []).forEach((r, i) => {
        if (!r.logged) return
        sets.push({ exerciseId: e.id, exerciseName: e.name, muscleGroup: e.muscleGroup, setNumber: i + 1, weightKg: r.weight, reps: r.reps })
      })
    }
    onSave(sets)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const dx = e.changedTouches[0].clientX - start.x
    const dy = e.changedTouches[0].clientY - start.y
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return
    if (dx < 0) goNext()
    else goPrev()
  }

  return (
    <Overlay tone="black" onClose={requestClose} className="fixed inset-0" panelClassName="absolute inset-0 bg-canvas flex flex-col outline-none">
      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className="flex flex-col h-full">
        {/* top bar */}
        <div className="flex items-center gap-3 px-4 pt-4 shrink-0">
          <button onClick={requestClose} className="text-faint hover:text-ink p-1.5 shrink-0" aria-label="Sluiten workout mode">
            <X className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <SegmentedProgress done={exIdx + 1} total={exercises.length} />
          </div>
          <button onClick={finish} className="btn-primary !py-1.5 !px-3 text-xs shrink-0">Voltooien</button>
        </div>
        <div className="text-center text-[11px] text-faint pt-1.5 pb-1 shrink-0">
          {plan.name} · oefening {exIdx + 1}/{exercises.length}
        </div>

        {/* visual + info */}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center gap-3 px-6 py-3">
          <ExerciseVisual ex={ex} />
          <div className="text-xl font-medium text-ink text-center">{ex.name}</div>
          <div className="flex items-center gap-2">
            <span className="chip bg-sunken text-ink-soft">{ex.muscleGroup}</span>
            <span className="chip bg-sunken text-ink-soft">{ex.targetSets}×{ex.targetReps}</span>
          </div>
          {prev[setIdx] && (
            <p className="text-xs text-faint">Vorige keer set {setIdx + 1}: {prev[setIdx].weightKg ?? '–'}kg × {prev[setIdx].reps ?? '–'}</p>
          )}
        </div>

        {/* set pills */}
        <div className="flex justify-center gap-2 pb-2 shrink-0">
          {exRows.map((r, i) => (
            <button
              key={i}
              onClick={() => setSetIdx(i)}
              className={`h-8 w-8 rounded-full text-xs font-medium flex items-center justify-center transition-colors ${
                r.logged ? 'bg-forest text-canvas' : i === setIdx ? 'bg-ink text-canvas' : 'bg-sunken text-muted'
              }`}
              aria-label={`Set ${i + 1}`}
            >
              {r.logged ? <Check className="h-4 w-4" /> : i + 1}
            </button>
          ))}
        </div>

        {/* steppers */}
        <div className="grid grid-cols-2 gap-3 px-6 pb-3 shrink-0">
          <BigStepper label="kg" value={row.weight} step={2.5} onChange={(v) => patchRow({ weight: v })} />
          <BigStepper label="reps" value={row.reps} step={1} onChange={(v) => patchRow({ reps: v })} />
        </div>

        {/* log button */}
        <div className="px-6 pb-3 shrink-0">
          <button onClick={logSet} className="btn-primary w-full !py-3.5 text-base">
            <Check className="h-4 w-4" /> {row.logged ? 'Set opnieuw loggen' : 'Set loggen'}
          </button>
        </div>

        {/* nav */}
        <div className="flex items-center justify-between px-6 pb-6 shrink-0">
          <button
            onClick={goPrev}
            disabled={exIdx === 0}
            className="h-12 w-12 rounded-full bg-sunken flex items-center justify-center disabled:opacity-30"
            aria-label="Vorige oefening"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-[11px] text-faint">swipe voor volgende oefening</span>
          <button
            onClick={goNext}
            disabled={exIdx === exercises.length - 1}
            className="h-12 w-12 rounded-full bg-sunken flex items-center justify-center disabled:opacity-30"
            aria-label="Volgende oefening"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {confirmExit && (
        <ConfirmDialog
          title="Workout sluiten?"
          message="Je hebt sets gelogd die nog niet zijn opgeslagen. Wil je ze bewaren?"
          confirmLabel="Opslaan en sluiten"
          cancelLabel="Verder loggen"
          danger={false}
          onCancel={() => setConfirmExit(false)}
          onConfirm={() => {
            setConfirmExit(false)
            finish()
          }}
        />
      )}
    </Overlay>
  )
}
