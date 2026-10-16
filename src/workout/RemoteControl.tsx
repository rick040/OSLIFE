import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { fetchWorkoutExercises, fetchWorkoutPlans, supabase } from '../lib/supabase'
import LoginScreen from '../components/LoginScreen'
import { ConfirmDialog } from '../components/ui'
import { BigStepper } from './WorkoutMode'
import { useLiveWorkoutSync } from './useLiveWorkoutSync'
import {
  anyLogged,
  endLiveFromRemote,
  goToExercise,
  logCurrentSet,
  patchCurrentRow,
  requestLiveWorkout,
  selectSet,
  type LiveProgress,
  type LiveStatus,
  type LiveWorkout,
  type SetRow,
} from './liveSession'
import type { WorkoutPlan } from '../types'
import { Check, ChevronLeft, ChevronRight, Dumbbell, Flag, Play, X } from 'lucide-react'

// A screen that vanished without ending its workout (tab killed, tablet off)
// leaves the row 'active'; don't present a day-old workout as live.
const STALE_MS = 6 * 60 * 60 * 1000
// A start request the screen never answered (screen off / not on /tablet/workout).
const REQUEST_STALE_MS = 5 * 60 * 1000
const SLOW_HINT_MS = 15 * 1000

/**
 * /remote - the phone as the controller for the gym screen's workout. The
 * screen (GymWorkoutKiosk → WorkoutMode) shows the exercise, image and
 * progress; this shows only the controls and syncs through the `workout_live`
 * row. It needs nothing from the rest of OSLIFE, so it skips the store's full
 * data load and only handles auth.
 */
export default function RemoteApp() {
  const [session, setSession] = useState<Session | null>(null)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthChecked(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="h-8 w-8 rounded-full border-2 border-forest border-t-transparent animate-spin" />
      </div>
    )
  }
  if (!session) return <LoginScreen />
  return <RemoteControl />
}

