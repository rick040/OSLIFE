// ── Character profile: pure projections over goals/milestones/habits ────────
// The gamified profile screen (src/views/Profile.tsx, "Personage" tab) needs
// RPG framing — attributes, a skill tree, quests, a milestone path, levels/XP —
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

// ── RuneScape-style level curve ──────────────────────────────────────────────
// Same growth SHAPE as RuneScape's skill levels — each level needs
// proportionally more XP than the last, via the same well-known formula RS
// itself uses (points += floor(level + 300·2^(level/7)), xp = floor(points/4))
// — rescaled to fit how much "XP" a real life domain can realistically earn
// from goals/milestones. The authentic table tops out past 13 million XP for
// level 99, which nothing here would ever approach; RS_SCALE compresses that
// down so leveling still *feels* like RuneScape (fast early levels, a long
// grind toward the 90s) at a scale a handful of goals and milestones can
// actually move.

export const MAX_LEVEL = 99
const RS_SCALE = 40

/** table[level] = cumulative RuneScape-xp (unscaled) required to REACH `level`. */
function buildRsXpTable(): number[] {
  const table: number[] = [0, 0] // index 0 unused; level 1 needs 0 xp
  let points = 0
  for (let level = 1; level < MAX_LEVEL; level++) {
    points += Math.floor(level + 300 * 2 ** (level / 7))
    table[level + 1] = Math.floor(points / 4)
  }
  return table
}

const RS_XP_TABLE = buildRsXpTable()

/** Cumulative OSLIFE-xp required to reach `level` (clamped to 1..MAX_LEVEL). */
export function xpForLevel(level: number): number {
  const clamped = Math.max(1, Math.min(MAX_LEVEL, Math.round(level)))
  return Math.round(RS_XP_TABLE[clamped] / RS_SCALE)
}

/** Level (1..MAX_LEVEL) reached by a given amount of OSLIFE-xp. */
export function levelForXp(xp: number): number {
  let level = 1
  for (let l = MAX_LEVEL; l >= 1; l--) {
    if (xp >= xpForLevel(l)) {
      level = l
      break
    }
  }
  return level
}

// ── Domain levels — the actual RPG "skill levels", one per life domain ──────
// Same per-item weights computeCharacterStats already used for the old flat
// XP total (100 per goal fully progressed, 20 per completed milestone) — goal
// progress gives PARTIAL credit (floor(progress*100)) so a domain isn't stuck
// at 0 while a goal is 80% there, the same way training a RuneScape skill
// gives xp continuously rather than only on "completion".

const XP_PER_GOAL_PROGRESS = 100
const XP_PER_MILESTONE = 20

export function computeDomainXp(domain: Domain, goals: Goal[], milestones: Milestone[]): number {
  const domainGoals = goals.filter((g) => g.domain === domain)
  const goalXp = domainGoals.reduce((sum, g) => sum + Math.floor(goalProgress(g) * XP_PER_GOAL_PROGRESS), 0)
  const goalIds = new Set(domainGoals.map((g) => g.id))
  const milestoneXp = milestones.filter((m) => m.done && m.goalId && goalIds.has(m.goalId)).length * XP_PER_MILESTONE
  return goalXp + milestoneXp
}

export interface DomainLevel {
  domain: Domain
  xp: number
  level: number
  /** xp earned past the current level's own threshold. */
  xpIntoLevel: number
  /** xp needed to go from this level to the next; 0 once at MAX_LEVEL. */
  xpForNextLevel: number
  atMaxLevel: boolean
}

export function computeDomainLevel(domain: Domain, goals: Goal[], milestones: Milestone[]): DomainLevel {
  const xp = computeDomainXp(domain, goals, milestones)
  const level = levelForXp(xp)
  const atMaxLevel = level >= MAX_LEVEL
  const xpIntoLevel = xp - xpForLevel(level)
  const xpForNextLevel = atMaxLevel ? 0 : xpForLevel(level + 1) - xpForLevel(level)
  return { domain, xp, level, xpIntoLevel, xpForNextLevel, atMaxLevel }
}

