import type { WorkoutExercise, WorkoutSession, WorkoutSet } from '../types'

/**
 * Most recent logged sets per exercise (across all past sessions) — powers
 * the "vorige keer" hints while logging. Shared by the main Workout screen
 * and the tablet kiosk's workout launcher.
 */
export function buildPreviousByExercise(
  workoutSessions: WorkoutSession[],
  workoutExercises: WorkoutExercise[],
): Map<string, WorkoutSet[]> {
  const map = new Map<string, WorkoutSet[]>()
  const sorted = [...workoutSessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  for (const ex of workoutExercises) {
    for (const s of sorted) {
      const sets = s.sets.filter((x) => x.exerciseId === ex.id).sort((a, b) => a.setNumber - b.setNumber)
      if (sets.length) {
        map.set(ex.id, sets)
        break
      }
    }
  }
  return map
}
