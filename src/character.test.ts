import { describe, it, expect } from 'vitest'
import {
  goalProgress,
  computeDomainAttributes,
  computeGapDeltas,
  overallProgress,
  computeSkillTree,
  computeMilestonePath,
  computeQuestLog,
  computeCharacterStats,
  ALL_DOMAINS,
} from './character'
import type { Goal, Milestone, Habit } from './types'

function goal(partial: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    title: 'Test goal',
    metric: 'EUR',
    target: 100,
    current: 0,
    deadline: '2026-12-31',
    domain: 'prjct',
    ...partial,
  }
}

function milestone(partial: Partial<Milestone> = {}): Milestone {
  return { id: 'm1', goalId: 'g1', title: 'Test milestone', done: false, due: null, ...partial }
}

function habit(partial: Partial<Habit> = {}): Habit {
  return { id: 'h1', name: 'Test habit', streak: 0, doneToday: false, emoji: '🔥', ...partial }
}

describe('goalProgress', () => {
  it('is 0 with no progress', () => {
    expect(goalProgress(goal({ current: 0, target: 100 }))).toBe(0)
  })
  it('clamps at 1 when current exceeds target', () => {
    expect(goalProgress(goal({ current: 150, target: 100 }))).toBe(1)
  })
  it('handles a target of 0 without dividing by zero', () => {
    expect(goalProgress(goal({ current: 0, target: 0 }))).toBe(0)
    expect(goalProgress(goal({ current: 5, target: 0 }))).toBe(1)
  })
})

describe('computeDomainAttributes', () => {
  it('returns all five domains even with zero goals', () => {
    const attrs = computeDomainAttributes([])
    expect(attrs).toHaveLength(ALL_DOMAINS.length)
    expect(attrs.every((a) => a.avgProgress === 0 && a.goals.length === 0)).toBe(true)
  })
  it('averages progress within a domain, ignores other domains', () => {
    const goals = [
      goal({ id: 'g1', domain: 'prjct', current: 50, target: 100 }),
      goal({ id: 'g2', domain: 'prjct', current: 100, target: 100 }),
      goal({ id: 'g3', domain: 'personal', current: 0, target: 10 }),
    ]
    const attrs = computeDomainAttributes(goals)
    const prjct = attrs.find((a) => a.domain === 'prjct')!
    expect(prjct.avgProgress).toBeCloseTo(0.75)
    expect(prjct.goals).toHaveLength(2)
  })
})

describe('computeGapDeltas', () => {
  it('returns nothing when there are no goals', () => {
    expect(computeGapDeltas([])).toEqual([])
  })
  it('picks the single worst goal per domain, ranked by relative gap', () => {
    const goals = [
      goal({ id: 'g1', domain: 'prjct', current: 90, target: 100 }), // gap 0.1
      goal({ id: 'g2', domain: 'prjct', current: 0, target: 100 }), // gap 1.0 — worse, same domain
      goal({ id: 'g3', domain: 'personal', current: 50, target: 100 }), // gap 0.5
    ]
    const deltas = computeGapDeltas(goals, 3)
    expect(deltas).toHaveLength(2) // one per domain, not per goal
    expect(deltas[0].goalId).toBe('g2')
    expect(deltas[0].gapPct).toBeCloseTo(1)
    expect(deltas[1].goalId).toBe('g3')
  })
  it('excludes goals already at or past target', () => {
    const goals = [goal({ id: 'g1', domain: 'prjct', current: 100, target: 100 })]
    expect(computeGapDeltas(goals)).toEqual([])
  })
  it('respects the limit', () => {
    const goals = ALL_DOMAINS.map((domain, i) => goal({ id: `g${i}`, domain, current: 0, target: 100 }))
    expect(computeGapDeltas(goals, 2)).toHaveLength(2)
  })
})

describe('overallProgress', () => {
  it('is 0 with no goals anywhere', () => {
    expect(overallProgress(computeDomainAttributes([]))).toBe(0)
  })
  it('averages only domains that have goals', () => {
    const goals = [goal({ domain: 'prjct', current: 100, target: 100 })]
    expect(overallProgress(computeDomainAttributes(goals))).toBeCloseTo(1)
  })
})

