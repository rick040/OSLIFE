// ── HEYRA · conversation memory ───────────────────────────────────────────────
// Session-only (never persisted) short-term memory so HEYRA can resolve
// implicit references — "en verder?", "wat staat er nog open bij hen?" — against
// what was just discussed. Threaded through router.ts and every agent as `ctx`.

import type { Domain } from '../types'
import type { Topic } from './suggestions'

export interface Turn {
  role: 'rick' | 'heyra'
  text: string
}

export interface ConversationMemory {
  turns: Turn[] // most recent last, capped at MAX_TURNS
  lastTopic: Topic | null
  lastDomain: Domain | null
  lastEntity: string | null // name of the last project/client HEYRA talked about
}

const MAX_TURNS = 6

export function emptyMemory(): ConversationMemory {
  return { turns: [], lastTopic: null, lastDomain: null, lastEntity: null }
}

export function remember(
  mem: ConversationMemory,
  turn: Turn,
  extra?: { topic?: Topic; domain?: Domain | null; entity?: string | null },
): ConversationMemory {
  return {
    turns: [...mem.turns, turn].slice(-MAX_TURNS),
    lastTopic: extra?.topic ?? mem.lastTopic,
    lastDomain: extra?.domain !== undefined ? extra.domain : mem.lastDomain,
    lastEntity: extra?.entity !== undefined ? extra.entity : mem.lastEntity,
  }
}

/** Short transcript for prompting the brain — plain "rick: ..." / "heyra: ..." lines. */
export function transcript(mem: ConversationMemory): string {
  if (!mem.turns.length) return '(nog geen eerdere berichten)'
  return mem.turns.map((t) => `${t.role}: ${t.text}`).join('\n')
}
