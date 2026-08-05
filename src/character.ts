// ── Character profile: pure projections over goals/milestones/habits ────────
// The gamified profile screen (src/views/Profile.tsx, "Personage" tab) needs
// RPG framing — attributes, a skill tree, quests, a milestone path, level/XP —
// but none of that is new data. It's a *read* over data Rick already tracks:
// `goals` (current/target/metric/domain — already exactly a stat-bar-with-
// target-marker), `milestones` (already the long-term path), and `habits`
// (already a streak). Reusing these instead of a parallel schema means the
// screen can never show a placeholder number, and deleting the whole feature
// loses nothing that isn't already durable somewhere else. Everything here is
// a pure function of its inputs — testable without touching the store or UI.
import type { Goal, Milestone, Habit, Domain } from './types'

/** Display order for the five life-domain "attributes" / skill-tree branches. */
export const ALL_DOMAINS: Domain[] = ['parkingyou', 'prjct', 'buurtkaart', 'personal', 'cross']

/** 0..1 how far a goal is toward its target. Guards target<=0 (can't divide). */
export function goalProgress(goal: Pick<Goal, 'current' | 'target'>): number {
  if (goal.target <= 0) return goal.current > 0 ? 1 : 0
  return Math.max(0, Math.min(1, goal.current / goal.target))
}

// ── Attributes (stat bars) ───────────────────────────────────────────────────

export interface DomainAttribute {
  domain: Domain
  goals: Goal[]
  /** 0..1 average progress across this domain's goals; 0 with no goals. */
  avgProgress: number
}

export function computeDomainAttributes(goals: Goal[]): DomainAttribute[] {
  return ALL_DOMAINS.map((domain) => {
    const domainGoals = goals.filter((g) => g.domain === domain)
    const avgProgress = domainGoals.length
      ? domainGoals.reduce((sum, g) => sum + goalProgress(g), 0) / domainGoals.length
      : 0
    return { domain, goals: domainGoals, avgProgress }
  })
}

// ── Gap deltas — the biggest "current vs becoming" gaps, for the delta chips ─

export interface GapDelta {
  domain: Domain
  goalId: string
  goalTitle: string
  metric: string
  current: number
  target: number
  /** 0..1, how far this goal still is from its target (1 = not started). */
  gapPct: number
}

/**
 * Top-N gaps, one per domain at most (so the chips read as "your biggest gap
 * per area of life", not five instances of the same worst domain). Ranked by
 * largest relative gap — a €50 gap on a €100 goal outranks a €500 gap on a
 * €50,000 goal, since the point is "how far are you, proportionally."
 */
export function computeGapDeltas(goals: Goal[], limit = 3): GapDelta[] {
  const worstPerDomain = new Map<Domain, Goal>()
  for (const g of goals) {
    if (g.target <= 0) continue
    const prior = worstPerDomain.get(g.domain)
    if (!prior || goalProgress(g) < goalProgress(prior)) worstPerDomain.set(g.domain, g)
  }
  return [...worstPerDomain.values()]
    .map((g) => ({
      domain: g.domain,
      goalId: g.id,
      goalTitle: g.title,
      metric: g.metric,
      current: g.current,
      target: g.target,
      gapPct: 1 - goalProgress(g),
    }))
    .filter((d) => d.gapPct > 0)
    .sort((a, b) => b.gapPct - a.gapPct)
    .slice(0, limit)
}

/** Overall 0..1 progress across every tracked domain — drives the gap visual. */
export function overallProgress(attributes: DomainAttribute[]): number {
  const withGoals = attributes.filter((a) => a.goals.length > 0)
  if (!withGoals.length) return 0
  return withGoals.reduce((sum, a) => sum + a.avgProgress, 0) / withGoals.length
}

// ── Skill tree — branch per domain, node per goal, sub-node per milestone ───

export type NodeStatus = 'mastered' | 'in_progress' | 'locked'

export interface SkillNode {
  id: string
  label: string
  status: NodeStatus
  /** 0..1 own progress (goal: goalProgress; milestone: 0 or 1; placeholder: 0). */
  progress: number
  dueDate: string | null
  children: SkillNode[]
}

export interface SkillBranch {
  domain: Domain
  nodes: SkillNode[]
  /** 0..1 branch-level aggregate (average of its goal nodes' progress). */
  progress: number
}

function milestoneNodes(milestones: Milestone[]): SkillNode[] {
  let seenCurrent = false
  return milestones.map((m) => {
    let status: NodeStatus
    if (m.done) status = 'mastered'
    else if (!seenCurrent) {
      status = 'in_progress'
      seenCurrent = true
    } else status = 'locked'
    return { id: m.id, label: m.title, status, progress: m.done ? 1 : 0, dueDate: m.due, children: [] }
  })
}

export function computeSkillTree(goals: Goal[], milestones: Milestone[]): SkillBranch[] {
  return ALL_DOMAINS.map((domain) => {
    const domainGoals = goals.filter((g) => g.domain === domain)
    if (!domainGoals.length) {
      return {
        domain,
        progress: 0,
        nodes: [{ id: `${domain}-empty`, label: 'Nog geen doel', status: 'locked', progress: 0, dueDate: null, children: [] }],
      }
    }
    const nodes: SkillNode[] = domainGoals.map((g) => {
      const progress = goalProgress(g)
      const status: NodeStatus = progress >= 1 ? 'mastered' : progress > 0 ? 'in_progress' : 'locked'
      const ownMilestones = milestones
        .filter((m) => m.goalId === g.id)
        .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
      return { id: g.id, label: g.title, status, progress, dueDate: null, children: milestoneNodes(ownMilestones) }
    })
    const progress = nodes.reduce((sum, n) => sum + n.progress, 0) / nodes.length
    return { domain, nodes, progress }
  })
}

