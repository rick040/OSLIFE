import { User, Flame } from 'lucide-react'
import { Ring } from '../ui'
import type { CharacterStats } from '../../character'

/**
 * Avatar + level ring + XP bar + title + streak. The ring's fill is overall
 * progress across every tracked domain (src/character.ts `overallProgress`),
 * so the same number that drives the gap visualization also lights up the
 * avatar — one character, one truth, read from two angles.
 */
export function CharacterHeader({ stats, overallProgressPct }: { stats: CharacterStats; overallProgressPct: number }) {
  const xpPct = stats.xpIntoLevel / stats.xpPerLevel

  return (
    <div className="card p-5 flex items-center gap-5 flex-wrap sm:flex-nowrap">
      <Ring
        value={overallProgressPct}
        size={92}
        stroke={6}
        color="stroke-forest-hi"
        label={<User className="h-8 w-8 text-ink" strokeWidth={1.75} />}
        sub={`LV ${stats.level}`}
      />

      <div className="flex-1 min-w-[200px] space-y-2">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h2 className="text-lg font-semibold text-ink uppercase tracking-wide">{stats.title}</h2>
          {stats.nextTitle && (
            <span className="text-xs text-faint">
              volgende: <span className="text-ink-soft">{stats.nextTitle}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="h-2 flex-1 rounded-full bg-sunken overflow-hidden" role="progressbar" aria-valuenow={Math.round(xpPct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Ervaring naar volgend niveau">
            <div
              className="h-full rounded-full bg-prjct transition-all duration-700"
              style={{ width: `${Math.round(xpPct * 100)}%` }}
            />
          </div>
          <span className="text-[11px] font-mono tabular-nums text-faint shrink-0">
            {stats.xpIntoLevel}/{stats.xpPerLevel} XP
          </span>
        </div>

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