export function computeDomainLevels(goals: Goal[], milestones: Milestone[]): DomainLevel[] {
  return ALL_DOMAINS.map((domain) => computeDomainLevel(domain, goals, milestones))
}

/** Sum of every domain's level — RuneScape's "Total level" stat. */
export function computeTotalLevel(domainLevels: DomainLevel[]): number {
  return domainLevels.reduce((sum, d) => sum + d.level, 0)
}

// ── Quest chains — shared per-goal milestone ordering + difficulty ──────────
// One chain per goal: milestones sorted by due date. Position in the chain
// drives both "which one is next" (skill tree / milestone path / quest log
// all agree on the same node) and a RuneScape-quest-style difficulty label —
// later steps in a chain read as harder, mirroring how RuneScape quest series
// escalate and gate later entries behind earlier ones.

export type QuestDifficulty = 'Beginner' | 'Gemiddeld' | 'Ervaren' | 'Meester'

const DIFFICULTY_BY_INDEX: QuestDifficulty[] = ['Beginner', 'Gemiddeld', 'Ervaren', 'Meester']

function difficultyForIndex(index: number): QuestDifficulty {
  return DIFFICULTY_BY_INDEX[Math.min(index, DIFFICULTY_BY_INDEX.length - 1)]
}

interface ChainedMilestone extends Milestone {
  indexInGoal: number
  /** Title of the previous step in this goal's chain — the "requires" line. */
  requiresTitle: string | null
  difficulty: QuestDifficulty
}

function chainMilestonesByGoal(milestones: Milestone[]): Map<string, ChainedMilestone[]> {
  const byGoal = new Map<string, Milestone[]>()
  for (const m of milestones) {
    const key = m.goalId ?? '__no_goal__'
    const list = byGoal.get(key)
    if (list) list.push(m)
    else byGoal.set(key, [m])
  }
  const out = new Map<string, ChainedMilestone[]>()
  for (const [key, list] of byGoal) {
    const sorted = [...list].sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
    out.set(
      key,
      sorted.map((m, i) => ({
        ...m,
        indexInGoal: i,
        requiresTitle: i > 0 ? sorted[i - 1].title : null,
        difficulty: difficultyForIndex(i),
      })),
    )
  }
  return out
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
  level: DomainLevel
}

function milestoneTreeNodes(chain: ChainedMilestone[]): SkillNode[] {
  let seenUndone = false
  return chain.map((m) => {
    let status: NodeStatus
    if (m.done) status = 'mastered'
    else if (!seenUndone) {
      status = 'in_progress'
      seenUndone = true
    } else status = 'locked'
    return { id: m.id, label: m.title, status, progress: m.done ? 1 : 0, dueDate: m.due, children: [] }
  })
}

