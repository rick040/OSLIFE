// Proactive suggestions for the Dashboard attention feed — reuses existing
// detection rather than inventing new brain calls: R5/R11 already compute
// spending-pattern inferences server-side (pattern_engine_profile.sql) but
// sat buried in Memory's "Inferenties" tab; braindump→workout has no prior
// detector, so it gets a small hand-curated keyword list, matching the
// house style of planner.ts's inferHabitTiming.

import type { BraindumpEntry, BraindumpLink, InferredItem } from '../types'
import { daysBetween, TODAY } from '../domains'

export interface ProactiveNudge {
  text: string
  reason: string
  cta: { label: string; view: string }
}

/** R11 (budget_cap_suggestion) and R5 (subscription_candidate) — the two
 * pattern-engine rules that are, in shape, exactly "recommendation based on
 * spending habits". Their question text is already written for a human. */
const MONEY_INFERENCE_TYPES = new Set(['budget_cap_suggestion', 'subscription_candidate'])

export function financeInferenceNudges(inferences: InferredItem[]): ProactiveNudge[] {
  return inferences
    .filter((i) => MONEY_INFERENCE_TYPES.has(i.type))
    .map((i) => ({
      text: i.question,
      reason: i.type === 'subscription_candidate' ? 'mogelijk abonnement gevonden in je uitgaven' : 'budgetadvies op basis van je uitgavenpatroon',
      cta: { label: 'Naar Geheugen', view: 'memory' },
    }))
}

const WORKOUT_WORDS = [
  'workout', 'work-out', 'training', 'trainingsschema', 'gym', 'fitness',
  'oefening', 'oefeningen', 'spier', 'spieren', 'sporten', 'sportschema',
  'krachttraining', 'cardio', 'hiit', 'push up', 'push-up', 'squat', 'deadlift',
  'bench press', 'bankdrukken', 'schema',
]

function mentionsWorkout(e: BraindumpEntry): boolean {
  const haystack = [e.title, e.summary, e.markdown, ...e.tags].filter(Boolean).join(' ').toLowerCase()
  return WORKOUT_WORDS.some((w) => haystack.includes(w))
}

/** The most recent unactioned (no braindump_link yet), workout-flavoured
 * braindump capture within `days` — e.g. an Instagram reel shared into
 * Braindump about a new split, never filed under a task or Kennisbank entry. */
export function findUnactionedWorkoutBraindump(
  entries: BraindumpEntry[],
  links: BraindumpLink[],
  days = 14,
): BraindumpEntry | null {
  const linkedIds = new Set(links.map((l) => l.braindumpEntryId))
  const hit = entries
    .filter((e) => e.status === 'ready' && !linkedIds.has(e.id) && daysBetween(e.createdAt, TODAY) <= days)
    .find(mentionsWorkout)
  return hit ?? null
}

export function workoutBraindumpNudge(entry: BraindumpEntry): ProactiveNudge {
  const label = entry.title?.trim() || 'iets dat je deelde'
  return {
    text: `Je deelde **"${label}"** — tijd om je trainingsschema te herzien?`,
    reason: 'braindump over trainen, nog niet opgevolgd',
    cta: { label: 'Naar Trainen', view: 'workout' },
  }
}
