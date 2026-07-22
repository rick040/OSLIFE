import { describe, it, expect } from 'vitest'
import { resolveProject, resolveClient, resolveTask, resolveInvoiceForProject } from './resolveEntity'
import type { useStore } from '../../store'
import type { Project, Client, Thread, Invoice } from '../../types'

type Store = ReturnType<typeof useStore.getState>

function store(partial: {
  projects?: Project[]
  clients?: Client[]
  threads?: Thread[]
  projectInvoices?: Invoice[]
}): Store {
  return {
    projects: [], threads: [], clients: [], payments: [], items: [], braindumpEntries: [], projectInvoices: [],
    ...partial,
  } as unknown as Store
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

const client = (c: Partial<Client>): Client => ({
  id: c.id ?? 'c1',
  name: c.name ?? 'Client X',
  domain: 'prjct',
  clientStatus: 'Active',
  ...c,
})

const thread = (t: Partial<Thread>): Thread => ({
  id: t.id ?? 'thr-1',
  domain: 'prjct',
  title: t.title ?? 'Taak',
  owedTo: 'self (HEYRA)',
  due: null,
  status: 'open',
  createdAt: new Date(0).toISOString(),
  ...t,
})

const invoice = (i: Partial<Invoice>): Invoice => ({
  id: i.id ?? 'inv-1',
  projectId: i.projectId ?? 'p1',
  number: i.number ?? 'INV-001',
  amount: 100,
  status: 'sent',
  ...i,
})

describe('resolveProject', () => {
  it('returns no entity/candidates when the text has no usable keywords', () => {
    const result = resolveProject('wat is er', store({ projects: [project({ name: 'Buurtkaart' })] }))
    expect(result.entity).toBeNull()
    expect(result.candidates).toHaveLength(0)
  })

  it('resolves a clear single match by project name', () => {
    const result = resolveProject(
      'de factuur voor Buurtkaart is betaald',
      store({ projects: [project({ id: 'p1', name: 'Buurtkaart' }), project({ id: 'p2', name: 'ParkingYou Website' })] }),
    )
    expect(result.entity?.id).toBe('p1')
    expect(result.candidates).toHaveLength(0)
  })

  it('resolves a clear single match by client name', () => {
    const result = resolveProject(
      'stuur de factuur naar Van Dijk BV',
      store({ projects: [project({ id: 'p1', name: 'Website', client: 'Van Dijk BV' })] }),
    )
    expect(result.entity?.id).toBe('p1')
  })

  it('returns disambiguation candidates when two projects score closely', () => {
    const result = resolveProject(
      'project website is klaar',
      store({ projects: [project({ id: 'p1', name: 'Website Buurtkaart' }), project({ id: 'p2', name: 'Website ParkingYou' })] }),
    )
    expect(result.entity).toBeNull()
    expect(result.candidates.length).toBeGreaterThanOrEqual(2)
  })

  it('returns nothing when no project matches at all', () => {
    const result = resolveProject('onbekende klant heeft betaald', store({ projects: [project({ name: 'Buurtkaart' })] }))
    expect(result.entity).toBeNull()
    expect(result.candidates).toHaveLength(0)
  })
})

describe('resolveClient', () => {
  it('resolves a clear single client match', () => {
    const result = resolveClient(
      'stuur een factuur naar Van Dijk BV',
      store({ clients: [client({ id: 'c1', name: 'Van Dijk BV' }), client({ id: 'c2', name: 'De Jong Media' })] }),
    )
    expect(result.entity?.id).toBe('c1')
  })

  it('returns nothing when no client matches', () => {
    const result = resolveClient('onbekende partij belde net', store({ clients: [client({ name: 'Van Dijk BV' })] }))
    expect(result.entity).toBeNull()
    expect(result.candidates).toHaveLength(0)
  })
})

describe('resolveTask', () => {
  it('resolves a clear single open task by title', () => {
    const result = resolveTask(
      'zet bel de klant terug op afgerond',
      store({ threads: [thread({ id: 't1', title: 'Bel de klant terug' }), thread({ id: 't2', title: 'Factuur versturen' })] }),
    )
    expect(result.entity?.id).toBe('t1')
  })

  it('excludes derived project/client loops from matching', () => {
    const result = resolveTask(
      'website buurtkaart afronden',
      store({ threads: [thread({ id: 'thr-prj-p1', title: 'Website Buurtkaart' })] }),
    )
    expect(result.entity).toBeNull()
    expect(result.candidates).toHaveLength(0)
  })

  it('excludes closed tasks from matching', () => {
    const result = resolveTask(
      'bel de klant terug',
      store({ threads: [thread({ id: 't1', title: 'Bel de klant terug', status: 'closed' })] }),
    )
    expect(result.entity).toBeNull()
  })
})

describe('resolveInvoiceForProject', () => {
  it('resolves directly when the project has exactly one invoice, even without a strong text match', () => {
    const result = resolveInvoiceForProject(
      'de factuur is betaald',
      'p1',
      store({ projectInvoices: [invoice({ id: 'inv-1', projectId: 'p1' })] }),
    )
    expect(result.entity?.id).toBe('inv-1')
  })

  it('never considers invoices outside the given project', () => {
    const result = resolveInvoiceForProject(
      'de factuur is betaald',
      'p1',
      store({ projectInvoices: [invoice({ id: 'inv-2', projectId: 'p2' })] }),
    )
    expect(result.entity).toBeNull()
    expect(result.candidates).toHaveLength(0)
  })

  it('disambiguates among multiple invoices scoped to the same project when the text does not clearly pick one', () => {
    const result = resolveInvoiceForProject(
      'de factuur is betaald',
      'p1',
      store({
        projectInvoices: [
          invoice({ id: 'inv-1', projectId: 'p1', number: 'INV-001' }),
          invoice({ id: 'inv-2', projectId: 'p1', number: 'INV-002' }),
        ],
      }),
    )
    expect(result.entity).toBeNull()
    expect(result.candidates).toHaveLength(2)
  })

  it('resolves a clear match by invoice number among several for the same project', () => {
    const result = resolveInvoiceForProject(
      'factuur INV002 is betaald',
      'p1',
      store({
        projectInvoices: [
          invoice({ id: 'inv-1', projectId: 'p1', number: 'INV-001' }),
          invoice({ id: 'inv-2', projectId: 'p1', number: 'INV002' }),
        ],
      }),
    )
    expect(result.entity?.id).toBe('inv-2')
  })
})