function RemoteControl() {
  const [live, setLive] = useState<LiveWorkout | null>(null)
  const [status, setStatus] = useState<LiveStatus | null>(null)
  const [updatedAt, setUpdatedAt] = useState('')
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [confirmAbort, setConfirmAbort] = useState(false)
  const [plans, setPlans] = useState<{ plan: WorkoutPlan; exerciseCount: number }[] | null>(null)
  const [startError, setStartError] = useState(false)
  const [slow, setSlow] = useState(false)

  const { connection, loaded, clientId } = useLiveWorkoutSync({
    enabled: true,
    mode: 'remote',
    // Only a running workout has progress to publish; a pending request or an
    // ended row must not be written back as progress.
    state: status === 'active' ? live : null,
    onRemote: (rec) => {
      setLive(rec.state)
      setStatus(rec.status)
      setUpdatedAt(rec.updatedAt)
    },
  })

  // Plans to pick from: same tables the screen reads, fetched directly so the
  // phone doesn't need the full app store.
  useEffect(() => {
    void Promise.all([fetchWorkoutPlans(), fetchWorkoutExercises()]).then(([ps, exs]) => {
      const today = new Date().getDay()
      const withCounts = ps.map((plan) => ({ plan, exerciseCount: exs.filter((e) => e.planId === plan.id).length }))
      // Today's plan first, then the rest in their usual order.
      withCounts.sort((a, b) => Number(b.plan.dayOfWeek === today) - Number(a.plan.dayOfWeek === today))
      setPlans(withCounts)
    })
  }, [])

  // Keep the phone awake while it's the controller - it's in your hand between sets.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    const acquire = () => {
      if (document.visibilityState !== 'visible') return
      navigator.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {})
    }
    acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      document.removeEventListener('visibilitychange', acquire)
      void lock?.release().catch(() => {})
    }
  }, [])

  const edit = (fn: (p: LiveProgress, exercises: LiveWorkout['exercises']) => LiveProgress) =>
    setLive((w) => (w && !w.finishRequested ? { ...w, ...fn(w, w.exercises) } : w))

  const age = updatedAt !== '' ? Date.now() - Date.parse(updatedAt) : 0
  const stale = age > STALE_MS
  const running = live !== null && status === 'active' && !stale && live.exercises.length > 0
  const pending = status === 'requested' && age < REQUEST_STALE_MS

  // If the screen doesn't pick the request up within a few seconds, say why.
  useEffect(() => {
    setSlow(false)
    if (!pending) return
    const id = window.setTimeout(() => setSlow(true), SLOW_HINT_MS)
    return () => window.clearTimeout(id)
  }, [pending])

  const startPlan = async (plan: WorkoutPlan) => {
    setStartError(false)
    const ok = await requestLiveWorkout(plan, clientId)
    if (!ok) return setStartError(true)
    // Our own write's echo is skipped by the sync hook, so reflect it here.
    setLive(null)
    setStatus('requested')
    setUpdatedAt(new Date().toISOString())
    navigator.vibrate?.(30)
  }

  const endWorkout = async () => {
    const ok = await endLiveFromRemote(clientId)
    if (!ok) return
    setLive(null)
    setStatus('ended')
    setUpdatedAt(new Date().toISOString())
  }

  if (!loaded) return <Shell connection={connection}><Centered>Verbinden…</Centered></Shell>

  if (pending) {
    return (
      <Shell connection={connection}>
        <Centered>
          <div className="h-8 w-8 rounded-full border-2 border-forest border-t-transparent animate-spin" />
          <div className="text-xl font-medium text-ink">{live?.planName || 'Workout'} starten…</div>
          <p className="text-sm text-faint max-w-xs">
            {slow
              ? 'Het scherm reageert nog niet. Staat /tablet/workout open en ingelogd op het scherm?'
              : 'Het gymscherm opent de training.'}
          </p>
          <button onClick={() => void endWorkout()} className="mt-2 text-sm text-faint underline">
            Annuleren
          </button>
        </Centered>
      </Shell>
    )
  }

  if (!running || !live) {
    const justEnded = status === 'ended' && !stale
    return (
      <Shell connection={connection}>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-6 pt-2">
          <div className="text-2xl font-medium text-ink">Kies je training</div>
          {justEnded && <p className="mt-1 text-sm text-faint">Vorige workout is afgerond.</p>}
          {startError && <p className="mt-1 text-sm text-red-600">Starten is niet gelukt, probeer het opnieuw.</p>}
          <div className="mt-4 space-y-3">
            {plans === null ? (
              <p className="text-sm text-faint">Trainingen laden…</p>
            ) : plans.length === 0 ? (
              <p className="text-sm text-faint">Nog geen trainingsplannen; maak er een aan in OSLIFE.</p>
            ) : (
              plans.map(({ plan, exerciseCount }, i) => {
                const isToday = plan.dayOfWeek === new Date().getDay()
                return (
                  <button
                    key={plan.id}
                    onClick={() => void startPlan(plan)}
                    disabled={exerciseCount === 0}
                    className={`card w-full p-5 text-left flex items-center gap-4 disabled:opacity-40 ${i === 0 && isToday ? 'ring-2 ring-forest' : ''}`}
                  >
                    <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sunken">
                      <Dumbbell className="h-6 w-6 text-ink-soft" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-lg font-medium text-ink truncate">{plan.name}</span>
                      <span className="block text-sm text-faint truncate">
                        {exerciseCount === 0 ? 'Nog geen oefeningen' : `${exerciseCount} oefeningen`}
                        {isToday ? ' · vandaag' : ''}
                      </span>
                    </span>
                    {exerciseCount > 0 && <Play className="h-5 w-5 text-forest shrink-0" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      </Shell>
    )
  }

  const ex = live.exercises[live.exIdx]
  const exRows = live.rows[ex.id] ?? []
  const row: SetRow | undefined = exRows[live.setIdx]
  const waiting = live.finishRequested
  const loggedCount = Object.values(live.rows).reduce((n, rs) => n + rs.filter((r) => r.logged).length, 0)

  return (
    <Shell connection={connection} subtitle={`${live.planName} · oefening ${live.exIdx + 1}/${live.exercises.length}`}>
      <div className="flex-1 min-h-0 flex flex-col justify-center gap-5 px-5 pb-3">
        <div className="text-center space-y-2">
          <div className="text-2xl font-medium text-ink leading-tight">{ex.name}</div>
          <div className="flex justify-center gap-2">
            <span className="chip bg-sunken text-ink-soft">{ex.muscleGroup}</span>
            <span className="chip bg-sunken text-ink-soft">
              {ex.targetSets}×{ex.targetReps}
            </span>
          </div>
        </div>

        <div className="flex justify-center gap-2.5 flex-wrap">
          {exRows.map((r, i) => (
            <button
              key={i}
              onClick={() => edit((p) => selectSet(p, i))}
              disabled={waiting}
              className={`h-11 w-11 rounded-full text-sm font-medium flex items-center justify-center transition-colors ${
                r.logged ? 'bg-forest text-canvas' : i === live.setIdx ? 'bg-ink text-canvas' : 'bg-sunken text-muted'
              }`}
              aria-label={`Set ${i + 1}`}
            >
              {r.logged ? <Check className="h-5 w-5" /> : i + 1}
            </button>
          ))}
        </div>

        {row && (
          <div className="grid grid-cols-2 gap-3">
            <BigStepper label="kg" value={row.weight} step={2.5} onChange={(v) => edit((p, e) => patchCurrentRow(p, e, { weight: v }))} />
            <BigStepper label="reps" value={row.reps} step={1} onChange={(v) => edit((p, e) => patchCurrentRow(p, e, { reps: v }))} />
          </div>
        )}

        <button
          onClick={() => {
            navigator.vibrate?.(30)
            edit((p, e) => logCurrentSet(p, e))
          }}
          disabled={waiting || !row}
          className="btn-primary w-full !py-5 text-lg"
        >
          <Check className="h-5 w-5" /> {row?.logged ? 'Set opnieuw loggen' : 'Set loggen'}
        </button>
      </div>

      <div className="shrink-0 px-5 pb-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => edit((p, e) => goToExercise(p, e, p.exIdx - 1))}
            disabled={waiting || live.exIdx === 0}
            className="h-14 flex-1 rounded-2xl bg-sunken flex items-center justify-center gap-1 text-ink disabled:opacity-30"
            aria-label="Vorige oefening"
          >
            <ChevronLeft className="h-6 w-6" /> Vorige
          </button>
          <button
            onClick={() => edit((p, e) => goToExercise(p, e, p.exIdx + 1))}
            disabled={waiting || live.exIdx === live.exercises.length - 1}
            className="h-14 flex-1 rounded-2xl bg-sunken flex items-center justify-center gap-1 text-ink disabled:opacity-30"
            aria-label="Volgende oefening"
          >
            Volgende <ChevronRight className="h-6 w-6" />
          </button>
        </div>
        <button
          onClick={() => setConfirmFinish(true)}
          disabled={waiting || !anyLogged(live.rows)}
          className="w-full py-2.5 text-sm text-faint disabled:opacity-40 flex items-center justify-center gap-1.5"
        >
          <Flag className="h-4 w-4" /> {waiting ? 'Wachten op het scherm…' : 'Workout voltooien'}
        </button>
        {waiting ? (
          <button
            onClick={() => setLive((w) => (w ? { ...w, finishRequested: false } : w))}
            className="w-full text-xs text-faint underline"
          >
            Annuleren
          </button>
        ) : (
          <button onClick={() => setConfirmAbort(true)} className="w-full py-1.5 text-xs text-faint flex items-center justify-center gap-1">
            <X className="h-3.5 w-3.5" /> Workout afbreken
          </button>
        )}
      </div>

      {confirmAbort && (
        <ConfirmDialog
          title="Workout afbreken?"
          message="Het scherm sluit de workout zonder iets op te slaan."
          confirmLabel="Afbreken"
          cancelLabel="Verder"
          onCancel={() => setConfirmAbort(false)}
          onConfirm={() => {
            setConfirmAbort(false)
            void endWorkout()
          }}
        />
      )}
      {confirmFinish && (
        <ConfirmDialog
          title="Workout afronden?"
          message={`Het scherm slaat de ${loggedCount} gelogde ${loggedCount === 1 ? 'set' : 'sets'} op en sluit de workout.`}
          confirmLabel="Opslaan"
          cancelLabel="Verder"
          danger={false}
          onCancel={() => setConfirmFinish(false)}
          onConfirm={() => {
            setConfirmFinish(false)
            setLive((w) => (w ? { ...w, finishRequested: true } : w))
          }}
        />
      )}
    </Shell>
  )
}

function Shell({
  connection,
  subtitle,
  children,
}: {
  connection: 'connecting' | 'connected' | 'disconnected'
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="h-[100dvh] bg-canvas flex flex-col overflow-hidden">
      <div className="shrink-0 flex items-center justify-between gap-3 px-5 pt-4 pb-2 text-xs text-faint">
        <span className="truncate">{subtitle ?? 'Workout remote'}</span>
        <span className="inline-flex items-center gap-1.5 shrink-0">
          <span className={`h-2 w-2 rounded-full ${connection === 'connected' ? 'bg-forest' : 'bg-faint/50'}`} />
          {connection === 'connected' ? 'verbonden' : connection === 'connecting' ? 'verbinden…' : 'geen verbinding'}
        </span>
      </div>
      {children}
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center text-faint">{children}</div>
}
