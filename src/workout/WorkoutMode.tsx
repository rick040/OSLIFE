import { useEffect, useMemo, useRef, useState } from 'react'
import { Overlay, ConfirmDialog, SegmentedProgress } from '../components/ui'
import type { WorkoutPlan, WorkoutExercise, WorkoutSet } from '../types'
import { X, Check, ChevronLeft, ChevronRight, Minus, Plus, Dumbbell, Smartphone } from 'lucide-react'
import {
  anyLogged,
  buildInitialRows,
  goToExercise,
  logCurrentSet,
  mergeRemoteProgress,
  patchCurrentRow,
  selectSet,
  toLiveExercise,
  type LiveProgress,
  type LiveRecord,
  type LiveWorkout,
  type SetRow,
} from './liveSession'
import { useLiveWorkoutSync } from './useLiveWorkoutSync'

type LoggedSet = { exerciseId: string; exerciseName: string; muscleGroup: string; setNumber: number; weightKg: number | null; reps: number | null }

export function fmtWeight(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

/**
 * Sized by its flex-1 parent (h-full/max-h-full), not a fixed vh guess — it
 * fills exactly whatever room is left after the name/chips/nav chrome below
 * it, so it scales correctly on both a tall phone and a short landscape
 * tablet without either overflowing or leaving a giant dead gap above it.
 */
function ExerciseVisual({ ex }: { ex: WorkoutExercise }) {
  const src = ex.gifUrl || ex.imageUrl
  const [broken, setBroken] = useState(false)
  if (!src || broken) {
    return (
      <div className="h-full max-h-full w-auto max-w-full aspect-square rounded-3xl bg-sunken flex items-center justify-center">
        <Dumbbell className="h-14 w-14 md:h-20 md:w-20 text-faint" />
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={ex.name}
      onError={() => setBroken(true)}
      className="h-full max-h-full w-auto max-w-full aspect-square rounded-3xl object-cover bg-sunken"
    />
  )
}

export function BigStepper({
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
    <div className="flex flex-col items-center gap-1 md:gap-2 rounded-2xl bg-sunken py-3 md:py-4">
      <div className="flex items-center gap-2 md:gap-4">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))}
          className="h-12 w-12 md:h-14 md:w-14 shrink-0 rounded-full bg-surface flex items-center justify-center active:scale-90 transition-transform"
          aria-label={`${label} verlagen`}
        >
          <Minus className="h-5 w-5 md:h-6 md:w-6 text-ink" />
        </button>
        <span className="text-4xl md:text-5xl lg:text-6xl font-semibold tabular-nums w-16 md:w-24 text-center text-ink">{fmtWeight(value)}</span>
        <button
          type="button"
          onClick={() => onChange(+(value + step).toFixed(2))}
          className="h-12 w-12 md:h-14 md:w-14 shrink-0 rounded-full bg-surface flex items-center justify-center active:scale-90 transition-transform"
          aria-label={`${label} verhogen`}
        >
          <Plus className="h-5 w-5 md:h-6 md:w-6 text-ink" />
        </button>
      </div>
      <span className="text-[11px] md:text-sm text-faint uppercase tracking-wide">{label}</span>
    </div>
  )
}

