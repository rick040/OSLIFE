import { describe, it, expect, vi, beforeEach } from 'vitest'
import { proposeAction } from './proposeAction'
import { askBrainTool } from '../brainClient'
import type { useStore } from '../../store'
import type { Project, Invoice } from '../../types'

vi.mock('../brainClient', () => ({ askBrainTool: vi.fn() }))

type Store = ReturnType<typeof useStore.getState>
const mockAskBrainTool = vi.mocked(askBrainTool)

function store(partial: { projects?: Project[]; projectInvoices?: Invoice[] } = {}): Store {
  return {
    projects: [], projectInvoices: [], clients: [], threads: [],
    ...partial,
  } as unknown as Store
}

const project = (p: Partial<Project>): Project => ({
  id: p.id ?? 'p1', name: p.name ?? 'Buurtkaart', client: '', domain: 'prjct',
  status: 'active', deadline: null, progress: 0, value: 0, ...p,
})

const invoice = (i: Partial<Invoice>): Invoice => ({
  id: i.id ?? 'inv-1', projectId: i.projectId ?? 'p1', number: 'INV-001', amount: 500, status: 'sent', ...i,
})

beforeEach(() => {
  mockAskBrainTool.mockReset()
})

describe('proposeAction', () => {
  it('returns null when the brain is unavailable or does not call the tool', async () => {
    mockAskBrainTool.mockResolvedValue(null)
    const result = await proposeAction('factuur is betaald', store())
    expect(result).toBeNull()
  })

  it('returns null for a malformed tool response (invalid kind)', async () => {
    mockAskBrainTool.mockResolvedValue({ name: 'propose_action', input: { kind: 'delete_everything', title: 'x', values: {} } })
    const result = await proposeAction('iets raars', store())
    expect(result).toBeNull()
  })

  it('never fabricates the current invoice status — previousValue always comes from the store, not the model', async () => {
    mockAskBrainTool.mockResolvedValue({
      name: 'propose_action',
      input: { kind: 'mark_invoice_paid', title: 'Factuur bijwerken', entityMention: 'Buurtkaart', values: {} },
    })
    const s = store({
      projects: [project({ id: 'p1', name: 'Buurtkaart' })],
      projectInvoices: [invoice({ id: 'inv-1', projectId: 'p1', status: 'overdue', amount: 750 })],
    })
    const card = await proposeAction('factuur voor buurtkaart is betaald', s)
    expect(card).not.toBeNull()
    expect(card?.entity).toEqual({ table: 'project_invoices', id: 'inv-1', label: 'INV-001' })
    const status = card?.fields.find((f) => f.key === 'status')
    expect(status?.previousValue).toBe('overdue')
    expect(status?.value).toBe('paid')
    const amount = card?.fields.find((f) => f.key === 'amount')
    expect(amount?.value).toBe(750)
    expect(card?.renderHint).toBe('diff')
    expect(card?.mutating).toBe(true)
    expect(card?.status).toBe('proposed')
  })

  it('returns null when a required entity cannot be resolved at all', async () => {
    mockAskBrainTool.mockResolvedValue({
      name: 'propose_action',
      input: { kind: 'update_project_status', title: 'Project bijwerken', entityMention: 'onbekend project', values: { status: 'done' } },
    })
    const result = await proposeAction('onbekend project is klaar', store({ projects: [project({ name: 'Buurtkaart' })] }))
    expect(result).toBeNull()
  })

  it('surfaces disambiguation candidates instead of guessing when the mention is ambiguous', async () => {
    mockAskBrainTool.mockResolvedValue({
      name: 'propose_action',
      input: { kind: 'update_project_status', title: 'Project bijwerken', entityMention: 'website', values: { status: 'done' } },
    })
    const s = store({ projects: [project({ id: 'p1', name: 'Website Buurtkaart' }), project({ id: 'p2', name: 'Website ParkingYou' })] })
    const card = await proposeAction('website project is klaar', s)
    expect(card).not.toBeNull()
    expect(card?.entity).toBeNull()
    expect(card?.candidates?.length).toBe(2)
  })

  it('builds create_task fields directly from the proposed values with no entity required', async () => {
    mockAskBrainTool.mockResolvedValue({
      name: 'propose_action',
      input: { kind: 'create_task', title: 'Taak aanmaken', entityMention: '', values: { title: 'Bel de klant terug', domain: 'prjct' } },
    })
    const card = await proposeAction('ik moet de klant nog terugbellen', store())
    expect(card).not.toBeNull()
    expect(card?.entity ?? null).toBeNull()
    expect(card?.fields.find((f) => f.key === 'title')?.value).toBe('Bel de klant terug')
    expect(card?.renderHint).toBe('list')
  })
})
