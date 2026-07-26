import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { today } from '../domains'
import { buildPreviousByExercise } from '../workout/previousSets'
import WorkoutMode from '../workout/WorkoutMode'
import type { WorkoutPlan } from '../types'
import { Play, Dumbbell, Check } from 'lucide-react'

const WEEKDAY_FULL = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag']

/**
 * The gym tablet: launch-and-log only, nothing to configure. Proposes
 * whichever plan is scheduled for today (WorkoutPlan.dayOfWeek) and, once
 * started, hands off to the same full-screen WorkoutMode the phone uses.
 * Plan/exercise editing only happens on the phone (see src/views/Workout.tsx)
 * — this screen never mounts that UI.
 */
export default function GymWorkoutKiosk() {
  const { workoutPlans, workoutExercises, workoutSessions, logWorkoutSession } = useStore()
  const [date, setDate] = useState(today)
  const [activePlan, setActivePlan] = useState<WorkoutPlan | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  // A wall tablet's tab is never closed — recompute "today" so the proposal
  // doesn't freeze at whatever day the page happened to load on.
  useEffect(() => {
    const tick = () => setDate(today())
    const id = window.setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('focus', tick)
    }
  }, [])

  const weekday = new Date(date + 'T00:00:00').getDay()
  const exercisesFor = (planId: string) => workoutExercises.filter((e) => e.planId === planId).sort((a, b) => a.orderIdx - b.orderIdx)
  const todaysPlans = workoutPlans.filter((p) => p.dayOfWeek === weekday)
  const otherPlans = workoutPlans.filter((p) => p.dayOfWeek !== weekday)

  const previousByExercise = useMemo(
    () => buildPreviousByExercise(workoutSessions, workoutExercises),
    [workoutSessions, workoutExercises],
  )

  const startPlan = (p: WorkoutPlan) => setActivePlan(p)

  if (activePlan) {
    return (
      <WorkoutMode
        plan={activePlan}
        exercises={exercisesFor(activePlan.id)}
        previousByExercise={previousByExercise}
        onClose={() => setActivePlan(null)}
        onSave={(sets) => {
          const startedAt = new Date().toISOString()
          logWorkoutSession(
            { planId: activePlan.id, planName: activePlan.name, startedAt, completedAt: new Date().toISOString(), durationMin: null, notes: null },
            sets,
          )
          setActivePlan(null)
          setJustSaved(true)
          window.setTimeout(() => setJustSaved(false), 5000)
        }}
      />
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 md:gap-12 px-8 md:px-16 py-10 text-center">
      <div className="text-xl sm:text-2xl md:text-4xl text-faint capitalize">{WEEKDAY_FULL[weekday]}</div>

      {justSaved && (
        <div className="chip bg-forest/15 text-forest-hi text-base md:text-xl px-4 py-2 md:px-6 md:py-3">
          <Check className="h-4 w-4 md:h-5 md:w-5" /> Training opgeslagen
        </div>
      )}

      {workoutPlans.length === 0 ? (
        <p className="text-lg md:text-2xl text-faint max-w-md">Nog geen trainingsplannen — maak er een op je telefoon.</p>
      ) : todaysPlans.length > 0 ? (
        <div className="flex flex-col gap-5 md:gap-8 w-full max-w-3xl">
          {todaysPlans.map((p) => (
            <PlanHero key={p.id} plan={p} exerciseCount={exercisesFor(p.id).length} onStart={() => startPlan(p)} />
          ))}
        </div>
      ) : (
        <p className="text-lg md:text-2xl text-faint max-w-md">Geen training gepland voor vandaag.</p>
      )}

      {otherPlans.length > 0 && (
        <div className="w-full max-w-4xl">
          <div className="text-sm md:text-lg text-faint uppercase tracking-wide mb-3 md:mb-5">Andere trainingen</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-5">
            {otherPlans.map((p) => {
              const count = exercisesFor(p.id).length
              return (
                <button
                  key={p.id}
                  onClick={() => startPlan(p)}
                  disabled={count === 0}
                  className="card p-4 md:p-6 text-base md:text-xl font-medium text-ink disabled:opacity-40"
                >
                  {p.name}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function PlanHero({ plan, exerciseCount, onStart }: { plan: WorkoutPlan; exerciseCount: number; onStart: () => void }) {
  return (
    <div className="card p-6 md:p-10 flex flex-col items-center gap-4 md:gap-6">
      <span className="inline-flex h-12 w-12 md:h-16 md:w-16 items-center justify-center rounded-2xl bg-sunken">
        <Dumbbell className="h-6 w-6 md:h-8 md:w-8 text-ink-soft" />
      </span>
      <div className="text-2xl sm:text-3xl md:text-5xl font-medium text-ink">{plan.name}</div>
      {plan.muscleGroups.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5 md:gap-2.5">
          {plan.muscleGroups.map((m) => (
            <span key={m} className="chip bg-sunken text-ink-soft md:text-base md:px-3.5 md:py-1">{m}</span>
          ))}
        </div>
      )}
      {exerciseCount === 0 ? (
        <p className="text-sm md:text-lg text-faint">Nog geen oefeningen — voeg toe op je telefoon.</p>
      ) : (
        <button onClick={onStart} className="btn-primary !py-4 md:!py-6 !px-10 md:!px-16 text-lg md:text-2xl mt-2 md:mt-4">
          <Play className="h-5 w-5 md:h-7 md:w-7" /> Start workout
        </button>
      )}
    </div>
  )
}
