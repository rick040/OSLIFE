import { describe, it, expect } from 'vitest'
import { generatePlan, spacedWeekdays } from './planGenerator'
import type { LibraryExercise } from './exerciseLibrary'

function ex(id: string, target: string, equipment = 'barbell'): LibraryExercise {
  return { id, name: `Exercise ${id}`, bodyPart: 'chest', target, secondaryMuscles: [], equipment, instructions: [], image: `img-${id}`, gifUrl: `gif-${id}` }
}

const LIBRARY: LibraryExercise[] = [
  ex('1', 'pectorals'), ex('2', 'pectorals'), ex('3', 'pectorals'),
  ex('4', 'lats'), ex('5', 'lats'),
  ex('6', 'quads', 'body weight'),
]

describe('spacedWeekdays', () => {
  it('spaces days evenly starting at startDay', () => {
    expect(spacedWeekdays(3, 1)).toEqual([1, 3, 6])
  })
  it('returns every day when count >= 7', () => {
    expect(spacedWeekdays(7, 1)).toHaveLength(7)
  })
  it('returns nothing for a zero count', () => {
    expect(spacedWeekdays(0, 1)).toEqual([])
  })
})

describe('generatePlan', () => {
  const baseOpts = { exercisesPerDay: 2, targetSets: 3, targetReps: '8-12', equipment: null, startDay: 1 as number | null }

  it('returns nothing without days or muscle groups', () => {
    expect(generatePlan(LIBRARY, { ...baseOpts, days: 0, muscleGroups: ['Pectorals'] })).toEqual([])
    expect(generatePlan(LIBRARY, { ...baseOpts, days: 2, muscleGroups: [] })).toEqual([])
  })

  it('fills each day with the requested exercise count from the chosen muscles', () => {
    const plan = generatePlan(LIBRARY, { ...baseOpts, days: 2, muscleGroups: ['Pectorals', 'Lats'] })
    expect(plan).toHaveLength(2)
    for (const day of plan) {
      expect(day.exercises).toHaveLength(2)
      expect(day.exercises.every((e) => ['Pectorals', 'Lats'].includes(e.muscleGroup))).toBe(true)
    }
  })

  it('does not repeat an exercise across the whole generated plan while pool has fresh options', () => {
    const plan = generatePlan(LIBRARY, { ...baseOpts, days: 3, exercisesPerDay: 1, muscleGroups: ['Pectorals'] })
    const names = plan.flatMap((d) => d.exercises.map((e) => e.name))
    expect(new Set(names).size).toBe(names.length)
  })

  it('respects an equipment filter, skipping muscles with no matching exercise', () => {
    const plan = generatePlan(LIBRARY, { ...baseOpts, days: 1, exercisesPerDay: 1, muscleGroups: ['Quads'], equipment: ['cable'] })
    expect(plan[0].exercises).toHaveLength(0)
  })

  it('assigns spaced weekdays when startDay is given, and null when omitted', () => {
    const withDays = generatePlan(LIBRARY, { ...baseOpts, days: 2, muscleGroups: ['Pectorals'] })
    expect(withDays.every((d) => d.dayOfWeek != null)).toBe(true)
    const withoutDays = generatePlan(LIBRARY, { ...baseOpts, days: 2, muscleGroups: ['Pectorals'], startDay: null })
    expect(withoutDays.every((d) => d.dayOfWeek === null)).toBe(true)
  })
})
