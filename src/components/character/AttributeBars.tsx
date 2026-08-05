import { domainMeta, DOMAIN_HEX } from '../../domains'
import { fmtGoalValue } from '../../lib/format'
import { goalProgress, type DomainAttribute, type DomainLevel } from '../../character'
import { DomainSkillIcon } from './DomainSkillIcon'
import type { Goal } from '../../types'

/**
 * One stat bar per goal: track scaled to 15% past whichever is bigger
 * (target or an overshoot current), fill to current, a marker tick at the
 * target so an overachieved goal still shows where the bar was aiming.
 */
function GoalBar({ goal }: { goal: Goal }) {
  const hex = DOMAIN_HEX[goal.domain]
  const scale = Math.max(goal.target, goal.current, 1) * 1.15
  const fillPct = Math.max(0, Math.min(100, (goal.current / scale) * 100))
  const targetPct = Math.max(0, Math.min(100, (goal.target / scale) * 100))
  const progress = goalProgress(goal)
  const overshoot = goal.current > goal.target && goal.target > 0

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-ink-soft truncate">{goal.title}</span>
        <span className="font-mono tabular-nums text-faint shrink-0">
          {fmtGoalValue(goal.current, goal.metric)} / {fmtGoalValue(goal.target, goal.metric)}
          {overshoot && <span className="text-forest-hi ml-1">+</span>}
        </span>
      </div>
      <div className="relative h-2.5 rounded-full bg-sunken overflow-hidden" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${goal.title}: ${Math.round(progress * 100)}% van doel`}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${fillPct}%`, backgroundColor: hex }} />
        <div className="absolute top-0 bottom-0 w-0.5 bg-ink/70" style={{ left: `${targetPct}%` }} aria-hidden="true" />
      </div>
    </div>
  )
}

function DomainSection({ attr, level }: { attr: DomainAttribute; level: DomainLevel }) {
  const meta = domainMeta(attr.domain)
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2.5">
        <DomainSkillIcon level={level} size={30} />
        <div className="min-w-0 flex-1">
          <p className={`text-[11px] font-semibold uppercase truncate ${meta.color}`}>{meta.label}</p>
          {attr.goals.length > 0 && (
            <p className="text-[10px] text-faint">{Math.round(attr.avgProgress * 100)}% van targets gehaald</p>
          )}
        </div>
      </div>
      {attr.goals.length === 0 ? (
        <div className="h-2.5 rounded-full border border-dashed border-line flex items-center px-2">
          <p className="text-[10px] text-faint italic truncate">Nog geen doel ingesteld voor {meta.label}</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {attr.goals.map((g) => (
            <GoalBar key={g.id} goal={g} />
          ))}
        </div>
      )}
    </div>
  )
}

export function AttributeBars({ attributes, levels }: { attributes: DomainAttribute[]; levels: DomainLevel[] }) {
  return (
    <div className="card p-4 space-y-5">
      {attributes.map((attr, i) => (
        <DomainSection key={attr.domain} attr={attr} level={levels[i]} />
      ))}
    </div>
  )
}
