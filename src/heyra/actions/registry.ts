// ── HEYRA · action dispatch registry ─────────────────────────────────────────
// One handler per ActionKind. Every handler is a thin wrapper around an
// EXISTING store.ts mutator (store.updateInvoice, store.addTask,
// store.updateProject, ...) — this layer adds no new write path, only a
// structured, generic way to decide which mutator to call and with what
// arguments. Confirm-before-write happens upstream in Heyra.tsx (the card's
// Confirm button calls dispatchAction only after the user taps it); handlers
// themselves never run unprompted.
//
// client_intake and capture_idea are deliberately NOT wired here — those two
// keep their existing bespoke commit flows (ClientIntakeCard/IdeaCaptureCard
// in Heyra.tsx), which have interactive UX (existing-client match toggle,
// deliverable checklist) that doesn't reduce to generic field rows. The
// informational kinds (search_result/chart/project_summary) are never
// dispatched at all — ActionCardView renders them with no Confirm footer —
// but every ActionKind still needs an entry so this map stays exhaustive.

import type { useStore } from '../../store'
import { today } from '../../domains'
import type { Thread, Client } from '../../types'
import type { ActionCard, ActionKind } from './types'

type Store = ReturnType<typeof useStore.getState>

export interface ActionDispatchResult {
  ok: boolean
  error?: string
}

export type ActionHandler = (store: Store, card: ActionCard) => Promise<ActionDispatchResult>

const notImplemented: ActionHandler = async (_store, card) => ({
  ok: false,
  error: `"${card.kind}" kan nog niet worden uitgevoerd — de actie-handler volgt in een latere fase.`,
})

/** Reads one field's current (possibly user-edited) value off a proposed card. */
function fieldValue<T = unknown>(card: ActionCard, key: string): T | undefined {
  return card.fields.find((f) => f.key === key)?.value as T | undefined
}

function requireEntity(card: ActionCard): { ok: true; id: string } | { ok: false; error: string } {
  if (!card.entity) return { ok: false, error: 'Geen project/klant/taak gekoppeld aan deze actie.' }
  return { ok: true, id: card.entity.id }
}

const markInvoicePaid: ActionHandler = async (store, card) => {
  const entity = requireEntity(card)
  if (!entity.ok) return entity
  store.updateInvoice(entity.id, {
    status: 'paid',
    paidOn: fieldValue<string>(card, 'paidOn') ?? today(),
  })
  return { ok: true }
}

const updateInvoiceStatus: ActionHandler = async (store, card) => {
  const entity = requireEntity(card)
  if (!entity.ok) return entity
  const status = fieldValue<Parameters<Store['updateInvoice']>[1]['status']>(card, 'status')
  if (!status) return { ok: false, error: 'Geen status opgegeven.' }
  store.updateInvoice(entity.id, { status })
  return { ok: true }
}

const createInvoice: ActionHandler = async (store, card) => {
  const entity = requireEntity(card) // entity = the project this invoice belongs to
  if (!entity.ok) return entity
  store.addInvoice(entity.id, {
    number: fieldValue<string>(card, 'number') ?? '',
    amount: fieldValue<number>(card, 'amount') ?? 0,
    status: fieldValue(card, 'status') ?? 'draft',
    issuedOn: fieldValue<string>(card, 'issuedOn') ?? today(),
    dueOn: fieldValue<string>(card, 'dueOn') ?? null,
    paidOn: null,
    note: fieldValue<string>(card, 'note') ?? null,
  })
  return { ok: true }
}

const updateProjectStatus: ActionHandler = async (store, card) => {
  const entity = requireEntity(card)
  if (!entity.ok) return entity
  const status = fieldValue<Store['projects'][number]['status']>(card, 'status')
  if (!status) return { ok: false, error: 'Geen status opgegeven.' }
  store.updateProject(entity.id, { status })
  return { ok: true }
}

const logProjectActivity: ActionHandler = async (store, card) => {
  const entity = requireEntity(card)
  if (!entity.ok) return entity
  const body = fieldValue<string>(card, 'body')
  if (!body) return { ok: false, error: 'Geen activiteit-tekst opgegeven.' }
  store.logActivity(entity.id, body) // itself resolves task/milestone matches — see store.ts
  return { ok: true }
}

const createTask: ActionHandler = async (store, card) => {
  const title = fieldValue<string>(card, 'title')
  if (!title) return { ok: false, error: 'Geen titel opgegeven.' }
  store.addTask({
    title,
    due: fieldValue<string>(card, 'due') ?? null,
    time: fieldValue<string>(card, 'time') ?? null,
    domain: fieldValue(card, 'domain') ?? 'cross',
    priority: fieldValue(card, 'priority') ?? 'Medium',
    notes: fieldValue<string>(card, 'notes') ?? undefined,
  })
  return { ok: true }
}

const updateTask: ActionHandler = async (store, card) => {
  const entity = requireEntity(card)
  if (!entity.ok) return entity
  const patch = {
    title: fieldValue<string>(card, 'title'),
    due: fieldValue<string>(card, 'due'),
    status: fieldValue<Thread['status']>(card, 'status'),
    priority: fieldValue<Thread['priority']>(card, 'priority'),
    notes: fieldValue<string>(card, 'notes'),
  }
  store.updateThread(entity.id, patch)
  return { ok: true }
}

const completeTask: ActionHandler = async (store, card) => {
  const entity = requireEntity(card)
  if (!entity.ok) return entity
  store.closeThread(entity.id)
  return { ok: true }
}

const createClient: ActionHandler = async (store, card) => {
  const name = fieldValue<string>(card, 'name')
  if (!name) return { ok: false, error: 'Geen klantnaam opgegeven.' }
  store.addClient({
    name,
    domain: fieldValue(card, 'domain') ?? 'prjct',
    clientStatus: fieldValue(card, 'clientStatus') ?? 'Lead',
    email: fieldValue<string>(card, 'email') ?? null,
  })
  return { ok: true }
}

const updateClient: ActionHandler = async (store, card) => {
  const entity = requireEntity(card)
  if (!entity.ok) return entity
  const patch = {
    clientStatus: fieldValue<Client['clientStatus']>(card, 'clientStatus'),
    email: fieldValue<string>(card, 'email'),
    website: fieldValue<string>(card, 'website'),
  }
  store.updateClient(entity.id, patch)
  return { ok: true }
}

export const ACTION_HANDLERS: Record<ActionKind, ActionHandler> = {
  create_task: createTask,
  update_task: updateTask,
  complete_task: completeTask,
  update_project_status: updateProjectStatus,
  log_project_activity: logProjectActivity,
  mark_invoice_paid: markInvoicePaid,
  update_invoice_status: updateInvoiceStatus,
  create_invoice: createInvoice,
  create_client: createClient,
  update_client: updateClient,
  // Bespoke commit flows in Heyra.tsx handle these — see file header.
  client_intake: notImplemented,
  capture_idea: notImplemented,
  // Informational kinds are never dispatched (no Confirm footer is ever
  // rendered for them), but every ActionKind needs an entry so this map
  // stays exhaustive and a future kind can't slip through unregistered.
  search_result: notImplemented,
  chart: notImplemented,
  project_summary: notImplemented,
}

/** Looks up and runs the handler for a card's kind. Never throws — a thrown error here would be a genuine bug in a handler, not an expected outcome, since store mutators are optimistic/fire-and-forget by convention. */
export async function dispatchAction(store: Store, card: ActionCard): Promise<ActionDispatchResult> {
  const handler = ACTION_HANDLERS[card.kind]
  try {
    return await handler(store, card)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