describe('computeSkillTree', () => {
  it('gives every empty domain a single locked placeholder node', () => {
    const branches = computeSkillTree([], [])
    expect(branches).toHaveLength(ALL_DOMAINS.length)
    for (const b of branches) {
      expect(b.nodes).toHaveLength(1)
      expect(b.nodes[0].status).toBe('locked')
      expect(b.progress).toBe(0)
    }
  })
  it('derives node status from goal progress', () => {
    const goals = [
      goal({ id: 'g1', domain: 'prjct', current: 0, target: 100 }),
      goal({ id: 'g2', domain: 'prjct', current: 50, target: 100 }),
      goal({ id: 'g3', domain: 'prjct', current: 100, target: 100 }),
    ]
    const branch = computeSkillTree(goals, []).find((b) => b.domain === 'prjct')!
    const byId = Object.fromEntries(branch.nodes.map((n) => [n.id, n]))
    expect(byId.g1.status).toBe('locked')
    expect(byId.g2.status).toBe('in_progress')
    expect(byId.g3.status).toBe('mastered')
  })
  it('nests milestones under their goal, only the first undone one is in_progress', () => {
    const goals = [goal({ id: 'g1', domain: 'prjct', current: 10, target: 100 })]
    const milestones = [
      milestone({ id: 'm1', goalId: 'g1', due: '2026-01-01', done: true }),
      milestone({ id: 'm2', goalId: 'g1', due: '2026-02-01', done: false }),
      milestone({ id: 'm3', goalId: 'g1', due: '2026-03-01', done: false }),
    ]
    const branch = computeSkillTree(goals, milestones).find((b) => b.domain === 'prjct')!
    const children = branch.nodes[0].children
    expect(children.map((c) => c.status)).toEqual(['mastered', 'in_progress', 'locked'])
  })
  it('scales to a large number of goals in one domain without special-casing', () => {
    const goals = Array.from({ length: 25 }, (_, i) => goal({ id: `g${i}`, domain: 'prjct', current: i, target: 100 }))
    const branch = computeSkillTree(goals, []).find((b) => b.domain === 'prjct')!
    expect(branch.nodes).toHaveLength(25)
  })
})

describe('computeMilestonePath', () => {
  it('is empty with no milestones', () => {
    expect(computeMilestonePath([], [])).toEqual([])
  })
  it('marks the earliest undone milestone per goal as current, later ones upcoming', () => {
    const goals = [goal({ id: 'g1', domain: 'buurtkaart' })]
    const milestones = [
      milestone({ id: 'm1', goalId: 'g1', due: '2026-03-01' }),
      milestone({ id: 'm2', goalId: 'g1', due: '2026-01-01' }),
      milestone({ id: 'm3', goalId: 'g1', due: '2026-02-01', done: true }),
    ]
    const path = computeMilestonePath(goals, milestones)
    const byId = Object.fromEntries(path.map((s) => [s.id, s]))
    expect(byId.m3.status).toBe('done')
    expect(byId.m2.status).toBe('current') // earliest due date, undone
    expect(byId.m1.status).toBe('upcoming')
    expect(byId.m1.domain).toBe('buurtkaart')
  })
})

describe('computeQuestLog', () => {
  it('is empty with nothing active', () => {
    expect(computeQuestLog([], [], '2026-01-01')).toEqual([])
  })
  it('grants more XP the more overdue/urgent a quest is', () => {
    const goals = [
      goal({ id: 'g1', domain: 'prjct' }),
      goal({ id: 'g2', domain: 'personal' }),
      goal({ id: 'g3', domain: 'buurtkaart' }),
    ]
    const milestones = [
      milestone({ id: 'm1', goalId: 'g1', due: '2025-12-01' }), // overdue
      milestone({ id: 'm2', goalId: 'g2', due: '2026-01-04' }), // in 3 days
      milestone({ id: 'm3', goalId: 'g3', due: '2026-06-01' }), // far out
    ]
    const quests = computeQuestLog(goals, milestones, '2026-01-01', 5)
    expect(quests[0].id).toBe('m1')
    expect(quests[0].overdue).toBe(true)
    expect(quests[0].xpReward).toBeGreaterThan(quests[1].xpReward)
    expect(quests[1].xpReward).toBeGreaterThan(quests[2].xpReward)
  })
  it('respects the limit', () => {
    const goals = ALL_DOMAINS.map((domain, i) => goal({ id: `g${i}`, domain }))
    const milestones = goals.map((g, i) => milestone({ id: `m${i}`, goalId: g.id, due: `2026-0${i + 1}-01` }))
    expect(computeQuestLog(goals, milestones, '2026-01-01', 2)).toHaveLength(2)
  })
})

describe('computeCharacterStats', () => {
  it('starts at level 1, no XP, base title, with nothing tracked', () => {
    const stats = computeCharacterStats([], [], [])
    expect(stats.level).toBe(1)
    expect(stats.xp).toBe(0)
    expect(stats.streakCount).toBe(0)
    expect(stats.streakLabel).toBeNull()
  })
  it('levels up from completed goals, milestones, and habit streaks', () => {
    const goals = [goal({ id: 'g1', current: 100, target: 100 })]
    const milestones = [milestone({ id: 'm1', done: true })]
    const habits = [habit({ id: 'h1', name: 'Hardlopen', streak: 10 })]
    const stats = computeCharacterStats(goals, milestones, habits)
    // 1*100 + 1*20 + 10*2 = 140 xp
    expect(stats.xp).toBe(140)
    expect(stats.level).toBe(1)
    expect(stats.streakCount).toBe(10)
    expect(stats.streakLabel).toBe('Hardlopen')
  })
  it('caps a single habit streak contribution so one habit cannot dominate XP', () => {
    const habits = [habit({ id: 'h1', streak: 1000 })]
    const stats = computeCharacterStats([], [], habits)
    expect(stats.xp).toBe(60 * 2) // capped at 60 days
  })
  it('never returns an out-of-range title even at very high XP', () => {
    const goals = Array.from({ length: 200 }, (_, i) => goal({ id: `g${i}`, current: 100, target: 100 }))
    const stats = computeCharacterStats(goals, [], [])
    expect(stats.title).toBe('Legende')
    expect(stats.nextTitle).toBeNull()
  })
})
