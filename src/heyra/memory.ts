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
  /** Chips shown recently (most recent last, capped) — lets suggestions.ts deprioritize repeats instead of showing the same chip every turn. */
  recentSuggestions: string[]
}

const MAX_TURNS = 6
const MAX_RECENT_SUGGESTIONS = 12

export function emptyMemory(): ConversationMemory {
  return { turns: [], lastTopic: null, lastDomain: null, lastEntity: null, recentSuggestions: [] }
}

export function remember(
  mem: ConversationMemory,
  turn: Turn,
  extra?: { topic?: Topic; domain?: Domain | null; entity?: string | null },
): ConversationMemory {
  return {
    ...mem,
    turns: [...mem.turns, turn].slice(-MAX_TURNS),
    lastTopic: extra?.topic ?? mem.lastTopic,
    lastDomain: extra?.domain !== undefined ? extra.domain : mem.lastDomain,
    lastEntity: extra?.entity !== undefined ? extra.entity : mem.lastEntity,
  }
}

/** Records chips just shown so the next suggestion pass can deprioritize repeats. Keeps the most recent MAX_RECENT_SUGGESTIONS, newest last. */
export function rememberSuggestions(mem: ConversationMemory, shown: string[]): ConversationMemory {
  if (!shown.length) return mem
  const merged = [...mem.recentSuggestions.filter((s) => !shown.includes(s)), ...shown]
  return { ...mem, recentSuggestions: merged.slice(-MAX_RECENT_SUGGESTIONS) }
}

/** Short transcript for prompting the brain — plain "rick: ..." / "heyra: ..." lines. */
export function transcript(mem: ConversationMemory): string {
  if (!mem.turns.length) return '(nog geen eerdere berichten)'
  return mem.turns.map((t) => `${t.role}: ${t.text}`).join('\n')
}
