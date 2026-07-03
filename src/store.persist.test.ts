import { describe, it, expect } from 'vitest'
import { applyPersistDefaults } from './store'

// A minimal stand-in for a seed() result: every demo-backed field carries a
// recognisable non-empty value so we can assert exactly which slices get seeded.
function fakeSeed(): Record<string, any> {
  return {
    healthDays: ['h'], emails: ['e'], transactions: ['t'], meetingDays: ['m'],
    projects: ['p'], clients: ['c'], messages: ['msg'], goals: ['g'],
    milestones: ['ms'], payments: ['pay'], subscriptions: ['sub'],
    dogEntries: ['de'], dogMedical: ['dm'], dogReminders: ['dr'], blocks: ['b'],
    habits: ['hb'], essentials: ['es'], patterns: ['pt'], screenDays: ['sd'],
    threads: ['th'], nudge: { id: 'n' }, dogProfile: { name: 'Kyra' },
  }
}

describe('applyPersistDefaults', () => {
  it('seeds every demo-backed slice when the persisted state is empty', () => {
    const state: Record<string, any> = {}
    const seeded = fakeSeed()
    applyPersistDefaults(state, seeded)

    // demo-backed arrays fall back to the seed value
    for (const k of ['healthDays', 'emails', 'transactions', 'projects', 'clients', 'habits', 'screenDays']) {
      expect(state[k]).toEqual(seeded[k])
    }
    // falsy-guarded singletons
    expect(state.threads).toEqual(seeded.threads)
    expect(state.nudge).toEqual(seeded.nudge)
    expect(state.dogProfile).toEqual(seeded.dogProfile)
    // app-owned slices default to []
    for (const k of ['projectMilestones', 'projectTasks', 'projectHours', 'projectInvoices', 'projectActivity', 'checkins', 'learnedFacts', 'vendorTags', 'braindumpEntries']) {
      expect(state[k]).toEqual([])
    }
    // scalars
    expect(state.notificationPrefs).toBeNull()
    expect(state.dataSource).toBe('mock')
  })

  it('preserves non-empty persisted slices (does not overwrite live data)', () => {
    const state: Record<string, any> = {
      transactions: [{ id: 'real' }],
      projects: [{ id: 'realproj' }],
      projectTasks: [{ id: 'task' }],
      checkins: [{ id: 'ci' }],
      dataSource: 'live',
      notificationPrefs: { telegram: 1 },
    }
    applyPersistDefaults(state, fakeSeed())

    expect(state.transactions).toEqual([{ id: 'real' }])
    expect(state.projects).toEqual([{ id: 'realproj' }])
    expect(state.projectTasks).toEqual([{ id: 'task' }])
    expect(state.checkins).toEqual([{ id: 'ci' }])
    expect(state.dataSource).toBe('live')
    expect(state.notificationPrefs).toEqual({ telegram: 1 })
  })

  it('re-seeds a slice that persisted as an empty array', () => {
    const state: Record<string, any> = { transactions: [], projects: [] }
    const seeded = fakeSeed()
    applyPersistDefaults(state, seeded)
    expect(state.transactions).toEqual(seeded.transactions)
    expect(state.projects).toEqual(seeded.projects)
  })

  it('leaves an explicit null notificationPrefs untouched but defaults undefined to null', () => {
    const explicit: Record<string, any> = { notificationPrefs: null }
    applyPersistDefaults(explicit, fakeSeed())
    expect(explicit.notificationPrefs).toBeNull()

    const absent: Record<string, any> = {}
    applyPersistDefaults(absent, fakeSeed())
    expect(absent.notificationPrefs).toBeNull()
  })
})
