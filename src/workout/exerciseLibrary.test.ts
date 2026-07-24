import { describe, it, expect } from 'vitest'
import { BODY_PARTS, TARGET_MUSCLES, titleCase, searchExercises, type LibraryExercise } from './exerciseLibrary'

// Regression test for a module-eval-time bug: TARGET_MUSCLES used to call
// titleCase() before TITLE_CASE_OVERRIDES was declared, which throws a
// temporal-dead-zone ReferenceError the instant this module is imported —
// invisible to tsc/vite build (neither executes the code) and to every other
// test in the suite (none of them imported this module), but fatal in the
// browser since Workout.tsx is statically imported from App.tsx, crashing the
// entire app on every load. Merely importing this file is the real assertion.
describe('exerciseLibrary', () => {
  it('evaluates the module without throwing and produces non-empty facets', () => {
    expect(BODY_PARTS.length).toBeGreaterThan(0)
    expect(TARGET_MUSCLES.length).toBeGreaterThan(0)
    expect(TARGET_MUSCLES.every((m) => m === titleCase(m))).toBe(true)
  })

  it('titleCase applies known overrides and default title-casing', () => {
    expect(titleCase('ez barbell')).toBe('EZ Barbell')
    expect(titleCase('upper back')).toBe('Upper Back')
  })

  it('searchExercises filters by name, target and body part', () => {
    const data: LibraryExercise[] = [
      { id: '1', name: 'Barbell Bench Press', bodyPart: 'chest', target: 'pectorals', secondaryMuscles: [], equipment: 'barbell', instructions: [] },
      { id: '2', name: 'Alternate Lateral Pulldown', bodyPart: 'back', target: 'lats', secondaryMuscles: [], equipment: 'cable', instructions: [] },
    ]
    expect(searchExercises(data, 'bench', null)).toHaveLength(1)
    expect(searchExercises(data, '', 'back')).toHaveLength(1)
    expect(searchExercises(data, 'lats', null)).toHaveLength(1)
  })
})
