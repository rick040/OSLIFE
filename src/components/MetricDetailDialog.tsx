import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Cell,
} from 'recharts'
import { ArrowRight } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { CHART_TIP, AXIS_TICK_10 } from './chart'

export interface MetricPoint {
  date: string
  value: number
}

/**
 * Quick-glance detail chart for a Dashboard stat tile — tap a number, see its
 * trend, without leaving the dashboard or waiting for the full destination
 * screen to load. Generic over bar/line so the same component covers steps
 * (bar + goal line), sleep/energy/saldo (line), etc.
 */
export function MetricDetailDialog({
  open,
  onClose,
  title,
  subtitle,
  data,
  unit = '',
  color,
  goal,
  kind = 'bar',
  action,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  data: MetricPoint[]
  unit?: string
  /** hex color for the bars/line */
  color: string
  /** optional reference line (e.g. a daily goal) */
  goal?: number
  kind?: 'bar' | 'line'
  /** optional "jump to the full screen" link under the chart */
  action?: { label: string; onClick: () => void }
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {subtitle && <p className="text-xs text-faint">{subtitle}</p>}
        </DialogHeader>
        <ResponsiveContainer width="100%" height={200}>
          {kind === 'bar' ? (
            <BarChart data={data} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E9DE" />
              <XAxis dataKey="date" tick={AXIS_TICK_10} />
              <YAxis tick={AXIS_TICK_10} />
              <Tooltip contentStyle={CHART_TIP} formatter={(v: number) => [`${v.toLocaleString('nl-NL')}${unit}`, title]} />
              {goal != null && <ReferenceLine y={goal} stroke={color} strokeDasharray="4 4" />}
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {data.map((d) => (
                  <Cell key={d.date} fill={goal != null ? (d.value >= goal ? color : '#D4D7C8') : color} />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <LineChart data={data} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E9DE" />
              <XAxis dataKey="date" tick={AXIS_TICK_10} />
              <YAxis tick={AXIS_TICK_10} />
              <Tooltip contentStyle={CHART_TIP} formatter={(v: number) => [`${v.toLocaleString('nl-NL')}${unit}`, title]} />
              {goal != null && <ReferenceLine y={goal} stroke={color} strokeDasharray="4 4" />}
              <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
            </LineChart>
          )}
        </ResponsiveContainer>
        {action && (
          <button
            onClick={action.onClick}
            className="btn-ghost w-full justify-center !mt-1"
          >
            {action.label} <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </DialogContent>
    </Dialog>
  )
}
