import { supabase, currentUserId, isDbId } from '../lib/supabase'
import type { WorkoutExercise } from '../types'

/**
 * Remote mode for the workout screen: the big screen (gym tablet) and the phone
 * (/remote) share one `workout_live` row per user through Supabase Realtime.
 * This file holds the shared model, the pure state transitions both sides use,
 * and the row I/O; useLiveWorkoutSync.ts is the React glue.
 */

export interface LiveExercise {
  id: string
  name: string
  muscleGroup: string
  targetSets: number
  targetReps: string
}

export interface SetRow {
  weight: number
  reps: number
  logged: boolean
}

export type LiveRows = Record<string, SetRow[]>

/** The cursor + per-set table: everything that changes while you train. */
export interface LiveProgress {
  exIdx: number
  setIdx: number
  rows: LiveRows
}

export interface LiveWorkout extends LiveProgress {
  planId: string | null
  planName: string
  exercises: LiveExercise[]
  /** Phone → screen: "save and close the workout". */
  finishRequested: boolean
}

/**
 * 'requested' = the phone asked the screen to start `planId` and the screen
 * hasn't published the real workout yet; 'active' = running; 'ended' = saved
 * or abandoned.
 */
export type LiveStatus = 'requested' | 'active' | 'ended'

export interface LiveRecord {
  status: LiveStatus
  /** Server-incremented on every write; strictly increasing, even across workouts. */
  rev: number
  /** Random per-client id of the last writer, to skip the echo of our own write. */
  updatedBy: string | null
  updatedAt: string
  state: LiveWorkout
}

// ── Pure state transitions (used by the screen's WorkoutMode and the phone) ───────

/** First number found in a free-text reps target ("8-12" → 8), or a sane fallback. */
export function parseTargetReps(target: string): number {
  const m = target.match(/\d+/)
  return m ? Number(m[0]) : 10
}

/** Starting kg/reps per set: last time's values when known, else 0 kg × the target reps. */
export function buildInitialRows(
  exercises: Pick<LiveExercise, 'id' | 'targetSets' | 'targetReps'>[],
  previousByExercise: Map<string, { weightKg: number | null; reps: number | null }[]>,
): LiveRows {
  return Object.fromEntries(
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
  )
}

export function toLiveExercise(e: WorkoutExercise): LiveExercise {
  return { id: e.id, name: e.name, muscleGroup: e.muscleGroup, targetSets: e.targetSets, targetReps: e.targetReps }
}

export function goToExercise(p: LiveProgress, exercises: Pick<LiveExercise, 'id'>[], idx: number): LiveProgress {
  if (idx < 0 || idx >= exercises.length || idx === p.exIdx) return p
  const nextRows = p.rows[exercises[idx].id] ?? []
  const firstUnlogged = nextRows.findIndex((r) => !r.logged)
  return { ...p, exIdx: idx, setIdx: firstUnlogged >= 0 ? firstUnlogged : 0 }
}

export function selectSet(p: LiveProgress, setIdx: number): LiveProgress {
  return setIdx === p.setIdx ? p : { ...p, setIdx }
}

/** Patch the kg/reps/logged of the set the cursor is on. */
export function patchCurrentRow(p: LiveProgress, exercises: Pick<LiveExercise, 'id'>[], patch: Partial<SetRow>): LiveProgress {
  const ex = exercises[p.exIdx]
  const exRows = ex ? p.rows[ex.id] : undefined
  if (!ex || !exRows?.[p.setIdx]) return p
  return {
    ...p,
    rows: { ...p.rows, [ex.id]: exRows.map((r, i) => (i === p.setIdx ? { ...r, ...patch } : r)) },
  }
}

/** Mark the current set logged and jump to the next one that still needs doing. */
export function logCurrentSet(p: LiveProgress, exercises: Pick<LiveExercise, 'id'>[]): LiveProgress {
  const ex = exercises[p.exIdx]
  const exRows = ex ? p.rows[ex.id] : undefined
  if (!ex || !exRows?.[p.setIdx]) return p
  const logged = patchCurrentRow(p, exercises, { logged: true })
  const firstUnlogged = exRows.findIndex((r, i) => i !== p.setIdx && !r.logged)
  return firstUnlogged >= 0 ? { ...logged, setIdx: firstUnlogged } : logged
}

export function anyLogged(rows: LiveRows): boolean {
  return Object.values(rows).some((rs) => rs.some((r) => r.logged))
}

