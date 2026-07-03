import { describe, it, expect } from 'vitest'
import { templateTasksFor, TEMPLATE_TASKS } from './projectTemplates'

describe('templateTasksFor', () => {
  it('returns the tasks for a single known type', () =>
    expect(templateTasksFor(['Logo'])).toEqual(TEMPLATE_TASKS.Logo))

  it('is empty for an unknown type', () =>
    expect(templateTasksFor(['Onzin'])).toEqual([]))

  it('is empty for no types', () =>
    expect(templateTasksFor([])).toEqual([]))

  it('dedupes the union across types (Website ∪ Logo share "Intake & briefing")', () => {
    const out = templateTasksFor(['Website', 'Logo'])
    // no duplicates in the union
    expect(new Set(out).size).toBe(out.length)
    // union contains every task from both templates
    for (const t of [...TEMPLATE_TASKS.Website, ...TEMPLATE_TASKS.Logo]) expect(out).toContain(t)
    // the shared task appears exactly once
    expect(out.filter((t) => t === 'Intake & briefing')).toHaveLength(1)
  })

  it('keeps the first type\'s order on ties', () => {
    const out = templateTasksFor(['Website', 'Logo'])
    expect(out.slice(0, TEMPLATE_TASKS.Website.length)).toEqual(TEMPLATE_TASKS.Website)
  })
})