// ── Milestone path — every milestone, status derived, chronological ─────────

export type MilestoneStatus = 'done' | 'current' | 'upcoming'

export interface MilestoneStep {
  id: string
  title: string
  domain: Domain
  goalTitle: string | null
  status: MilestoneStatus
  dueDate: string | null
}

export function computeMilestonePath(goals: Goal[], milestones: Milestone[]): MilestoneStep[] {
  const goalById = new Map(goals.map((g) => [g.id, g]))
  const sorted = [...milestones].sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
  const currentSeenForGoal = new Set<string>()
  return sorted.map((m) => {
    const goal = m.goalId ? goalById.get(m.goalId) : undefined
    let status: MilestoneStatus
    if (m.done) status = 'done'
    else {
      const key = m.goalId ?? '__no_goal__'
      if (!currentSeenForGoal.has(key)) {
        status = 'current'
        currentSeenForGoal.add(key)
      } else status = 'upcoming'
    }
    return {
      id: m.id,
      title: m.title,
      domain: goal?.domain ?? 'cross',
      goalTitle: goal?.title ?? null,
      status,
      dueDate: m.due,
    }
  })
}

// ── Quest log — the next actionable milestone per goal, short-term framing ──

export interface QuestItem {
  id: string
  title: string
  domain: Domain
  goalTitle: string | null
  dueDate: string | null
  daysUntilDue: number | null
  overdue: boolean
  xpReward: number
}

function xpForDueDate(daysUntilDue: number | null): number {
  if (daysUntilDue === null) return 10
  if (daysUntilDue < 0) return 50
  if (daysUntilDue <= 7) return 35
  if (daysUntilDue <= 30) return 20
  return 10
}

export function computeQuestLog(goals: Goal[], milestones: Milestone[], todayIso: string, limit = 5): QuestItem[] {
  const path = computeMilestonePath(goals, milestones)
  const active = path.filter((s) => s.status === 'current')
  const withDays = active.map((s) => {
    const daysUntilDue = s.dueDate ? daysBetweenIso(todayIso, s.dueDate) : null
    return {
      id: s.id,
      title: s.title,
      domain: s.domain,
      goalTitle: s.goalTitle,
      dueDate: s.dueDate,
      daysUntilDue,
      overdue: daysUntilDue !== null && daysUntilDue < 0,
      xpReward: xpForDueDate(daysUntilDue),
    }
  })
  return withDays
    .sort((a, b) => {
      if (a.daysUntilDue === null) return 1
      if (b.daysUntilDue === null) return -1
      return a.daysUntilDue - b.daysUntilDue
    })
    .slice(0, limit)
}

function daysBetweenIso(a: string, b: string): number {
  const da = new Date(a.slice(0, 10) + 'T00:00:00').getTime()
  const db = new Date(b.slice(0, 10) + 'T00:00:00').getTime()
  return Math.round((db - da) / 86400000)
}

// ── Character stats — level/XP/title/streak, all derived, no stored counter ─

/** Dutch tier names, lowest → highest. Level 1 = titles[0], capped at the last. */
const TITLES = ['Beginner', 'Leerling', 'Beoefenaar', 'Gevorderde', 'Vakman', 'Meester', 'Grootmeester', 'Legende']

/** XP needed per level — flat, documented here rather than tuned per-domain. */
const XP_PER_LEVEL = 250

export interface CharacterStats {
  level: number
  xp: number
  xpIntoLevel: number
  xpPerLevel: number
  title: string
  nextTitle: string | null
  goalsAchieved: number
  milestonesDone: number
  /** Longest-running habit streak, if any habit exists. */
  streakCount: number
  streakLabel: string | null
}

export function computeCharacterStats(goals: Goal[], milestones: Milestone[], habits: Habit[]): CharacterStats {
  const goalsAchieved = goals.filter((g) => g.target > 0 && goalProgress(g) >= 1).length
  const milestonesDone = milestones.filter((m) => m.done).length
  const habitXp = habits.reduce((sum, h) => sum + Math.min(h.streak, 60), 0)
  const xp = goalsAchieved * 100 + milestonesDone * 20 + habitXp * 2

  const level = 1 + Math.floor(xp / XP_PER_LEVEL)
  const xpIntoLevel = xp % XP_PER_LEVEL
  const title = TITLES[Math.min(level - 1, TITLES.length - 1)]
  const nextTitle = level - 1 < TITLES.length - 1 ? TITLES[level] : null

  const topHabit = habits.reduce<Habit | null>((best, h) => (!best || h.streak > best.streak ? h : best), null)

  return {
    level,
    xp,
    xpIntoLevel,
    xpPerLevel: XP_PER_LEVEL,
    title,
    nextTitle,
    goalsAchieved,
    milestonesDone,
    streakCount: topHabit?.streak ?? 0,
    streakLabel: topHabit && topHabit.streak > 0 ? topHabit.name : null,
  }
}
