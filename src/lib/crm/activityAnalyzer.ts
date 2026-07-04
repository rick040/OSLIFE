// ── Activity logger analysis ─────────────────────────────────────────────────
// When you log a free-text activity on a project ("logo afgerond en gemaild"),
// this matches it against that project's open tasks and milestones and proposes
// the action to take: complete a task, bump a milestone's progress, or just
// link the note. Heuristic (token overlap + intent keywords) — no network call,
// in the same spirit as src/understand.ts.

import type { ProjectTask, ProjectMilestone } from '../../types'

export type ActivityAction = 'complete' | 'progress' | 'link' | 'none'

export interface ActivityMatch {
  type: 'task' | 'milestone'
  id: string
  title: string
}

export interface ActivityAnalysis {
  match: ActivityMatch | null
  action: ActivityAction
  /** target progress 0..1 when action === 'progress' */
  progress?: number
  confidence: number // 0..1
  reason: string // short Dutch explanation of what it will do
}

// Dutch + English filler that shouldn't drive a match.
const STOP = new Set([
  'de', 'het', 'een', 'en', 'of', 'ik', 'je', 'we', 'is', 'op', 'in', 'aan', 'met',
  'voor', 'naar', 'van', 'te', 'dat', 'die', 'dit', 'er', 'om', 'al', 'nog', 'maar',
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'for', 'on', 'in', 'with', 'is', 'it',
  'heb', 'heeft', 'ben', 'was', 'zijn', 'naar', 'even', 'gewoon', 'ook',
])

// "done"-type intent.
const DONE_WORDS = [
  'af', 'klaar', 'afgerond', 'afgemaakt', 'afgehandeld', 'gedaan', 'done', 'opgeleverd',
  'voltooid', 'verstuurd', 'verzonden', 'gemaild', 'opgestuurd', 'ingeleverd', 'betaald',
  'geregeld', 'finished', 'completed', 'sent', 'delivered',
]
// "in progress"-type intent.
const PROGRESS_WORDS = [
  'bezig', 'begonnen', 'gestart', 'started', 'working', 'mee', 'halverwege', 'half',
  'voortgang', 'progress', 'opgepakt', 'verder',
]

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
}

function hasAny(body: string, words: string[]): boolean {
  // Whole-word match (both boundaries). The old `' '+w OR w+' '` matched a word
  // as a prefix/suffix of another: "af" fired on "afspraak", "mee" on "meeting".
  const b = ` ${body.toLowerCase().replace(/[^a-z0-9\s]/gi, ' ')} `
  return words.some((w) => b.includes(` ${w} `))
}

/** Detect an explicit percentage like "op 60%" / "60 procent". Returns 0..1 or null. */
function detectPercent(body: string): number | null {
  const m = body.match(/(\d{1,3})\s*(?:%|procent|pct)/i)
  if (!m) return null
  const n = Math.max(0, Math.min(100, parseInt(m[1], 10)))
  return n / 100
}

interface Scored<T> { item: T; score: number; title: string }

function bestMatch<T>(bodyTokens: Set<string>, items: T[], title: (t: T) => string): Scored<T> | null {
  let best: Scored<T> | null = null
  for (const item of items) {
    const t = title(item)
    const titleTokens = tokenize(t)
    if (titleTokens.length === 0) continue
    let shared = 0
    for (const tk of titleTokens) if (bodyTokens.has(tk)) shared++
    // Score: fraction of the title's words present in the note.
    const score = shared / titleTokens.length
    if (shared >= 1 && (!best || score > best.score)) best = { item, score, title: t }
  }
  return best
}

/**
 * Analyse an activity note against a project's open tasks + milestones.
 * Only open tasks and not-done milestones are considered as action targets.
 */
export function analyzeActivity(
  body: string,
  tasks: ProjectTask[],
  milestones: ProjectMilestone[],
): ActivityAnalysis {
  const trimmed = body.trim()
  if (!trimmed) return { match: null, action: 'none', confidence: 0, reason: '' }

  const bodyTokens = new Set(tokenize(trimmed))
  const openTasks = tasks.filter((t) => !t.done)
  const openMilestones = milestones.filter((m) => !m.done)

  const taskHit = bestMatch(bodyTokens, openTasks, (t) => t.name)
  const msHit = bestMatch(bodyTokens, openMilestones, (m) => m.title)

  // Pick the stronger of the two; milestones win ties (coarser-grained).
  let kind: 'task' | 'milestone' | null = null
  let hit: Scored<ProjectTask | ProjectMilestone> | null = null
  if (taskHit && (!msHit || taskHit.score > msHit.score)) {
    kind = 'task'; hit = taskHit as Scored<ProjectTask | ProjectMilestone>
  } else if (msHit) {
    kind = 'milestone'; hit = msHit as Scored<ProjectTask | ProjectMilestone>
  }

  if (!kind || !hit) {
    return { match: null, action: 'none', confidence: 0, reason: 'Genoteerd (geen koppeling gevonden).' }
  }

  const match: ActivityMatch = { type: kind, id: (hit.item as { id: string }).id, title: hit.title }
  const isDone = hasAny(trimmed, DONE_WORDS)
  const isProgress = hasAny(trimmed, PROGRESS_WORDS)
  const pct = detectPercent(trimmed)
  // Confidence blends match quality with how decisive the intent is.
  const confidence = Math.min(1, hit.score * 0.7 + (isDone || pct != null ? 0.3 : isProgress ? 0.15 : 0))

  if (kind === 'task') {
    if (isDone) {
      return { match, action: 'complete', confidence, reason: `Taak “${hit.title}” afvinken` }
    }
    return { match, action: 'link', confidence, reason: `Gekoppeld aan taak “${hit.title}”` }
  }

  // milestone
  if (pct != null) {
    return { match, action: 'progress', progress: pct, confidence, reason: `Mijlpaal “${hit.title}” → ${Math.round(pct * 100)}%` }
  }
  if (isDone) {
    return { match, action: 'progress', progress: 1, confidence, reason: `Mijlpaal “${hit.title}” → 100% (afgerond)` }
  }
  if (isProgress) {
    return { match, action: 'link', confidence, reason: `Gekoppeld aan mijlpaal “${hit.title}”` }
  }
  return { match, action: 'link', confidence, reason: `Gekoppeld aan mijlpaal “${hit.title}”` }
}
