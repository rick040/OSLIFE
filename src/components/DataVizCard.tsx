import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { ChartCardData } from '../heyra/cards'
import { Empty } from './ui'
import { BarChart3 } from 'lucide-react'

/** The Visualisatie reply: whatever metric matched the question, as a small chart. */
export default function DataVizCard({ data }: { data: ChartCardData }) {
  return (
    <div className="card overflow-hidden animate-fade-up">
      <div className="flex items-center gap-2 px-4 py-2 bg-sunken">
        <BarChart3 className="h-4 w-4 text-muted" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">{data.title}</span>
      </div>
      <div className="p-3">
        {data.points.length ? (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              {data.kind === 'line' ? (
                <LineChart data={data.points}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-line" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip formatter={(v: number) => [`${v}${data.unit ?? ''}`, '']} />
                  <Line type="monotone" dataKey="value" stroke="#9385B0" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              ) : (
                <BarChart data={data.points}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-line" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip formatter={(v: number) => [`${v}${data.unit ?? ''}`, '']} />
                  <Bar dataKey="value" fill="#9385B0" radius={[6, 6, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        ) : (
          <Empty>Nog niet genoeg data om dit te visualiseren.</Empty>
        )}
      </div>
    </div>
  )
}
