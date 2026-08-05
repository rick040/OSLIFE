import { describe, it, expect } from 'vitest'
import {
  goalProgress,
  computeDomainAttributes,
  computeGapDeltas,
  overallProgress,
  xpForLevel,
  levelForXp,
  computeDomainXp,
  computeDomainLevel,
  computeDomainLevels,
  computeTotalLevel,
  computeSkillTree,
  computeMilestonePath,
  computeQuestLog,
  computeCharacterStats,
  ALL_DOMAINS,
  MAX_LEVEL,
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

describe('xpForLevel / levelForXp — RuneScape-shaped curve', () => {
  it('level 1 needs 0 xp', () => {
    expect(xpForLevel(1)).toBe(0)
    expect(levelForXp(0)).toBe(1)
  })
  it('is monotonically increasing and accelerating (RuneScape shape)', () => {
    const gaps: number[] = []
    for (let l = 1; l < MAX_LEVEL; l++) {
      const gap = xpForLevel(l + 1) - xpForLevel(l)
      expect(gap).toBeGreaterThanOrEqual(0)
      gaps.push(gap)
    }
    // the xp gap between consecutive levels should be clearly bigger near
    // the top of the curve than near the bottom — the defining RS trait.
    expect(gaps[90]).toBeGreaterThan(gaps[10])
  })
  it('levelForXp is the inverse of xpForLevel at exact thresholds', () => {
    for (const l of [1, 10, 25, 50, 75, 99]) {
      expect(levelForXp(xpForLevel(l))).toBe(l)
    }
  })
  it('never exceeds MAX_LEVEL no matter how much xp is thrown at it', () => {
    expect(levelForXp(10_000_000)).toBe(MAX_LEVEL)
  })
})

describe('computeDomainXp / computeDomainLevel', () => {
  it('is 0 with no goals or milestones in the domain', () => {
    expect(computeDomainXp('prjct', [], [])).toBe(0)
    const dl = computeDomainLevel('prjct', [], [])
    expect(dl.xp).toBe(0)
    expect(dl.level).toBe(1)
    expect(dl.atMaxLevel).toBe(false)
  })
  it('gives partial credit for in-progress goals, full credit at 100%', () => {
    const goals = [goal({ id: 'g1', domain: 'prjct', current: 50, target: 100 })]
    expect(computeDomainXp('prjct', goals, [])).toBe(50)
    const goalsDone = [goal({ id: 'g1', domain: 'prjct', current: 100, target: 100 })]
    expect(computeDomainXp('prjct', goalsDone, [])).toBe(100)
  })
  it('adds xp for completed milestones that belong to a goal in this domain only', () => {
    const goals = [
      goal({ id: 'g1', domain: 'prjct', current: 0, target: 100 }),
      goal({ id: 'g2', domain: 'personal', current: 0, target: 100 }),
    ]
    const milestones = [
      milestone({ id: 'm1', goalId: 'g1', done: true }),
      milestone({ id: 'm2', goalId: 'g2', done: true }), // different domain, must not count
      milestone({ id: 'm3', goalId: 'g1', done: false }), // not done, must not count
    ]
    expect(computeDomainXp('prjct', goals, milestones)).toBe(20)
  })
  it('ignores goals/milestones from other domains entirely', () => {
    const goals = [goal({ id: 'g1', domain: 'personal', current: 100, target: 100 })]
    expect(computeDomainXp('prjct', goals, [])).toBe(0)
  })
})

describe('computeDomainLevels / computeTotalLevel', () => {
  it('returns all five domains and sums to the total level', () => {
    const goals = [
      goal({ id: 'g1', domain: 'prjct', current: 100, target: 100 }),
      goal({ id: 'g2', domain: 'personal', current: 50, target: 100 }),
    ]
    const levels = computeDomainLevels(goals, [])
    expect(levels).toHaveLength(ALL_DOMAINS.length)
    const total = computeTotalLevel(levels)
    expect(total).toBe(levels.reduce((s, l) => s + l.level, 0))
    expect(total).toBeGreaterThan(ALL_DOMAINS.length) // at least one domain leveled past 1
  })
})

describe('computeSkillTree', () => {
  it('gives every empty domain a single locked placeholder node and carries a level', () => {
    const branches = computeSkillTree([], [])
    expect(branches).toHaveLength(ALL_DOMAINS.length)
    for (const b of branches) {
      expect(b.nodes).toHaveLength(1)
      expect(b.nodes[0].status).toBe('locked')
      expect(b.progress).toBe(0)
      expect(b.level.level).toBe(1)
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
      milestone({ id: 'm1', goalId: 'g1', title: 'Derde', due: '2026-03-01' }),
      milestone({ id: 'm2', goalId: 'g1', title: 'Eerste', due: '2026-01-01' }),
      milestone({ id: 'm3', goalId: 'g1', title: 'Tweede', due: '2026-02-01', done: true }),
    ]
    const path = computeMilestonePath(goals, milestones)
    const byId = Object.fromEntries(path.map((s) => [s.id, s]))
    expect(byId.m3.status).toBe('done')
    expect(byId.m2.status).toBe('current') // earliest due date, undone
    expect(byId.m1.status).toBe('upcoming')
    expect(byId.m1.domain).toBe('buurtkaart')
  })
  it('chains difficulty and the "requires" title by chronological position within the goal', () => {
    const goals = [goal({ id: 'g1', domain: 'prjct' })]
    const milestones = [
      milestone({ id: 'm1', goalId: 'g1', title: 'Stap 1', due: '2026-01-01' }),
      milestone({ id: 'm2', goalId: 'g1', title: 'Stap 2', due: '2026-02-01' }),
      milestone({ id: 'm3', goalId: 'g1', title: 'Stap 3', due: '2026-03-01' }),
      milestone({ id: 'm4', goalId: 'g1', title: 'Stap 4', due: '2026-04-01' }),
      milestone({ id: 'm5', goalId: 'g1', title: 'Stap 5', due: '2026-05-01' }),
    ]
    const path = computeMilestonePath(goals, milestones)
    const byId = Object.fromEntries(path.map((s) => [s.id, s]))
    expect(byId.m1.requiresTitle).toBeNull()
    expect(byId.m1.difficulty).toBe('Beginner')
    expect(byId.m2.requiresTitle).toBe('Stap 1')
    expect(byId.m2.difficulty).toBe('Gemiddeld')
    expect(byId.m3.difficulty).toBe('Ervaren')
    expect(byId.m4.difficulty).toBe('Meester')
    expect(byId.m5.difficulty).toBe('Meester') // caps out, doesn't keep escalating forever
    expect(byId.m5.requiresTitle).toBe('Stap 4')
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
  it('carries the same difficulty/requirement chain as the milestone path', () => {
    const goals = [goal({ id: 'g1', domain: 'prjct' })]
    const milestones = [
      milestone({ id: 'm1', goalId: 'g1', title: 'Eerste', due: '2026-01-01', done: true }),
      milestone({ id: 'm2', goalId: 'g1', title: 'Tweede', due: '2026-02-01' }),
    ]
    const quests = computeQuestLog(goals, milestones, '2026-01-01')
    expect(quests[0].id).toBe('m2')
    expect(quests[0].requiresTitle).toBe('Eerste')
    expect(quests[0].difficulty).toBe('Gemiddeld')
  })
  it('respects the limit', () => {
    const goals = ALL_DOMAINS.map((domain, i) => goal({ id: `g${i}`, domain }))
    const milestones = goals.map((g, i) => milestone({ id: `m${i}`, goalId: g.id, due: `2026-0${i + 1}-01` }))
    expect(computeQuestLog(goals, milestones, '2026-01-01', 2)).toHaveLength(2)
  })
})

describe('computeCharacterStats', () => {
  it('starts at total level = number of domains, no streak, base title, with nothing tracked', () => {
    const stats = computeCharacterStats([], [], [])
    expect(stats.totalLevel).toBe(ALL_DOMAINS.length) // every domain starts at level 1
    expect(stats.maxTotalLevel).toBe(ALL_DOMAINS.length * MAX_LEVEL)
    expect(stats.title).toBe('Beginner')
    expect(stats.streakCount).toBe(0)
    expect(stats.streakLabel).toBeNull()
    expect(stats.nearestLevelUp).toBeNull() // no goals anywhere → nothing actionable to nudge toward
  })
  it('raises total level and counts from completed goals/milestones/habit streaks', () => {
    const goals = [goal({ id: 'g1', current: 100, target: 100 })]
    const milestones = [milestone({ id: 'm1', done: true })]
    const habits = [habit({ id: 'h1', name: 'Hardlopen', streak: 10 })]
    const stats = computeCharacterStats(goals, milestones, habits)
    expect(stats.goalsAchieved).toBe(1)
    expect(stats.milestonesDone).toBe(1)
    expect(stats.streakCount).toBe(10)
    expect(stats.streakLabel).toBe('Hardlopen')
    expect(stats.totalLevel).toBeGreaterThan(ALL_DOMAINS.length) // prjct leveled up past 1
  })
  it('suggests the domain closest to its next level-up, only among domains with goals', () => {
    const goals = [
      goal({ id: 'g1', domain: 'prjct', current: 90, target: 100 }), // close to leveling
      goal({ id: 'g2', domain: 'personal', current: 5, target: 100 }), // far from leveling
    ]
    const stats = computeCharacterStats(goals, [], [])
    expect(stats.nearestLevelUp).not.toBeNull()
    expect(['prjct', 'personal']).toContain(stats.nearestLevelUp!.domain)
    expect(stats.nearestLevelUp!.xpNeeded).toBeGreaterThanOrEqual(0)
  })
  it('never returns an out-of-range title even at max total level across every domain', () => {
    // Enough fully-achieved goals in EVERY domain to push each one to MAX_LEVEL
    // (100 xp per achieved goal — see computeDomainXp) — deliberately derived
    // from xpForLevel rather than a guessed goal count, so this stays correct
    // if the curve/scale ever changes.
    const goalsNeeded = Math.ceil(xpForLevel(MAX_LEVEL) / 100)
    const goals = ALL_DOMAINS.flatMap((domain) =>
      Array.from({ length: goalsNeeded }, (_, i) => goal({ id: `${domain}-${i}`, domain, current: 1, target: 1 })),
    )
    const stats = computeCharacterStats(goals, [], [])
    expect(stats.totalLevel).toBe(ALL_DOMAINS.length * MAX_LEVEL)
    expect(stats.title).toBe('Legende')
    expect(stats.nextTitle).toBeNull()
  })
})
