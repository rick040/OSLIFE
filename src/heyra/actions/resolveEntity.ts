// ── HEYRA · entity resolution ─────────────────────────────────────────────────
// Turns a free-text mention ("project X", "de factuur van PRJCT") into an
// actual EntityRef against live store data. Reuses the same tokenize + score
// approach as buildSearchCard/findProject (cards.ts) rather than inventing a
// second fuzzy-matching scheme. Resolution is always deterministic client-side
// code over `store` — the model only ever supplies the free-text name it
// heard, it never guesses an id itself.
//
// Phase 1 ships project resolution only (mirrors the existing findProject()).
// Phase 2 extends this to clients/invoices/tasks, resolved hierarchically
// (e.g. project first, then invoices scoped to that project) so ambiguity
// doesn't compound across two unresolved entities at once.

import type { useStore } from '../../store'
import { extractKeywords, matchScore } from '../cards'
import type { EntityRef } from './types'

type Store = ReturnType<typeof useStore.getState>

/** Minimum score for a candidate to be considered a real match at all. */
const MIN_SCORE = 1
/** A leading candidate needs to beat the runner-up by at least this ratio to count as an unambiguous single match. */
const CLEAR_WIN_RATIO = 2

export interface ResolveResult {
  /** Set when exactly one candidate is a clear winner. */
  entity: EntityRef | null
  /** Set instead of `entity` when 2+ candidates are close enough to need disambiguation. */
  candidates: EntityRef[]
}

function rankProjects(keywords: string[], store: Store): { ref: EntityRef; score: number }[] {
  return store.projects
    .map((p) => ({
      ref: { table: 'projects' as const, id: p.id, label: p.client ? `${p.name} (${p.client})` : p.name },
      score: matchScore(keywords, p.name, p.client),
    }))
    .filter((r) => r.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
}

/** Resolves a project mention in free text. The only table wired up in Phase 1. */
export function resolveProject(text: string, store: Store): ResolveResult {
  const keywords = extractKeywords(text)
  if (!keywords.length) return { entity: null, candidates: [] }

  const ranked = rankProjects(keywords, store)
  if (!ranked.length) return { entity: null, candidates: [] }

  const [best, second] = ranked
  const clearWin = !second || best.score >= second.score * CLEAR_WIN_RATIO
  if (clearWin) return { entity: best.ref, candidates: [] }

  // Keep only candidates within striking distance of the leader — a distant
  // third match shouldn't clutter a disambiguation list.
  const close = ranked.filter((r) => r.score >= best.score * 0.5)
  return { entity: null, candidates: close.map((r) => r.ref) }
}
