import { describe, it, expect } from 'vitest'
import { financeInferenceNudges, findUnactionedWorkoutBraindump, workoutBraindumpNudge } from './proactiveNudges'
import { TODAY } from '../domains'
import type { BraindumpEntry, BraindumpLink, InferredItem } from '../types'

function inference(partial: Partial<InferredItem> = {}): InferredItem {
  return {
    id: 'i1', ruleId: 'r11', type: 'budget_cap_suggestion', domains: ['finance'],
    confidence: 0.8, question: 'Wil je een budgetplafond instellen voor boodschappen?',
    occurredAt: new Date().toISOString(), payload: {},
    ...partial,
  }
}

function entry(partial: Partial<BraindumpEntry> = {}): BraindumpEntry {
  return {
    id: 'b1', createdAt: new Date().toISOString(), sourceKind: 'text', status: 'ready',
    title: null, sourceUrl: null, markdown: null, summary: null, domain: null, kind: null,
    sentiment: null, tags: [], thumbUrl: null, meta: {}, error: null,
    ...partial,
  }
}

describe('financeInferenceNudges', () => {
  it('surfaces budget_cap_suggestion and subscription_candidate inferences', () => {
    const out = financeInferenceNudges([
      inference({ id: 'i1', type: 'budget_cap_suggestion', question: 'Budgetplafond?' }),
      inference({ id: 'i2', type: 'subscription_candidate', question: 'Abonnement gevonden?' }),
    ])
    expect(out).toHaveLength(2)
    expect(out[0].text).toBe('Budgetplafond?')
    expect(out[0].cta).toEqual({ label: 'Naar Geheugen', view: 'memory' })
  })

  it('ignores unrelated inference types', () => {
    expect(financeInferenceNudges([inference({ type: 'theme_detected' })])).toEqual([])
  })

  it('returns nothing when there are no pending inferences', () => {
    expect(financeInferenceNudges([])).toEqual([])
  })
})

describe('findUnactionedWorkoutBraindump', () => {
  it('finds a recent, unlinked, workout-flavoured entry', () => {
    const e = entry({ id: 'b1', title: 'Nieuw pull-day schema van Instagram reel' })
    const hit = findUnactionedWorkoutBraindump([e], [])
    expect(hit?.id).toBe('b1')
  })

  it('matches on tags/summary too, not just title', () => {
    const e = entry({ id: 'b1', title: 'Reel', summary: 'Goede workout ideeën voor cardio' })
    expect(findUnactionedWorkoutBraindump([e], [])?.id).toBe('b1')
  })

  it('skips entries already linked to a task or Kennisbank entry', () => {
    const e = entry({ id: 'b1', title: 'Krachttraining schema' })
    const link: BraindumpLink = { id: 'l1', createdAt: new Date().toISOString(), braindumpEntryId: 'b1', linkedType: 'task', linkedId: 't1' }
    expect(findUnactionedWorkoutBraindump([e], [link])).toBeNull()
  })

  it('skips entries with no workout signal', () => {
    const e = entry({ id: 'b1', title: 'Interessant artikel over marketing' })
    expect(findUnactionedWorkoutBraindump([e], [])).toBeNull()
  })

  it('skips entries older than the recency window', () => {
    const old = new Date(new Date(TODAY).getTime() - 30 * 86400000).toISOString()
    const e = entry({ id: 'b1', title: 'Workout schema', createdAt: old })
    expect(findUnactionedWorkoutBraindump([e], [])).toBeNull()
  })

  it('skips entries still pending ingest', () => {
    const e = entry({ id: 'b1', title: 'Workout schema', status: 'pending' })
    expect(findUnactionedWorkoutBraindump([e], [])).toBeNull()
  })
})

describe('workoutBraindumpNudge', () => {
  it('builds a nudge referencing the entry title with a CTA to the workout view', () => {
    const n = workoutBraindumpNudge(entry({ title: 'Pull day reel' }))
    expect(n.text).toContain('Pull day reel')
    expect(n.cta).toEqual({ label: 'Naar Trainen', view: 'workout' })
  })

  it('falls back gracefully when the entry has no title', () => {
    const n = workoutBraindumpNudge(entry({ title: null }))
    expect(n.text).toContain('iets dat je deelde')
  })
})
