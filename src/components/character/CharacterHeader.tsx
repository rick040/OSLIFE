import { User, Flame, TrendingUp } from 'lucide-react'
import { Ring } from '../ui'
import { domainMeta } from '../../domains'
import type { CharacterStats } from '../../character'

/**
 * Avatar + Total Level (sum of every domain's own RuneScape-shaped level,
 * src/character.ts computeTotalLevel) + title tier + streak. The ring's fill
 * is overall goal-completion (`overallProgress`), so the same number that
 * drives the gap visualization also lights up the avatar — one character,
 * one truth, read from two angles. Total Level itself doesn't get a bar
 * (RuneScape doesn't put one on its total-level stat either — it's a sum,
 * not a threshold); the "nearest level-up" chip below is the actionable
 * equivalent, pointing at whichever domain is genuinely close to gaining one.
 */
export function CharacterHeader({ stats, overallProgressPct }: { stats: CharacterStats; overallProgressPct: number }) {
  const nearestMeta = stats.nearestLevelUp ? domainMeta(stats.nearestLevelUp.domain) : null

  return (
    <div className="card p-5 flex items-center gap-5 flex-wrap sm:flex-nowrap">
      <Ring
        value={overallProgressPct}
        size={92}
        stroke={6}
        color="stroke-forest-hi"
        label={<User className="h-8 w-8 text-ink" strokeWidth={1.75} />}
        sub="NU"
      />

      <div className="flex-1 min-w-[220px] space-y-2">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-mono text-2xl font-bold tabular-nums text-ink leading-none">{stats.totalLevel}</span>
          <span className="text-[11px] text-faint uppercase tracking-wider">/ {stats.maxTotalLevel} totaal level</span>
        </div>

        <div className="flex items-baseline gap-2 flex-wrap">
          <h2 className="text-sm font-semibold text-ink-soft uppercase tracking-wide">{stats.title}</h2>
          {stats.nextTitle && (
            <span className="text-xs text-faint">
              volgende: <span className="text-ink-soft">{stats.nextTitle}</span>
            </span>
          )}
        </div>

        {nearestMeta && stats.nearestLevelUp && (
          <div className="inline-flex items-center gap-1.5 text-xs rounded-full bg-sunken px-2.5 py-1">
            <TrendingUp className="h-3 w-3 text-forest-hi shrink-0" aria-hidden="true" />
            <span className="text-ink-soft">
              Bijna level-up: <span className={nearestMeta.color}>{nearestMeta.label}</span>
              <span className="font-mono tabular-nums text-faint"> · nog {stats.nearestLevelUp.xpNeeded} xp</span>
            </span>
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap text-xs text-faint">
          <span>{stats.goalsAchieved} doelen behaald</span>
          <span className="text-line-strong">·</span>
          <span>{stats.milestonesDone} mijlpalen voltooid</span>
          {stats.streakCount > 0 && (
            <>
              <span className="text-line-strong">·</span>
              <span className="inline-flex items-center gap-1 text-personal-deep font-medium">
                <Flame className="h-3.5 w-3.5" aria-hidden="true" />
                {stats.streakCount}d {stats.streakLabel}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
