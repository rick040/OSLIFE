import { CheckCircle2, PartyPopper } from 'lucide-react'

/**
 * Dopamine bar — the reward half of Today's focus mode. Shows how many of today's
 * project tasks are already done, fills as you check them off, and celebrates at
 * 100%. `done`/`total` are computed by the caller (Today) from the same task set
 * the "Vandaag afmaken" list renders, so bar and list never disagree.
 */
export default function DopamineBar({ done, total, compact }: { done: number; total: number; compact?: boolean }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const complete = total > 0 && done >= total

  if (compact) {
    return (
      <div className="h-2 w-full rounded-full bg-line overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${complete ? 'bg-buurtkaart' : 'bg-forest'}`}
          style={{ width: `${Math.max(4, pct)}%` }}
        />
      </div>
    )
  }

  return (
    <div className={`card p-4 animate-fade-up ${complete ? 'border-buurtkaart/50 bg-buurtkaart/5' : ''}`}>
      <div className="flex items-center gap-2.5">
        <div className={`rounded-xl p-2 ${complete ? 'bg-buurtkaart/15 animate-pulse-ring' : 'bg-forest/15'}`}>
          {complete
            ? <PartyPopper className="h-4 w-4 text-buurtkaart-deep" />
            : <CheckCircle2 className="h-4 w-4 text-forest" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Dopamine</span>
            <span className="text-sm font-semibold tabular-nums">{done}/{total}</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-line overflow-hidden mt-1.5">
            <div
              className={`h-full rounded-full transition-all duration-700 ${complete ? 'bg-buurtkaart' : 'bg-forest'}`}
              style={{ width: `${Math.max(4, pct)}%` }}
            />
          </div>
        </div>
      </div>
      <p className={`text-[11px] mt-2 ${complete ? 'text-buurtkaart-deep font-medium' : 'text-faint'}`}>
        {complete ? 'Alles van vandaag afgerond — top gedaan! 🎉' : `Nog ${total - done} te gaan · klein afvinken telt`}
      </p>
    </div>
  )
}
