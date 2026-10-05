import { BODY_METRICS, fmtMetric, latestValue, type BodyMetricKey } from '../../lib/bodyComposition'
import type { BodyStats } from './useBodyStats'

const KEYS: BodyMetricKey[] = ['weightKg', 'musclePct', 'bodyFatPct']

/** Compact health row for the wall tablet — the wall display has the full version (GymWallHome). */
export function BodyStatsRow({ stats }: { stats: BodyStats }) {
  const cells = KEYS.flatMap((k) => {
    const latest = latestValue(stats.days, k)
    return latest ? [{ label: BODY_METRICS[k].label, value: fmtMetric(k, latest.value), unit: BODY_METRICS[k].unit }] : []
  })
  if (stats.today) cells.push({ label: 'Stappen', value: stats.today.steps.toLocaleString('nl-NL'), unit: '' })
  if (cells.length === 0) return null

  return (
    <div className="flex flex-wrap justify-center gap-3 md:gap-5">
      {cells.map((c) => (
        <div key={c.label} className="card px-4 py-2.5 md:px-6 md:py-3 min-w-[7rem] md:min-w-[9rem]">
          <div className="text-xl md:text-2xl font-semibold tabular-nums text-ink">
            {c.value}
            {c.unit && <span className="text-sm md:text-lg font-medium text-faint"> {c.unit}</span>}
          </div>
          <div className="text-xs md:text-sm text-faint uppercase tracking-wide mt-0.5">{c.label}</div>
        </div>
      ))}
    </div>
  )
}