export function computeSkillTree(goals: Goal[], milestones: Milestone[]): SkillBranch[] {
  const chains = chainMilestonesByGoal(milestones)
  return ALL_DOMAINS.map((domain) => {
    const domainGoals = goals.filter((g) => g.domain === domain)
    const level = computeDomainLevel(domain, goals, milestones)
    if (!domainGoals.length) {
      return {
        domain,
        level,
        progress: 0,
        nodes: [{ id: `${domain}-empty`, label: 'Nog geen doel', status: 'locked', progress: 0, dueDate: null, children: [] }],
      }
    }
    const nodes: SkillNode[] = domainGoals.map((g) => {
      const progress = goalProgress(g)
      const status: NodeStatus = progress >= 1 ? 'mastered' : progress > 0 ? 'in_progress' : 'locked'
      const chain = chains.get(g.id) ?? []
      return { id: g.id, label: g.title, status, progress, dueDate: null, children: milestoneTreeNodes(chain) }
    })
    const progress = nodes.reduce((sum, n) => sum + n.progress, 0) / nodes.length
    return { domain, nodes, progress, level }
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
  indexInGoal: number
  requiresTitle: string | null
  difficulty: QuestDifficulty
}

export function computeMilestonePath(goals: Goal[], milestones: Milestone[]): MilestoneStep[] {
  const goalById = new Map(goals.map((g) => [g.id, g]))
  const chains = chainMilestonesByGoal(milestones)
  const steps: MilestoneStep[] = []
  for (const chain of chains.values()) {
    let seenCurrent = false
    for (const m of chain) {
      const goal = m.goalId ? goalById.get(m.goalId) : undefined
      let status: MilestoneStatus
      if (m.done) status = 'done'
      else if (!seenCurrent) {
        status = 'current'
        seenCurrent = true
      } else status = 'upcoming'
      steps.push({
        id: m.id,
        title: m.title,
        domain: goal?.domain ?? 'cross',
        goalTitle: goal?.title ?? null,
        status,
        dueDate: m.due,
        indexInGoal: m.indexInGoal,
        requiresTitle: m.requiresTitle,
        difficulty: m.difficulty,
      })
    }
  }
  return steps.sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
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
  difficulty: QuestDifficulty
  requiresTitle: string | null
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
      difficulty: s.difficulty,
      requiresTitle: s.requiresTitle,
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

// ── Character stats — Total Level/title/streak, all derived, no stored counter ─

/** Dutch tier names, lowest → highest. Indexed by how many thresholds are cleared. */
const TITLES = ['Beginner', 'Leerling', 'Beoefenaar', 'Gevorderde', 'Vakman', 'Meester', 'Grootmeester', 'Legende']

/**
 * Total-level thresholds for each title tier — max total level is
 * ALL_DOMAINS.length * MAX_LEVEL (5 * 99 = 495); these are spread so the
 * first few tiers pass quickly (matching a handful of real goals) and the
 * top tiers stay a genuine long-term reach, same shape as the per-domain
 * curve above.
 */
const TITLE_THRESHOLDS = [0, 15, 35, 65, 105, 155, 220, 300]

function titleForTotalLevel(totalLevel: number): { title: string; nextTitle: string | null } {
  let idx = 0
  for (let i = 0; i < TITLE_THRESHOLDS.length; i++) {
    if (totalLevel >= TITLE_THRESHOLDS[i]) idx = i
  }
  return { title: TITLES[idx], nextTitle: idx + 1 < TITLES.length ? TITLES[idx + 1] : null }
}

export interface CharacterStats {
  totalLevel: number
  maxTotalLevel: number
  title: string
  nextTitle: string | null
  goalsAchieved: number
  milestonesDone: number
  /** Longest-running habit streak, if any habit exists. */
  streakCount: number
  streakLabel: string | null
  /** The domain closest to its next level-up (only domains with ≥1 goal), or null with nothing active. */
  nearestLevelUp: { domain: Domain; xpNeeded: number } | null
}

export function computeCharacterStats(goals: Goal[], milestones: Milestone[], habits: Habit[]): CharacterStats {
  const goalsAchieved = goals.filter((g) => g.target > 0 && goalProgress(g) >= 1).length
  const milestonesDone = milestones.filter((m) => m.done).length

  const domainLevels = computeDomainLevels(goals, milestones)
  const totalLevel = computeTotalLevel(domainLevels)
  const { title, nextTitle } = titleForTotalLevel(totalLevel)

  const topHabit = habits.reduce<Habit | null>((best, h) => (!best || h.streak > best.streak ? h : best), null)

  const domainsWithGoals = new Set(goals.map((g) => g.domain))
  let nearestLevelUp: CharacterStats['nearestLevelUp'] = null
  for (const dl of domainLevels) {
    if (dl.atMaxLevel || !domainsWithGoals.has(dl.domain)) continue
    const xpNeeded = dl.xpForNextLevel - dl.xpIntoLevel
    if (!nearestLevelUp || xpNeeded < nearestLevelUp.xpNeeded) nearestLevelUp = { domain: dl.domain, xpNeeded }
  }

  return {
    totalLevel,
    maxTotalLevel: ALL_DOMAINS.length * MAX_LEVEL,
    title,
    nextTitle,
    goalsAchieved,
    milestonesDone,
    streakCount: topHabit?.streak ?? 0,
    streakLabel: topHabit && topHabit.streak > 0 ? topHabit.name : null,
    nearestLevelUp,
  }
}
