import { describe, it, expect } from 'vitest'
import { renderRegistrySnapshot, collectRegistrySearchRows } from './contextRegistry'
import { TODAY } from '../domains'
import { addDays } from '../lib/dates'
import type { useStore } from '../store'
import type { Project, ProjectTask, ProjectMilestone, Invoice, Goal, Person, Client } from '../types'

type Store = ReturnType<typeof useStore.getState>

// Minimal store double — every field a registry entry reads must be present
// (registry code reads store.X directly, no optional chaining on the array
// itself), same convention as cards.test.ts/planner.test.ts.
function store(partial: Partial<Store>): Store {
  return {
    threads: [],
    projects: [],
    clients: [],
    projectTasks: [],
    projectMilestones: [],
    projectInvoices: [],
    goals: [],
    people: [],
    payments: [],
    habits: [],
    milestones: [],
    braindumpEntries: [],
    ...partial,
  } as unknown as Store
}

const project = (p: Partial<Project>): Project => ({
  id: p.id ?? 'p1', name: p.name ?? 'Synck Rebranding', client: p.client ?? 'Synck', domain: 'prjct',
  status: 'active', deadline: null, progress: 0, value: 0, ...p,
})

describe('renderRegistrySnapshot', () => {
  it('surfaces open project tasks grouped by project — the exact table invisible before this registry', () => {
    const lines = renderRegistrySnapshot(
      store({
        projects: [project({ id: 'p1', name: 'Synck Rebranding' })],
        projectTasks: [{ id: 't1', projectId: 'p1', name: 'Stuur nieuwe preview naar Kim', done: false } as ProjectTask],
      }),
      7,
    )
    expect(lines.some((l) => l.includes('Synck Rebranding') && l.includes('Stuur nieuwe preview naar Kim'))).toBe(true)
  })

  it('omits a done project task from the open-tasks line', () => {
    const lines = renderRegistrySnapshot(
      store({
        projects: [project({ id: 'p1' })],
        projectTasks: [{ id: 't1', projectId: 'p1', name: 'Afgerond taakje', done: true } as ProjectTask],
      }),
      7,
    )
    expect(lines.some((l) => l.includes('Afgerond taakje'))).toBe(false)
  })

  it('surfaces a project milestone due within the horizon, with its project name', () => {
    const lines = renderRegistrySnapshot(
      store({
        projects: [project({ id: 'p1', name: 'Buurtkaart Q3' })],
        // Relative to TODAY, not a literal: the registry's horizon is measured
        // from the wall clock, so a hardcoded date silently ages out of range
        // and the test starts failing on a calendar boundary rather than a
        // code change.
        projectMilestones: [{ id: 'm1', projectId: 'p1', title: 'Launch', dueDate: addDays(TODAY, 3), progress: 0, done: false } as ProjectMilestone],
      }),
      7,
    )
    expect(lines.some((l) => l.includes('Launch') && l.includes('Buurtkaart Q3'))).toBe(true)
  })

  it('surfaces an unpaid invoice', () => {
    const lines = renderRegistrySnapshot(
      store({
        projects: [project({ id: 'p1', name: 'ParkingYou' })],
        projectInvoices: [{ id: 'i1', projectId: 'p1', number: 'INV-042', amount: 500, status: 'sent' } as Invoice],
      }),
      7,
    )
    expect(lines.some((l) => l.includes('INV-042') && l.includes('500'))).toBe(true)
  })

  it('never surfaces a paid invoice as outstanding', () => {
    const lines = renderRegistrySnapshot(
      store({
        projects: [project({ id: 'p1' })],
        projectInvoices: [{ id: 'i1', projectId: 'p1', number: 'INV-001', amount: 500, status: 'paid' } as Invoice],
      }),
      7,
    )
    expect(lines.some((l) => l.includes('INV-001'))).toBe(false)
  })

  it('surfaces a North Star goal with its progress', () => {
    const lines = renderRegistrySnapshot(
      store({ goals: [{ id: 'g1', title: '€10k/maand', metric: 'EUR', target: 10000, current: 6000, deadline: '2026-12-31', domain: 'cross' } as Goal] }),
      7,
    )
    expect(lines.some((l) => l.includes('€10k/maand') && l.includes('6000/10000'))).toBe(true)
  })

  it('surfaces a personal contact by display name', () => {
    const lines = renderRegistrySnapshot(
      store({ people: [{ id: 'pe1', displayName: 'Sanne', tier: 'normaal' } as Person] }),
      7,
    )
    expect(lines.some((l) => l.includes('Sanne'))).toBe(true)
  })

  it('excludes a tier=geheim personal contact even though person has no entry-level tier gate', () => {
    const lines = renderRegistrySnapshot(
      store({ people: [{ id: 'pe1', displayName: 'Geheim Contact', tier: 'geheim' } as Person] }),
      7,
    )
    expect(lines.some((l) => l.includes('Geheim Contact'))).toBe(false)
  })

  it('surfaces a client by name and status', () => {
    const lines = renderRegistrySnapshot(
      store({ clients: [{ id: 'c1', name: 'Van Dijk', domain: 'prjct', clientStatus: 'Lead' } as Client] }),
      7,
    )
    expect(lines.some((l) => l.includes('Van Dijk') && l.includes('Lead'))).toBe(true)
  })
})

describe('collectRegistrySearchRows', () => {
  it('makes a project task searchable — closing the "Zoeken" gap the data audit flagged', () => {
    const rows = collectRegistrySearchRows(
      store({
        projects: [project({ id: 'p1', name: 'Synck Rebranding' })],
        projectTasks: [{ id: 't1', projectId: 'p1', name: 'Stuur nieuwe preview naar Kim', done: false } as ProjectTask],
      }),
    )
    const row = rows.find((r) => r.id === 't1')
    expect(row).toBeTruthy()
    expect(row!.matchFields).toContain('Stuur nieuwe preview naar Kim')
    expect(row!.domain).toBe('prjct') // inherited from the parent project
  })

  it('makes a goal and a personal contact searchable', () => {
    const rows = collectRegistrySearchRows(
      store({
        goals: [{ id: 'g1', title: 'Sub-100 open loops', metric: 'loops', target: 5, current: 12, deadline: '2026-12-31', domain: 'cross' } as Goal],
        people: [{ id: 'pe1', displayName: 'Sanne', company: 'Van Dijk BV', tier: 'normaal' } as Person],
      }),
    )
    expect(rows.some((r) => r.id === 'g1' && r.kind === 'doel')).toBe(true)
    expect(rows.some((r) => r.id === 'pe1' && r.kind === 'contact')).toBe(true)
  })

  it('never returns a tier=geheim personal contact', () => {
    const rows = collectRegistrySearchRows(store({ people: [{ id: 'pe1', displayName: 'Geheim', tier: 'geheim' } as Person] }))
    expect(rows.some((r) => r.id === 'pe1')).toBe(false)
  })
})
