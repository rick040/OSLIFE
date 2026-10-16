import { describe, expect, it } from 'vitest'
import {
  anyLogged,
  buildInitialRows,
  fingerprint,
  goToExercise,
  logCurrentSet,
  mergeRemoteProgress,
  parseRecord,
  patchCurrentRow,
  selectSet,
  type LiveExercise,
  type LiveProgress,
  type LiveWorkout,
} from './liveSession'

const exercises: LiveExercise[] = [
  { id: 'a', name: 'Bench press', muscleGroup: 'Chest', targetSets: 3, targetReps: '8-12' },
  { id: 'b', name: 'Dips', muscleGroup: 'Triceps', targetSets: 2, targetReps: '10' },
]

const fresh = (): LiveProgress => ({ exIdx: 0, setIdx: 0, rows: buildInitialRows(exercises, new Map()) })

describe('buildInitialRows', () => {
  it('starts at 0 kg × the first number of the reps target', () => {
    const rows = buildInitialRows(exercises, new Map())
    expect(rows.a).toEqual(Array(3).fill({ weight: 0, reps: 8, logged: false }))
    expect(rows.b).toHaveLength(2)
  })

  it("prefills from last time's sets", () => {
    const rows = buildInitialRows(exercises, new Map([['a', [{ weightKg: 60, reps: 10 }]]]))
    expect(rows.a[0]).toEqual({ weight: 60, reps: 10, logged: false })
    expect(rows.a[1]).toEqual({ weight: 0, reps: 8, logged: false })
  })
})

describe('transitions', () => {
  it('patches only the current set', () => {
    const p = patchCurrentRow(selectSet(fresh(), 1), exercises, { weight: 80 })
    expect(p.rows.a.map((r) => r.weight)).toEqual([0, 80, 0])
  })

  it('logs the set and jumps to the next unlogged one', () => {
    let p = logCurrentSet(fresh(), exercises)
    expect(p.rows.a[0].logged).toBe(true)
    expect(p.setIdx).toBe(1)
    p = logCurrentSet(selectSet(p, 2), exercises)
    expect(p.setIdx).toBe(1) // set 2 is the only one left
    p = logCurrentSet(p, exercises)
    expect(p.rows.a.every((r) => r.logged)).toBe(true)
    expect(p.setIdx).toBe(1) // everything done: stay put
  })

  it('moves between exercises to the first unlogged set, and ignores out-of-range', () => {
    let p = goToExercise(fresh(), exercises, 1)
    expect(p.exIdx).toBe(1)
    expect(goToExercise(p, exercises, 2)).toBe(p)
    expect(goToExercise(p, exercises, -1)).toBe(p)
    p = logCurrentSet(p, exercises)
    p = goToExercise(goToExercise(p, exercises, 0), exercises, 1)
    expect(p.setIdx).toBe(1) // set 1 of Dips is already logged
  })

  it('detects logged sets', () => {
    expect(anyLogged(fresh().rows)).toBe(false)
    expect(anyLogged(logCurrentSet(fresh(), exercises).rows)).toBe(true)
  })
})

describe('fingerprint', () => {
  const live = (p: LiveProgress, finishRequested = false): LiveWorkout => ({
    planId: null,
    planName: 'Push',
    exercises,
    finishRequested,
    ...p,
  })

  it('is stable for equal progress regardless of object key order', () => {
    const p = fresh()
    const reordered: LiveProgress = {
      rows: { b: p.rows.b, a: p.rows.a.map((r) => ({ logged: r.logged, reps: r.reps, weight: r.weight })) },
      setIdx: 0,
      exIdx: 0,
    }
    expect(fingerprint(live(reordered))).toBe(fingerprint(live(p)))
  })

  it('changes with the cursor, any set value, and the finish request', () => {
    const base = fingerprint(live(fresh()))
    expect(fingerprint(live(selectSet(fresh(), 1)))).not.toBe(base)
    expect(fingerprint(live(goToExercise(fresh(), exercises, 1)))).not.toBe(base)
    expect(fingerprint(live(patchCurrentRow(fresh(), exercises, { reps: 9 })))).not.toBe(base)
    expect(fingerprint(live(fresh(), true))).not.toBe(base)
  })
})

describe('mergeRemoteProgress', () => {
  it('takes the remote cursor and sets', () => {
    const remote = logCurrentSet(patchCurrentRow(fresh(), exercises, { weight: 70 }), exercises)
    expect(mergeRemoteProgress(fresh(), remote, exercises)).toEqual(remote)
  })

  it('keeps local rows whose shape changed and clamps a bad cursor', () => {
    const remote: LiveProgress = { exIdx: 9, setIdx: 9, rows: { a: [{ weight: 1, reps: 1, logged: true }], b: fresh().rows.b } }
    const merged = mergeRemoteProgress(fresh(), remote, exercises)
    expect(merged.rows.a).toEqual(fresh().rows.a) // 1 set vs 3 locally: ignored
    expect(merged.exIdx).toBe(1)
    expect(merged.setIdx).toBe(1)
  })
})

describe('parseRecord', () => {
  const row = {
    status: 'active',
    plan_id: null,
    plan_name: 'Push',
    exercises,
    sets: { a: [{ weight: 50, reps: 8, logged: true }], b: [] },
    exercise_idx: 0,
    set_idx: 0,
    finish_requested: false,
    updated_by: 'phone-1',
    rev: 4,
    updated_at: '2026-10-16T10:00:00Z',
  }

  it('parses a well-formed row', () => {
    const rec = parseRecord(row)
    expect(rec?.rev).toBe(4)
    expect(rec?.updatedBy).toBe('phone-1')
    expect(rec?.state.rows.a[0]).toEqual({ weight: 50, reps: 8, logged: true })
  })

  it('returns null when the payload lacks columns (TOAST-omitted jsonb) so callers refetch', () => {
    const { exercises: _omit, ...rest } = row
    expect(parseRecord(rest)).toBeNull()
    expect(parseRecord(null)).toBeNull()
  })

  it('clamps an out-of-range cursor and tolerates junk set values', () => {
    const rec = parseRecord({ ...row, exercise_idx: 7, set_idx: 5, sets: { a: [{ weight: 'x', logged: 'yes' }] } })
    expect(rec?.state.exIdx).toBe(1)
    expect(rec?.state.rows.a[0]).toEqual({ weight: 0, reps: 0, logged: false })
  })

  it('maps an ended workout', () => {
    expect(parseRecord({ ...row, status: 'ended' })?.status).toBe('ended')
  })
})
