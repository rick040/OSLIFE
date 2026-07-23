import { describe, it, expect, vi } from 'vitest'
import { ACTION_HANDLERS, dispatchAction } from './registry'
import type { ActionCard, ActionField, ActionKind } from './types'
import type { useStore } from '../../store'

type Store = ReturnType<typeof useStore.getState>

const ALL_KINDS: ActionKind[] = [
  'create_task', 'update_task', 'complete_task',
  'update_project_status', 'log_project_activity',
  'mark_invoice_paid', 'update_invoice_status', 'create_invoice',
  'create_client', 'update_client', 'client_intake', 'capture_idea',
  'search_result', 'chart', 'project_summary',
]

function field(key: string, value: unknown): ActionField {
  return { key, label: key, type: 'text', value, editable: true }
}

function card(kind: ActionKind, opts: Partial<ActionCard> = {}): ActionCard {
  return {
    id: 'c1', kind, templateKey: kind, title: 'Test', fields: [],
    mutating: true, status: 'proposed', renderHint: 'list', createdAt: new Date(0).toISOString(),
    ...opts,
  }
}

describe('ACTION_HANDLERS', () => {
  it('registers every ActionKind so a future kind cannot slip through unhandled', () => {
    for (const kind of ALL_KINDS) expect(ACTION_HANDLERS[kind]).toBeTypeOf('function')
  })
})

describe('dispatchAction', () => {
  it('never throws even against an empty store double', async () => {
    const store = {} as Store
    await expect(dispatchAction(store, card('mark_invoice_paid'))).resolves.toMatchObject({ ok: false })
  })

  it('marks an invoice paid via the existing store.updateInvoice mutator', async () => {
    const updateInvoice = vi.fn()
    const store = { updateInvoice } as unknown as Store
    const c = card('mark_invoice_paid', {
      entity: { table: 'project_invoices', id: 'inv-1', label: 'INV-001' },
      fields: [field('paidOn', '2026-07-22')],
    })
    const result = await dispatchAction(store, c)
    expect(result.ok).toBe(true)
    expect(updateInvoice).toHaveBeenCalledWith('inv-1', { status: 'paid', paidOn: '2026-07-22' })
  })

  it('fails a mutating action with no resolved entity, without touching the store', async () => {
    const updateInvoice = vi.fn()
    const store = { updateInvoice } as unknown as Store
    const result = await dispatchAction(store, card('mark_invoice_paid'))
    expect(result.ok).toBe(false)
    expect(updateInvoice).not.toHaveBeenCalled()
  })

  it('creates a task via the existing store.addTask mutator', async () => {
    const addTask = vi.fn()
    const store = { addTask } as unknown as Store
    const c = card('create_task', { fields: [field('title', 'Bel de klant'), field('domain', 'prjct')] })
    const result = await dispatchAction(store, c)
    expect(result.ok).toBe(true)
    expect(addTask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Bel de klant', domain: 'prjct' }))
  })

  it('completes a task via the existing store.closeThread mutator', async () => {
    const closeThread = vi.fn()
    const store = { closeThread } as unknown as Store
    const c = card('complete_task', { entity: { table: 'tasks', id: 't1', label: 'Bel de klant' } })
    const result = await dispatchAction(store, c)
    expect(result.ok).toBe(true)
    expect(closeThread).toHaveBeenCalledWith('t1')
  })

  it('still reports not-implemented for client_intake, which keeps its own bespoke commit flow', async () => {
    const store = {} as Store
    const result = await dispatchAction(store, card('client_intake'))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('client_intake')
  })
})