/**
 * Compact, key-order-independent identity of a workout's progress. Both sides
 * compare it to decide "is this remote state different from mine?" - a plain
 * JSON.stringify would differ by key order between devices and make them
 * re-publish each other's state forever.
 */
export function fingerprint(w: LiveWorkout): string {
  const rows = w.exercises
    .map((e) => (w.rows[e.id] ?? []).map((r) => `${r.weight},${r.reps},${r.logged ? 1 : 0}`).join(';'))
    .join('|')
  return `${w.exIdx}/${w.setIdx}/${w.finishRequested ? 1 : 0}#${rows}`
}

/**
 * Fold a remote progress snapshot into the screen's own exercise list: the
 * screen owns which exercises exist, so only take rows whose shape still
 * matches (same exercise, same number of sets) and clamp the cursor.
 */
export function mergeRemoteProgress(local: LiveProgress, remote: LiveProgress, exercises: Pick<LiveExercise, 'id'>[]): LiveProgress {
  const rows: LiveRows = {}
  for (const ex of exercises) {
    const mine = local.rows[ex.id] ?? []
    const theirs = remote.rows[ex.id]
    rows[ex.id] = theirs && theirs.length === mine.length ? theirs : mine
  }
  const exIdx = Math.min(Math.max(remote.exIdx, 0), Math.max(exercises.length - 1, 0))
  const setCount = rows[exercises[exIdx]?.id]?.length ?? 0
  const setIdx = Math.min(Math.max(remote.setIdx, 0), Math.max(setCount - 1, 0))
  return { exIdx, setIdx, rows }
}

// ── Row mapping ───────────────────────────────────────────────────────────────────

const COLS = 'status,plan_id,plan_name,exercises,sets,exercise_idx,set_idx,finish_requested,updated_by,rev,updated_at'

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

/**
 * Validate a row (from a fetch or a realtime payload) into a LiveRecord. Null
 * when a column is missing: Realtime omits unchanged TOASTed jsonb from UPDATE
 * payloads, so callers must treat null as "refetch", not as "no workout".
 */
export function parseRecord(r: Record<string, unknown> | null | undefined): LiveRecord | null {
  if (!r || !Array.isArray(r.exercises) || !r.sets || typeof r.sets !== 'object' || typeof r.rev !== 'number') return null
  const exercises: LiveExercise[] = (r.exercises as Record<string, unknown>[])
    .filter((e) => e && typeof e.id === 'string')
    .map((e) => ({
      id: e.id as string,
      name: String(e.name ?? ''),
      muscleGroup: String(e.muscleGroup ?? ''),
      targetSets: num(e.targetSets, 0),
      targetReps: String(e.targetReps ?? ''),
    }))
  const rawSets = r.sets as Record<string, unknown>
  const rows: LiveRows = {}
  for (const ex of exercises) {
    const list = Array.isArray(rawSets[ex.id]) ? (rawSets[ex.id] as Record<string, unknown>[]) : []
    rows[ex.id] = list.map((s) => ({ weight: num(s?.weight, 0), reps: num(s?.reps, 0), logged: s?.logged === true }))
  }
  const exIdx = Math.min(Math.max(num(r.exercise_idx, 0), 0), Math.max(exercises.length - 1, 0))
  const setIdx = Math.min(Math.max(num(r.set_idx, 0), 0), Math.max((rows[exercises[exIdx]?.id]?.length ?? 1) - 1, 0))
  return {
    status: r.status === 'ended' ? 'ended' : r.status === 'requested' ? 'requested' : 'active',
    rev: r.rev,
    updatedBy: (r.updated_by as string) ?? null,
    updatedAt: (r.updated_at as string) ?? '',
    state: {
      planId: (r.plan_id as string) ?? null,
      planName: (r.plan_name as string) ?? '',
      exercises,
      rows,
      exIdx,
      setIdx,
      finishRequested: r.finish_requested === true,
    },
  }
}

// ── Row I/O ───────────────────────────────────────────────────────────────────────

// Writes go through one chain so a quick "end" followed by a "start" (or a
// React StrictMode remount) can't land at the server out of order.
let chain: Promise<unknown> = Promise.resolve()
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn)
  chain = next.catch(() => undefined)
  return next
}

export async function fetchLiveRecord(): Promise<LiveRecord | null> {
  const userId = await currentUserId()
  if (!userId) return null
  const { data, error } = await supabase.from('workout_live').select(COLS).eq('user_id', userId).maybeSingle()
  if (error) console.warn('[OSLIFE] workout_live.fetch', error)
  return parseRecord(data as Record<string, unknown> | null)
}