export default function WorkoutMode({
  plan,
  exercises,
  previousByExercise,
  liveSync = false,
  onClose,
  onSave,
}: {
  plan: WorkoutPlan
  exercises: WorkoutExercise[]
  previousByExercise: Map<string, WorkoutSet[]>
  /** Mirror this workout to `workout_live` so a phone at /remote can drive it (the gym screen sets this). */
  liveSync?: boolean
  onClose: () => void
  onSave: (sets: LoggedSet[]) => void
}) {
  const [confirmExit, setConfirmExit] = useState(false)
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const [progress, setProgress] = useState<LiveProgress>(() => ({
    exIdx: 0,
    setIdx: 0,
    rows: buildInitialRows(exercises, previousByExercise),
  }))
  const { exIdx, setIdx, rows } = progress

  const ex = exercises[exIdx]
  const exRows = rows[ex.id] ?? []
  const row = exRows[setIdx]
  const prev = previousByExercise.get(ex.id) ?? []

  const logged = useMemo(() => anyLogged(rows), [rows])

  const goToExerciseIdx = (idx: number) => setProgress((p) => goToExercise(p, exercises, idx))
  const goNext = () => goToExerciseIdx(exIdx + 1)
  const goPrev = () => goToExerciseIdx(exIdx - 1)
  const patchRow = (patch: Partial<SetRow>) => setProgress((p) => patchCurrentRow(p, exercises, patch))
  const logSet = () => setProgress((p) => logCurrentSet(p, exercises))

  const finishWith = (finalRows: LiveProgress['rows']) => {
    const sets: LoggedSet[] = []
    for (const e of exercises) {
      ;(finalRows[e.id] ?? []).forEach((r, i) => {
        if (!r.logged) return
        sets.push({ exerciseId: e.id, exerciseName: e.name, muscleGroup: e.muscleGroup, setNumber: i + 1, weightKg: r.weight, reps: r.reps })
      })
    }
    onSave(sets)
  }
  const finish = () => finishWith(rows)
  // The remote-sync callback outlives a render; keep it pointed at the latest closures.
  const progressRef = useRef(progress)
  progressRef.current = progress
  const finishWithRef = useRef(finishWith)
  finishWithRef.current = finishWith

  // Remote mode: publish this workout and apply what the phone changes.
  const liveExercises = useMemo(() => exercises.map(toLiveExercise), [exercises])
  const liveState = useMemo<LiveWorkout>(
    () => ({ planId: plan.id, planName: plan.name, exercises: liveExercises, ...progress, finishRequested: false }),
    [plan.id, plan.name, liveExercises, progress],
  )
  const { connection } = useLiveWorkoutSync({
    enabled: liveSync,
    mode: 'screen',
    state: liveState,
    onRemote: (rec: LiveRecord) => {
      if (rec.status !== 'active') return
      const merged = mergeRemoteProgress(progressRef.current, rec.state, exercises)
      if (rec.state.finishRequested) {
        // Phone pressed "Voltooien": save exactly what it saw, but never an empty session.
        if (anyLogged(merged.rows)) finishWithRef.current(merged.rows)
        return
      }
      setProgress(merged)
    },
  })

  const requestClose = () => {
    if (logged) setConfirmExit(true)
    else onClose()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setProgress((p) => goToExercise(p, exercises, p.exIdx + 1))
      else if (e.key === 'ArrowLeft') setProgress((p) => goToExercise(p, exercises, p.exIdx - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [exercises])

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
        <div className="flex items-center gap-2 md:gap-4 px-4 md:px-10 pt-3 md:pt-5 shrink-0">
          <button onClick={requestClose} className="text-faint hover:text-ink p-1.5 shrink-0" aria-label="Sluiten workout mode">
            <X className="h-5 w-5 md:h-7 md:w-7" />
          </button>
          <div className="flex-1 min-w-0">
            <SegmentedProgress done={exIdx + 1} total={exercises.length} />
          </div>
          <button onClick={finish} className="btn-primary !py-1.5 !px-3 md:!py-2.5 md:!px-5 text-xs md:text-base shrink-0">Voltooien</button>
        </div>
        <div className="text-center text-[11px] md:text-sm text-faint pt-1 pb-0.5 md:pt-1.5 md:pb-1 shrink-0">
          {plan.name} · oefening {exIdx + 1}/{exercises.length}
          {liveSync && (
            <span className="ml-3 inline-flex items-center gap-1 align-middle" title="Open dit adres op je telefoon om de workout te bedienen">
              <Smartphone className="h-3 w-3 md:h-4 md:w-4" />
              {window.location.host}/remote
              <span
                className={`ml-1 inline-block h-1.5 w-1.5 rounded-full ${connection === 'connected' ? 'bg-forest' : 'bg-faint/50'}`}
                aria-label={connection === 'connected' ? 'Remote verbonden' : 'Remote niet verbonden'}
              />
            </span>
          )}
        </div>

        {/* visual + info — the image is the only flexible piece: it fills
            whatever room is left above the fixed name/chips block, instead of
            a fixed size that leaves a dead gap on a tall screen or overflows
            a short one. overflow-y-auto is just a safety net for extreme cases
            (e.g. a very long name wrapping on a tiny screen). */}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center px-6 py-2">
          <div className="flex-1 min-h-0 w-full flex items-center justify-center">
            <ExerciseVisual ex={ex} />
          </div>
          <div className="shrink-0 flex flex-col items-center gap-1.5 md:gap-2.5 pt-2 md:pt-3">
            <div className="text-lg md:text-2xl lg:text-3xl font-medium text-ink text-center">{ex.name}</div>
            <div className="flex items-center gap-2 md:gap-3">
              <span className="chip bg-sunken text-ink-soft md:text-base md:px-3 md:py-1">{ex.muscleGroup}</span>
              <span className="chip bg-sunken text-ink-soft md:text-base md:px-3 md:py-1">{ex.targetSets}×{ex.targetReps}</span>
            </div>
            {prev[setIdx] && (
              <p className="text-xs md:text-base text-faint">Vorige keer set {setIdx + 1}: {prev[setIdx].weightKg ?? '–'}kg × {prev[setIdx].reps ?? '–'}</p>
            )}
          </div>
        </div>

        {/* set pills */}
        <div className="flex justify-center gap-2 md:gap-3 pb-2 md:pb-3 shrink-0">
          {exRows.map((r, i) => (
            <button
              key={i}
              onClick={() => setProgress((p) => selectSet(p, i))}
              className={`h-8 w-8 md:h-10 md:w-10 rounded-full text-xs md:text-base font-medium flex items-center justify-center transition-colors ${
                r.logged ? 'bg-forest text-canvas' : i === setIdx ? 'bg-ink text-canvas' : 'bg-sunken text-muted'
              }`}
              aria-label={`Set ${i + 1}`}
            >
              {r.logged ? <Check className="h-4 w-4 md:h-5 md:w-5" /> : i + 1}
            </button>
          ))}
        </div>

        {/* steppers */}
        <div className="grid grid-cols-2 gap-3 md:gap-5 px-6 md:px-10 pb-2 md:pb-4 shrink-0 max-w-3xl mx-auto w-full">
          <BigStepper label="kg" value={row.weight} step={2.5} onChange={(v) => patchRow({ weight: v })} />
          <BigStepper label="reps" value={row.reps} step={1} onChange={(v) => patchRow({ reps: v })} />
        </div>

        {/* log button */}
        <div className="px-6 md:px-10 pb-2 md:pb-4 shrink-0 max-w-3xl mx-auto w-full">
          <button onClick={logSet} className="btn-primary w-full !py-3.5 md:!py-4 text-base md:text-xl">
            <Check className="h-4 w-4 md:h-6 md:w-6" /> {row.logged ? 'Set opnieuw loggen' : 'Set loggen'}
          </button>
        </div>

        {/* nav */}
        <div className="flex items-center justify-between px-6 md:px-14 pb-4 md:pb-6 shrink-0">
          <button
            onClick={goPrev}
            disabled={exIdx === 0}
            className="h-12 w-12 md:h-14 md:w-14 rounded-full bg-sunken flex items-center justify-center disabled:opacity-30"
            aria-label="Vorige oefening"
          >
            <ChevronLeft className="h-5 w-5 md:h-6 md:w-6" />
          </button>
          <span className="text-[11px] md:text-sm text-faint">swipe voor volgende oefening</span>
          <button
            onClick={goNext}
            disabled={exIdx === exercises.length - 1}
            className="h-12 w-12 md:h-14 md:w-14 rounded-full bg-sunken flex items-center justify-center disabled:opacity-30"
            aria-label="Volgende oefening"
          >
            <ChevronRight className="h-5 w-5 md:h-6 md:w-6" />
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
