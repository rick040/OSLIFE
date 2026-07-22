import { describe, it, expect } from 'vitest'
import { ACTION_HANDLERS, dispatchAction } from './registry'
import type { ActionCard, ActionKind } from './types'
import type { useStore } from '../../store'

type Store = ReturnType<typeof useStore.getState>

const ALL_KINDS: ActionKind[] = [
  'create_task', 'update_task', 'complete_task',
  'update_project_status', 'log_project_activity',
  'mark_invoice_paid', 'update_invoice_status', 'create_invoice',
  'create_client', 'update_client', 'client_intake', 'capture_idea',
  'search_result', 'chart', 'project_summary',
]

function card(kind: ActionKind): ActionCard {
  return {
    id: 'c1', kind, templateKey: kind, title: 'Test', fields: [],
    mutating: true, status: 'proposed', renderHint: 'list', createdAt: new Date(0).toISOString(),
  }
}

describe('ACTION_HANDLERS', () => {
  it('registers every ActionKind so a future kind cannot slip through unhandled', () => {
    for (const kind of ALL_KINDS) expect(ACTION_HANDLERS[kind]).toBeTypeOf('function')
  })
})

describe('dispatchAction — Phase 1 stubs', () => {
  const store = {} as Store

  it('reports not-implemented for a mutating kind without throwing', async () => {
    const result = await dispatchAction(store, card('mark_invoice_paid'))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('mark_invoice_paid')
  })

  it('never throws even if a handler misbehaves', async () => {
    const broken: ActionCard = card('create_task')
    await expect(dispatchAction(store, broken)).resolves.toMatchObject({ ok: false })
  })
})
