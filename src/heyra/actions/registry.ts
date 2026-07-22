// ── HEYRA · action dispatch registry ─────────────────────────────────────────
// One handler per ActionKind. Every handler is meant to be a thin wrapper
// around an EXISTING store.ts mutator (store.updateInvoice, store.addTask,
// store.updateProject, ...) — this layer adds no new write path, only a
// structured, generic way to decide which mutator to call and with what
// arguments. Confirm-before-write happens upstream in Heyra.tsx (the card's
// Confirm button calls dispatchAction only after the user taps it); handlers
// themselves never run unprompted.
//
// Phase 1 ships this file as a stub — every handler reports "not implemented"
// so the confirm → dispatch → status plumbing in Heyra.tsx / ActionCardView
// can be built and tested end-to-end before any handler actually touches
// live data. Phase 2 replaces each stub with a real one-line call into
// store.ts, entity by entity (invoices, then tasks, then clients/projects).

import type { useStore } from '../../store'
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

export const ACTION_HANDLERS: Record<ActionKind, ActionHandler> = {
  create_task: notImplemented,
  update_task: notImplemented,
  complete_task: notImplemented,
  update_project_status: notImplemented,
  log_project_activity: notImplemented,
  mark_invoice_paid: notImplemented,
  update_invoice_status: notImplemented,
  create_invoice: notImplemented,
  create_client: notImplemented,
  update_client: notImplemented,
  client_intake: notImplemented,
  capture_idea: notImplemented,
  // Informational kinds are never dispatched (ActionCardView renders them
  // with no Confirm footer), but every ActionKind needs an entry so this map
  // stays exhaustive and a future kind can't slip through unregistered.
  search_result: notImplemented,
  chart: notImplemented,
  project_summary: notImplemented,
}

/** Looks up and runs the handler for a card's kind. Never throws — store mutators are fire-and-forget by convention, so a thrown error here would be a genuine bug in a handler, not an expected outcome. */
export async function dispatchAction(store: Store, card: ActionCard): Promise<ActionDispatchResult> {
  const handler = ACTION_HANDLERS[card.kind]
  try {
    return await handler(store, card)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
