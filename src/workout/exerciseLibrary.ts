// Exercise picker data — trimmed from hasaneyldrm/exercises-dataset
// (https://github.com/hasaneyldrm/exercises-dataset, MIT-licensed dataset;
// media assets are excluded here since those carry a separate gymvisual.com
// license). Only name/body-part/target-muscle/equipment/instructions kept —
// dropped the other 9 instruction languages and every image/gif reference to
// keep this a ~200KB lazy-loaded chunk instead of the original ~17MB.

export interface LibraryExercise {
  id: string
  name: string
  bodyPart: string
  target: string
  secondaryMuscles: string[]
  equipment: string
  instructions: string[]
}

/** Coarse body-part facets for the picker's filter chips. */
export const BODY_PARTS = ['back', 'cardio', 'chest', 'lower arms', 'lower legs', 'neck', 'shoulders', 'upper arms', 'upper legs', 'waist']

const TITLE_CASE_OVERRIDES: Record<string, string> = { 'ez barbell': 'EZ Barbell' }

export function titleCase(s: string): string {
  return TITLE_CASE_OVERRIDES[s] ?? s.replace(/\b\w/g, (c) => c.toUpperCase())
}

/** The specific muscles exercises actually target — this is what the app tracks per-plan/per-exercise as "muscle group". */
export const TARGET_MUSCLES = [
  'abductors', 'abs', 'adductors', 'biceps', 'calves', 'cardiovascular system', 'delts', 'forearms',
  'glutes', 'hamstrings', 'lats', 'levator scapulae', 'pectorals', 'quads', 'serratus anterior',
  'spine', 'traps', 'triceps', 'upper back',
].map(titleCase)

let cached: LibraryExercise[] | null = null
/** Lazy-loaded (dynamic import) so the ~200KB dataset only downloads once the picker actually opens. */
export async function loadExerciseLibrary(): Promise<LibraryExercise[]> {
  if (cached) return cached
  const mod = await import('./data/exerciseLibrary.json')
  cached = mod.default as LibraryExercise[]
  return cached
}

export function searchExercises(
  all: LibraryExercise[],
  query: string,
  bodyPart: string | null,
): LibraryExercise[] {
  const q = query.trim().toLowerCase()
  return all.filter((e) => {
    if (bodyPart && e.bodyPart !== bodyPart) return false
    if (!q) return true
    return e.name.toLowerCase().includes(q) || e.target.toLowerCase().includes(q) || e.equipment.toLowerCase().includes(q)
  })
}
