// ── HEYRA · entity resolution ─────────────────────────────────────────────────
// Turns a free-text mention ("project X", "de factuur van PRJCT") into an
// actual EntityRef against live store data. Reuses the same tokenize + score
// approach as buildSearchCard/findProject (cards.ts) rather than inventing a
// second fuzzy-matching scheme. Resolution is always deterministic client-side
// code over `store` — the model only ever supplies the free-text name it
// heard, it never guesses an id itself.
//
// Invoices resolve HIERARCHICALLY: resolveInvoiceForProject() only ever scores
// invoices already scoped to one resolved project, so an ambiguous message
// ("de factuur is betaald" with 2 projects and 2 invoices each) never asks the
// user to disambiguate both dimensions in one shot — project first, then, only
// if still ambiguous, invoice within that project.

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

/** Picks a single clear winner from scored candidates, or returns the close ones for disambiguation. Shared by every resolve* below so "clear win" means the same thing everywhere. */
function pickWinner(ranked: { ref: EntityRef; score: number }[]): ResolveResult {
  if (!ranked.length) return { entity: null, candidates: [] }
  const [best, second] = ranked
  const clearWin = !second || best.score >= second.score * CLEAR_WIN_RATIO
  if (clearWin) return { entity: best.ref, candidates: [] }
  // Keep only candidates within striking distance of the leader — a distant
  // third match shouldn't clutter a disambiguation list.
  const close = ranked.filter((r) => r.score >= best.score * 0.5)
  return { entity: null, candidates: close.map((r) => r.ref) }
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

/** Resolves a project mention in free text. */
export function resolveProject(text: string, store: Store): ResolveResult {
  const keywords = extractKeywords(text)
  if (!keywords.length) return { entity: null, candidates: [] }
  return pickWinner(rankProjects(keywords, store))
}

/** Resolves a client mention in free text. */
export function resolveClient(text: string, store: Store): ResolveResult {
  const keywords = extractKeywords(text)
  if (!keywords.length) return { entity: null, candidates: [] }
  const ranked = store.clients
    .map((c) => ({
      ref: { table: 'clients' as const, id: c.id, label: c.name },
      score: matchScore(keywords, c.name),
    }))
    .filter((r) => r.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
  return pickWinner(ranked)
}

/** Resolves an open task/thread mention in free text (excludes derived project/client loops — those aren't real tasks). */
export function resolveTask(text: string, store: Store): ResolveResult {
  const keywords = extractKeywords(text)
  if (!keywords.length) return { entity: null, candidates: [] }
  const ranked = store.threads
    .filter((t) => t.status === 'open' && !/^thr-(prj|cli)-/.test(t.id))
    .map((t) => ({
      ref: { table: 'tasks' as const, id: t.id, label: t.title },
      score: matchScore(keywords, t.title),
    }))
    .filter((r) => r.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
  return pickWinner(ranked)
}

/**
 * Resolves an invoice scoped to an ALREADY-RESOLVED project — never scores
 * across every invoice in the app, so it can't compound with project
 * ambiguity. A project with exactly one invoice resolves to it directly even
 * without a strong text match (the common case: "de factuur is betaald"
 * rarely names the invoice number).
 */
export function resolveInvoiceForProject(text: string, projectId: string, store: Store): ResolveResult {
  const invoicesForProject = store.projectInvoices.filter((i) => i.projectId === projectId)
  if (invoicesForProject.length === 0) return { entity: null, candidates: [] }
  if (invoicesForProject.length === 1) {
    const i = invoicesForProject[0]
    return { entity: { table: 'project_invoices', id: i.id, label: i.number || `factuur ${i.status}` }, candidates: [] }
  }

  const keywords = extractKeywords(text)
  const ranked = invoicesForProject
    .map((i) => ({
      ref: { table: 'project_invoices' as const, id: i.id, label: `${i.number || 'factuur'} · ${i.status}` },
      score: matchScore(keywords, i.number, i.note),
    }))
    .sort((a, b) => b.score - a.score)

  const [best, second] = ranked
  const clearWin = best.score >= MIN_SCORE && (!second || best.score >= second.score * CLEAR_WIN_RATIO)
  if (clearWin) return { entity: best.ref, candidates: [] }
  // No confident text match among several invoices — surface all of them
  // scoped to this project rather than guessing which one was meant.
  return { entity: null, candidates: ranked.map((r) => r.ref) }
}
