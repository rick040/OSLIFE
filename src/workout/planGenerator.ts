// Auto-generates a multi-day training split from the exercise library —
// the user picks which muscles to train and across how many days, and this
// fills in concrete exercises (with library images) instead of them having
// to build every plan by hand.

import { titleCase, type LibraryExercise } from './exerciseLibrary'

export interface GeneratedExercise {
  name: string
  muscleGroup: string
  targetSets: number
  targetReps: string
  imageUrl: string
  gifUrl: string
}

export interface GeneratedDay {
  name: string
  dayOfWeek: number | null
  muscleGroups: string[]
  exercises: GeneratedExercise[]
}

/** Quick-fill presets for the muscle picker — a starting point, not a fixed algorithm; the user can still edit the selection before generating. */
export const SPLIT_PRESETS: Record<string, string[]> = {
  'Full Body': ['Pectorals', 'Lats', 'Quads', 'Hamstrings', 'Glutes', 'Delts', 'Biceps', 'Triceps', 'Abs'],
  'Upper / Lower': ['Pectorals', 'Lats', 'Upper Back', 'Delts', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves'],
  'Push / Pull / Legs': ['Pectorals', 'Delts', 'Triceps', 'Lats', 'Upper Back', 'Biceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves'],
  'Bro split': ['Pectorals', 'Lats', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Delts', 'Biceps', 'Triceps'],
}

/** Spreads `count` training days as evenly as possible across the week, starting at `startDay` (0=Sun..6=Sat). */
export function spacedWeekdays(count: number, startDay = 1): number[] {
  if (count <= 0) return []
  if (count >= 7) return [0, 1, 2, 3, 4, 5, 6]
  const seen = new Set<number>()
  const days: number[] = []
  for (let i = 0; i < count; i++) {
    const d = (startDay + Math.round((i * 7) / count)) % 7
    if (!seen.has(d)) {
      seen.add(d)
      days.push(d)
    }
  }
  return days
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** Auto-names a day from its distinct muscle groups: short lists spelled out, longer ones summarized. */
function nameDay(muscles: string[]): string {
  const distinct = [...new Set(muscles)]
  if (distinct.length === 0) return 'Training'
  if (distinct.length <= 3) return distinct.join(' + ')
  return `${distinct.slice(0, 2).join(' + ')} + meer`
}

export interface GeneratePlanOptions {
  days: number
  muscleGroups: string[] // TARGET_MUSCLES values, title-cased, "what I want to train"
  exercisesPerDay: number
  targetSets: number
  targetReps: string
  equipment: string[] | null // null = all equipment
  startDay: number | null // null = leave dayOfWeek unset on every generated day
}

/**
 * Distributes the chosen muscle groups across `days` (round-robin, offset per
 * day so no single day always leads with the same group), then fills each
 * day with concrete library exercises — no exercise repeats across the whole
 * generated plan unless a muscle group's pool runs out.
 */
export function generatePlan(library: LibraryExercise[], opts: GeneratePlanOptions): GeneratedDay[] {
  const { days, muscleGroups, exercisesPerDay, targetSets, targetReps, equipment, startDay } = opts
  if (days <= 0 || muscleGroups.length === 0) return []

  const pools = new Map<string, LibraryExercise[]>()
  for (const m of muscleGroups) {
    const candidates = library.filter((e) => {
      if (titleCase(e.target) !== m) return false
      if (equipment && equipment.length > 0 && !equipment.includes(e.equipment)) return false
      return true
    })
    pools.set(m, candidates)
  }

  const used = new Set<string>()
  const weekdays = startDay == null ? [] : spacedWeekdays(days, startDay)

  const result: GeneratedDay[] = []
  for (let d = 0; d < days; d++) {
    const dayMuscles: string[] = []
    const exercises: GeneratedExercise[] = []
    for (let i = 0; i < exercisesPerDay; i++) {
      const muscle = muscleGroups[(d + i) % muscleGroups.length]
      const pool = pools.get(muscle) ?? []
      let fresh = pool.filter((e) => !used.has(e.id))
      if (fresh.length === 0) fresh = pool // allow repeats once every candidate for this muscle is used
      if (fresh.length === 0) continue // no library exercises at all for this muscle/equipment combo
      const pick = pickRandom(fresh)
      used.add(pick.id)
      dayMuscles.push(muscle)
      exercises.push({
        name: pick.name,
        muscleGroup: muscle,
        targetSets,
        targetReps,
        imageUrl: pick.image,
        gifUrl: pick.gifUrl,
      })
    }
    result.push({
      name: nameDay(dayMuscles),
      dayOfWeek: weekdays[d] ?? null,
      muscleGroups: [...new Set(dayMuscles)],
      exercises,
    })
  }
  return result
}
