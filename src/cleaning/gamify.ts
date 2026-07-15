import { today } from '../domains'
import { tasksForDate } from './schedule'

/** `{onDate}__{taskKey}` → done. Same flat shape the store persists and the
 *  Supabase `cleaning_log` table round-trips. */
export type CleaningLog = Record<string, boolean>

export function logKey(onDate: string, taskKey: string): string {
  return `${onDate}__${taskKey}`
}

const POINTS_PER_TASK = 10
const ZONE_CLEAR_BONUS = 40

export function isTaskDone(log: CleaningLog, onDate: string, taskKey: string): boolean {
  return !!log[logKey(onDate, taskKey)]
}

export function tasksDoneOn(log: CleaningLog, iso: string): number {
  return tasksForDate(iso).filter((t) => isTaskDone(log, iso, t.key)).length
}

/** True once every baseline + zone task for that date is checked off. */
export function isDayComplete(log: CleaningLog, iso: string): boolean {
  const tasks = tasksForDate(iso)
  return tasks.length > 0 && tasks.every((t) => isTaskDone(log, iso, t.key))
}

/** Days (ISO) that have at least one completed entry, derived straight from the log. */
function loggedDays(log: CleaningLog): Set<string> {
  const days = new Set<string>()
  for (const k of Object.keys(log)) {
    if (log[k]) days.add(k.slice(0, k.indexOf('__')))
  }
  return days
}

/** 10 pts/task done, +40 bonus for every fully-cleared day. */
export function totalPoints(log: CleaningLog): number {
  let taskCount = 0
  for (const k of Object.keys(log)) if (log[k]) taskCount++
  let clearedDays = 0
  for (const iso of loggedDays(log)) if (isDayComplete(log, iso)) clearedDays++
  return taskCount * POINTS_PER_TASK + clearedDays * ZONE_CLEAR_BONUS
}

/** Consecutive fully-cleared days ending today (or yesterday if today isn't
 *  finished yet, so a still-in-progress today doesn't zero an ongoing run). */
export function currentStreak(log: CleaningLog, todayStr: string = today()): number {
  const d = new Date(todayStr + 'T00:00:00')
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  if (!isDayComplete(log, iso(d))) d.setDate(d.getDate() - 1)
  let streak = 0
  while (isDayComplete(log, iso(d))) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

export interface CleaningLevel {
  name: string
  threshold: number
}

export const LEVELS: CleaningLevel[] = [
  { name: 'Front Desk Trainee', threshold: 0 },
  { name: 'Housekeeping Pro', threshold: 200 },
  { name: 'Suite Specialist', threshold: 500 },
  { name: 'Head of Housekeeping', threshold: 1000 },
  { name: 'General Manager', threshold: 2000 },
  { name: 'Five-Star Legend', threshold: 4000 },
]

export interface LevelInfo {
  level: CleaningLevel
  index: number
  next: CleaningLevel | null
  /** 0..1 progress toward `next` (1 = maxed out at the top level). */
  progress: number
}

export function levelFor(points: number): LevelInfo {
  let index = 0
  for (let i = 0; i < LEVELS.length; i++) if (points >= LEVELS[i].threshold) index = i
  const level = LEVELS[index]
  const next = LEVELS[index + 1] ?? null
  const progress = next ? (points - level.threshold) / (next.threshold - level.threshold) : 1
  return { level, index, next, progress: Math.min(1, Math.max(0, progress)) }
}
