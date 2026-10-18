import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { today } from '../domains'
import { buildPreviousByExercise } from '../workout/previousSets'
import WorkoutMode from '../workout/WorkoutMode'
import { useLiveStartRequests } from '../workout/useLiveStartRequests'
import type { WorkoutPlan } from '../types'
import { Play, Dumbbell, Check, Smartphone } from 'lucide-react'
import { HealthPanels, KioskHeader, TrainingWeekLine } from './GymDashboard'
import { NowPlayingBar, useNowPlaying } from './NowPlaying'

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
  const nowPlaying = useNowPlaying()

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

  // The screen has no input: the phone (/remote) picks a plan and starts it here.
  // Wait for the plans to load so a request can always be resolved.
  useLiveStartRequests(!activePlan && workoutPlans.length > 0, (planId) => {
    const plan = workoutPlans.find((p) => p.id === planId)
    if (plan && exercisesFor(plan.id).length > 0) startPlan(plan)
  })

  if (activePlan) {
    return (
      <WorkoutMode
        plan={activePlan}
        exercises={exercisesFor(activePlan.id)}
        previousByExercise={previousByExercise}
        liveSync
        kiosk
        nowPlaying={nowPlaying}
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
    <div className={`min-h-screen flex flex-col gap-5 md:gap-8 px-6 md:px-12 pt-6 md:pt-10 ${nowPlaying ? 'pb-32 md:pb-44' : 'pb-8 md:pb-12'}`}>
      <KioskHeader />

      {/* Today's training: the reason the screen is in the gym */}
      <section className="flex flex-col gap-4 md:gap-6">
        {justSaved && (
          <div className="chip self-start bg-forest/15 text-forest-hi text-base md:text-xl px-4 py-2 md:px-6 md:py-3">
            <Check className="h-4 w-4 md:h-5 md:w-5" /> Training opgeslagen
          </div>
        )}

        {workoutPlans.length === 0 ? (
          <p className="text-lg md:text-2xl text-faint">Nog geen trainingsplannen. Maak er een op je telefoon.</p>
        ) : todaysPlans.length > 0 ? (
          todaysPlans.map((p) => (
            <PlanHero key={p.id} plan={p} exerciseCount={exercisesFor(p.id).length} onStart={() => startPlan(p)} />
          ))
        ) : (
          <div className="card p-5 md:p-7 text-lg md:text-2xl text-muted">Geen training gepland voor vandaag.</div>
        )}

        {otherPlans.length > 0 && (
          <div>
            <div className="text-sm md:text-lg text-faint uppercase tracking-wide mb-2 md:mb-3">Andere trainingen</div>
            <div className="grid grid-cols-3 gap-3 md:gap-4">
              {otherPlans.map((p) => {
                const count = exercisesFor(p.id).length
                return (
                  <button
                    key={p.id}
                    onClick={() => startPlan(p)}
                    disabled={count === 0}
                    className="card p-3 md:p-5 text-sm md:text-xl font-medium text-ink text-left disabled:opacity-40"
                  >
                    {p.name}
                    <span className="block text-xs md:text-base text-faint font-normal mt-1">{count} {count === 1 ? 'oefening' : 'oefeningen'}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <TrainingWeekLine />

        <div className="text-sm md:text-lg text-faint inline-flex items-center gap-2">
          <Smartphone className="h-4 w-4 md:h-5 md:w-5" aria-hidden />
          Bedien de training met je telefoon: {window.location.host}/remote
        </div>
      </section>

      <HealthPanels />

      <NowPlayingBar np={nowPlaying} />
    </div>
  )
}

function PlanHero({ plan, exerciseCount, onStart }: { plan: WorkoutPlan; exerciseCount: number; onStart: () => void }) {
  return (
    <div className="card p-5 md:p-8 flex flex-col gap-3 md:gap-5">
      <div className="flex items-center gap-3 md:gap-4">
        <span className="inline-flex h-11 w-11 md:h-14 md:w-14 shrink-0 items-center justify-center rounded-2xl bg-sunken">
          <Dumbbell className="h-5 w-5 md:h-7 md:w-7 text-ink-soft" />
        </span>
        <div className="min-w-0">
          <div className="text-xs md:text-base text-faint uppercase tracking-wide">Vandaag · {exerciseCount} oefeningen</div>
          <div className="text-2xl md:text-4xl font-medium text-ink">{plan.name}</div>
        </div>
      </div>
      {plan.muscleGroups.length > 0 && (
        <div className="flex flex-wrap gap-1.5 md:gap-2.5">
          {plan.muscleGroups.map((m) => (
            <span key={m} className="chip bg-sunken text-ink-soft md:text-base md:px-3.5 md:py-1">{m}</span>
          ))}
        </div>
      )}
      {exerciseCount === 0 ? (
        <p className="text-sm md:text-lg text-faint">Nog geen oefeningen — voeg toe op je telefoon.</p>
      ) : (
        <button onClick={onStart} className="btn-primary !py-4 md:!py-5 text-lg md:text-2xl w-full">
          <Play className="h-5 w-5 md:h-7 md:w-7" /> Start workout
        </button>
      )}
    </div>
  )
}
