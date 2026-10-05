import { Fragment, useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { WorkoutProgress } from '../../workout/WorkoutMode'
import { fmtMetric, latestValue } from '../../lib/bodyComposition'
import type { BodyStats } from './useBodyStats'

function fmtElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/**
 * Wall-display bar inside WorkoutMode: session clock, sets and volume so far,
 * plus today's weight and steps — one quiet row, readable from the bench.
 */
export function WorkoutStatusStrip({ progress, stats }: { progress: WorkoutProgress; stats: BodyStats }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const weight = latestValue(stats.days, 'weightKg')
  const cells = [
    { label: 'tijd', value: fmtElapsed(now - new Date(progress.startedAt).getTime()) },
    { label: 'sets', value: `${progress.setsDone}/${progress.setsTotal}` },
    { label: 'kg volume', value: Math.round(progress.volumeKg).toLocaleString('nl-NL') },
    { label: 'kg gewicht', value: weight ? fmtMetric('weightKg', weight.value) : '—' },
    { label: 'stappen', value: stats.today ? stats.today.steps.toLocaleString('nl-NL') : '—' },
  ]

  return (
    <Card className="mx-auto flex max-w-3xl items-stretch rounded-2xl border-0 bg-surface px-2 py-3 shadow-none">
      {cells.map((c, i) => (
        <Fragment key={c.label}>
          {i > 0 && <Separator orientation="vertical" className="h-auto bg-line" />}
          <div className="flex-1 min-w-0 text-center">
            <div className="text-2xl font-semibold tabular-nums text-ink leading-tight">{c.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5 truncate">{c.label}</div>
          </div>
        </Fragment>
      ))}
    </Card>
  )
}
