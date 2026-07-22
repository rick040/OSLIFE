import { describe, it, expect } from 'vitest'
import { resolveProject } from './resolveEntity'
import type { useStore } from '../../store'
import type { Project } from '../../types'

type Store = ReturnType<typeof useStore.getState>

function store(projects: Project[]): Store {
  return { projects, threads: [], clients: [], payments: [], items: [], braindumpEntries: [] } as unknown as Store
}

const project = (p: Partial<Project>): Project => ({
  id: p.id ?? 'p1',
  name: p.name ?? 'Project X',
  client: p.client ?? '',
  domain: 'prjct',
  status: 'active',
  deadline: null,
  progress: 0,
  value: 0,
  ...p,
})

describe('resolveProject', () => {
  it('returns no entity/candidates when the text has no usable keywords', () => {
    const result = resolveProject('wat is er', store([project({ name: 'Buurtkaart' })]))
    expect(result.entity).toBeNull()
    expect(result.candidates).toHaveLength(0)
  })

  it('resolves a clear single match by project name', () => {
    const result = resolveProject(
      'de factuur voor Buurtkaart is betaald',
      store([project({ id: 'p1', name: 'Buurtkaart' }), project({ id: 'p2', name: 'ParkingYou Website' })]),
    )
    expect(result.entity?.id).toBe('p1')
    expect(result.candidates).toHaveLength(0)
  })

  it('resolves a clear single match by client name', () => {
    const result = resolveProject(
      'stuur de factuur naar Van Dijk BV',
      store([project({ id: 'p1', name: 'Website', client: 'Van Dijk BV' })]),
    )
    expect(result.entity?.id).toBe('p1')
  })

  it('returns disambiguation candidates when two projects score closely', () => {
    const result = resolveProject(
      'project website is klaar',
      store([project({ id: 'p1', name: 'Website Buurtkaart' }), project({ id: 'p2', name: 'Website ParkingYou' })]),
    )
    expect(result.entity).toBeNull()
    expect(result.candidates.length).toBeGreaterThanOrEqual(2)
  })

  it('returns nothing when no project matches at all', () => {
    const result = resolveProject('onbekende klant heeft betaald', store([project({ name: 'Buurtkaart' })]))
    expect(result.entity).toBeNull()
    expect(result.candidates).toHaveLength(0)
  })
})
