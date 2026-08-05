import { DOMAIN_META, DOMAIN_HEX } from '../../domains'
import { fmtGoalValue } from '../../lib/format'
import type { GapDelta } from '../../character'

/** Same abstract bust silhouette for both states — one solid, one wireframe. */
const SILHOUETTE_PATH =
  'M50 8c9 0 16 7 16 16 0 7-4 13-10 15 14 4 24 15 26 29 1 6-3 12-9 12H27c-6 0-10-6-9-12 2-14 12-25 26-29-6-2-10-8-10-15 0-9 7-16 16-16z'

/**
 * "Nu" is a solid fill rising from the bottom by `fillPct` — literally how
 * much of the current-state figure is "lit up". "Becoming" is deliberately
 * never filled: it's a pure dashed outline, the destination sketch, not
 * something already achieved — that contrast is the whole point of the
 * visual, so it can't share a fill path with "Nu".
 */
function Silhouette({ fillPct }: { fillPct: number }) {
  const clipId = `silhouette-fill-now`
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden="true">
      <clipPath id={clipId}>
        <path d={SILHOUETTE_PATH} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <rect x={0} y={`${100 - fillPct * 100}`} width={100} height={100} className="fill-forest-hi" opacity={0.9} />
      </g>
      <path d={SILHOUETTE_PATH} fill="none" stroke="currentColor" strokeWidth={1} className="text-forest-hi" />
    </svg>
  )
}

function SilhouetteWireframe() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden="true">
      <path d={SILHOUETTE_PATH} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-personal" strokeDasharray="3 3" />
    </svg>
  )
}

function GapStone({ delta }: { delta: GapDelta }) {
  const meta = DOMAIN_META[delta.domain]
  const hex = DOMAIN_HEX[delta.domain]
  const closedPct = Math.round((1 - delta.gapPct) * 100)
  const remaining = Math.max(0, delta.target - delta.current)
  return (
    <div
      className="flex flex-col items-center gap-1 w-20 shrink-0"
      role="img"
      aria-label={`${meta.label}: ${delta.goalTitle}, ${closedPct}% gedicht, nog ${fmtGoalValue(remaining, delta.metric)} te gaan`}
      title={`${delta.goalTitle} — nog ${fmtGoalValue(remaining, delta.metric)}`}
    >
      <div className="relative h-10 w-10">
        <svg viewBox="0 0 36 36" className="h-10 w-10 -rotate-90">
          <circle cx={18} cy={18} r={15} fill="none" stroke="hsl(var(--line))" strokeWidth={4} />
          <circle
            cx={18}
            cy={18}
            r={15}
            fill="none"
            stroke={hex}
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 15}
            strokeDashoffset={2 * Math.PI * 15 * (1 - closedPct / 100)}
            className="transition-all duration-700"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono tabular-nums text-ink-soft">
          {closedPct}%
        </span>
      </div>
      <span className={`text-[10px] font-medium truncate max-w-full ${meta.color}`}>{meta.label}</span>
    </div>
  )
}

/**
 * The signature "current vs becoming" visual: two silhouettes — "Nu" filled
 * solid to `overallProgressPct`, "Worden" a full amber wireframe (the target
 * state, always fully outlined since it's the destination, not a fill level)
 * — bridged by a row of gap-delta stones, the biggest gap per domain. Every
 * number here traces to computeGapDeltas/overallProgress in src/character.ts.
 */
export function GapVisualization({ overallProgressPct, deltas }: { overallProgressPct: number; deltas: GapDelta[] }) {
  return (
    <div className="card p-5">
      <div className="flex items-end justify-center gap-4 sm:gap-8">
        <div className="flex flex-col items-center gap-1.5 w-24 sm:w-28">
          <div className="h-28 w-24 sm:h-32 sm:w-28">
            <Silhouette fillPct={overallProgressPct} />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-forest-hi">Nu</span>
        </div>

        <div className="flex-1 min-w-0">
          {deltas.length > 0 ? (
            <>
              <p className="text-[11px] text-faint text-center mb-2 uppercase tracking-wider">Grootste kloven</p>
              <div className="flex items-start justify-center gap-3 overflow-x-auto pb-1">
                {deltas.map((d) => (
                  <GapStone key={d.goalId} delta={d} />
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-faint text-center italic px-2">
              Nog geen doelen met een target ingesteld — zet er een in North Star om je kloof zichtbaar te maken.
            </p>
          )}
        </div>

        <div className="flex flex-col items-center gap-1.5 w-24 sm:w-28">
          <div className="h-28 w-24 sm:h-32 sm:w-28">
            <SilhouetteWireframe />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-personal">Worden</span>
        </div>
      </div>
    </div>
  )
}
