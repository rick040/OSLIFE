import { useEffect, useId, useMemo, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, Cell, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { BODY_METRICS, fmtMetric, type BodyMetricKey } from '../../lib/bodyComposition'
import type { HealthDay } from '../../types'

/** Line colours on the dark surface — blue/orange are the validated dataviz pair. */
export const SERIES_HEX = { neutral: '#d4d4d4', blue: '#3987e5', orange: '#d95926' }
/** Same goal-met green / missed grey as the steps chart on Gezondheid (Vitals.tsx). */
const STEPS_MET = '#34D399'
const STEPS_MISSED = '#3a3a3a'

/**
 * Current root font size in px. On the wall display a rem scales with the
 * screen (html.wall-display) while recharts strokes are in px — and the class
 * lands after this component's first effect runs, so watch for it.
 */
export function useRemPx(): number {
  const read = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  const [px, setPx] = useState(read)
  useEffect(() => {
    const update = () => setPx(read())
    update()
    const mo = new MutationObserver(update)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] })
    window.addEventListener('resize', update)
    return () => {
      mo.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])
  return px
}

export const fmtDay = (date: string) =>
  new Date(date + 'T12:00:00Z').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', timeZone: 'Europe/Amsterdam' })

/**
 * One body metric over time as a soft area — shape over scaffolding: no axes,
 * the card around it carries the number, the change and the date range, and
 * a touch shows the exact reading. Own y-scale per metric, so weight and the
 * percentages never share an axis.
 */
export function MetricTrendChart({ metric, points, color }: { metric: BodyMetricKey; points: { date: string; value: number }[]; color: string }) {
  const rem = useRemPx()
  const gradientId = `fill-${useId().replace(/:/g, '')}`
  const meta = BODY_METRICS[metric]
  const config = { value: { label: meta.label, color } } satisfies ChartConfig

  const { rows, domain } = useMemo(() => {
    // Real time on x, so irregular weigh-ins aren't drawn evenly spaced.
    const rows = points.map((p) => ({ ...p, t: new Date(p.date + 'T12:00:00Z').getTime() }))
    const values = points.map((p) => p.value)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const pad = Math.max((max - min) * 0.25, 0.3)
    return { rows, domain: [min - pad, max + pad] as [number, number] }
  }, [points])

  const last = rows.length - 1

  return (
    <ChartContainer config={config} className="aspect-auto h-full w-full">
      <AreaChart data={rows} margin={{ top: rem * 0.75, right: rem * 0.75, left: rem * 0.75, bottom: rem * 0.25 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <XAxis hide dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} />
        <YAxis hide domain={domain} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="line"
              className="text-sm"
              labelFormatter={(_, payload) => fmtDay((payload?.[0]?.payload as { date: string }).date)}
              formatter={(v) => (
                <span className="font-medium tabular-nums text-foreground">
                  {fmtMetric(metric, Number(v))} {meta.unit}
                </span>
              )}
            />
          }
        />
        <Area
          dataKey="value"
          type="monotone"
          stroke="var(--color-value)"
          strokeWidth={Math.max(2, rem * 0.125)}
          fill={`url(#${gradientId})`}
          isAnimationActive={false}
          activeDot={{ r: Math.max(4, rem * 0.22), strokeWidth: 0, fill: 'var(--color-value)' }}
          // Only the latest reading gets a dot — "you are here".
          dot={(props: { cx?: number; cy?: number; index?: number; key?: string }) =>
            props.index === last && props.cx != null && props.cy != null ? (
              <circle key={props.key} cx={props.cx} cy={props.cy} r={Math.max(4, rem * 0.22)} fill="var(--color-value)" />
            ) : (
              <g key={props.key} />
            )
          }
        />
      </AreaChart>
    </ChartContainer>
  )
}

/** Daily steps vs. goal, same encoding as Gezondheid: green = goal met, dashed line = goal. */
export function StepsChart({ days }: { days: HealthDay[] }) {
  const rem = useRemPx()
  const goal = days[days.length - 1]?.stepGoal ?? 8000
  const top = Math.max(goal, ...days.map((d) => d.steps)) * 1.08
  const config = { steps: { label: 'Stappen', color: STEPS_MET } } satisfies ChartConfig

  return (
    <ChartContainer config={config} className="aspect-auto h-full w-full">
      <BarChart data={days} margin={{ top: rem * 0.75, right: rem * 0.75, left: rem * 0.75, bottom: rem * 0.25 }} barCategoryGap="22%">
        <YAxis hide domain={[0, top]} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              hideIndicator
              className="text-sm"
              labelFormatter={(_, payload) => fmtDay((payload?.[0]?.payload as HealthDay).date)}
              formatter={(v) => <span className="font-medium tabular-nums text-foreground">{Number(v).toLocaleString('nl-NL')} stappen</span>}
            />
          }
        />
        <ReferenceLine y={goal} stroke={STEPS_MET} strokeOpacity={0.6} strokeDasharray="6 6" />
        <Bar dataKey="steps" radius={[Math.round(rem * 0.25), Math.round(rem * 0.25), 0, 0]} isAnimationActive={false}>
          {days.map((d) => (
            <Cell key={d.date} fill={d.steps >= d.stepGoal ? 'var(--color-steps)' : STEPS_MISSED} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