/** Screen side: (re)start or update the live workout - upserts the full row, status 'active'. */
export function writeLiveWorkout(w: LiveWorkout, clientId: string): Promise<boolean> {
  return enqueue(async () => {
    const user_id = await currentUserId()
    if (!user_id) return false
    const { error } = await supabase.from('workout_live').upsert(
      {
        user_id,
        status: 'active',
        plan_id: w.planId && isDbId(w.planId) ? w.planId : null,
        plan_name: w.planName,
        exercises: w.exercises,
        sets: w.rows,
        exercise_idx: w.exIdx,
        set_idx: w.setIdx,
        finish_requested: w.finishRequested,
        updated_by: clientId,
      },
      { onConflict: 'user_id' },
    )
    if (error) console.warn('[OSLIFE] workout_live.write', error)
    return !error
  })
}

/**
 * Phone side: update only the progress columns, and only while the workout is
 * still active - a late write from the phone must never revive a workout the
 * screen has already saved and ended.
 */
export function writeLiveProgress(w: LiveWorkout, clientId: string): Promise<boolean> {
  return enqueue(async () => {
    const userId = await currentUserId()
    if (!userId) return false
    const { error } = await supabase
      .from('workout_live')
      .update({
        sets: w.rows,
        exercise_idx: w.exIdx,
        set_idx: w.setIdx,
        finish_requested: w.finishRequested,
        updated_by: clientId,
      })
      .eq('user_id', userId)
      .eq('status', 'active')
    if (error) console.warn('[OSLIFE] workout_live.progress', error)
    return !error
  })
}

/**
 * Phone side: ask the (input-less) gym screen to start a plan. Upserts so it
 * works even if the row doesn't exist yet; the screen answers by publishing the
 * real workout, which turns the row 'active'.
 */
export function requestLiveWorkout(plan: { id: string; name: string }, clientId: string): Promise<boolean> {
  return enqueue(async () => {
    const user_id = await currentUserId()
    if (!user_id) return false
    const { error } = await supabase.from('workout_live').upsert(
      {
        user_id,
        status: 'requested',
        plan_id: isDbId(plan.id) ? plan.id : null,
        plan_name: plan.name,
        exercises: [],
        sets: {},
        exercise_idx: 0,
        set_idx: 0,
        finish_requested: false,
        updated_by: clientId,
      },
      { onConflict: 'user_id' },
    )
    if (error) console.warn('[OSLIFE] workout_live.request', error)
    return !error
  })
}

/** Phone side: cancel a pending start or abandon a running workout without saving. */
export function endLiveFromRemote(clientId: string): Promise<boolean> {
  return enqueue(async () => {
    const userId = await currentUserId()
    if (!userId) return false
    const { error } = await supabase
      .from('workout_live')
      .update({ status: 'ended', finish_requested: false, updated_by: clientId })
      .eq('user_id', userId)
    if (error) console.warn('[OSLIFE] workout_live.endRemote', error)
    return !error
  })
}

/** Screen side: the workout was saved or abandoned. */
export function endLiveWorkout(clientId: string): Promise<void> {
  return enqueue(async () => {
    const userId = await currentUserId()
    if (!userId) return
    const { error } = await supabase
      .from('workout_live')
      .update({ status: 'ended', finish_requested: false, updated_by: clientId })
      .eq('user_id', userId)
    if (error) console.warn('[OSLIFE] workout_live.end', error)
  })
}

export type LiveConnection = 'connecting' | 'connected' | 'disconnected'

/**
 * Subscribe to this user's row. `onRecord` gets each parsed change;
 * `onResync` fires on (re)subscribe and whenever a payload can't be parsed -
 * the caller refetches then, which also closes any gap while the socket was down
 * (mobile browsers freeze websockets in the background).
 */
export function subscribeLiveWorkout(
  userId: string,
  handlers: { onRecord: (r: LiveRecord) => void; onResync: () => void; onConnection: (c: LiveConnection) => void },
): () => void {
  const channel = supabase
    .channel(`workout-live-${userId}-${Math.random().toString(36).slice(2, 8)}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'workout_live', filter: `user_id=eq.${userId}` },
      (payload) => {
        const rec = parseRecord(payload.new as Record<string, unknown>)
        if (rec) handlers.onRecord(rec)
        else handlers.onResync()
      },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        handlers.onConnection('connected')
        handlers.onResync()
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        handlers.onConnection('disconnected')
      }
    })
  return () => {
    void supabase.removeChannel(channel)
  }
}
