import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts'
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
                  {data.compareLabel && <Legend wrapperStyle={{ fontSize: 11 }} />}
                  <Line type="monotone" dataKey="value" name="nu" stroke="#A78BFA" strokeWidth={2} dot={{ r: 3 }} />
                  {data.compareLabel && (
                    <Line type="monotone" dataKey="compareValue" name={data.compareLabel} stroke="#C7C2D6" strokeWidth={2} strokeDasharray="4 3" dot={{ r: 2 }} />
                  )}
                </LineChart>
              ) : (
                <BarChart data={data.points}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-line" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip formatter={(v: number) => [`${v}${data.unit ?? ''}`, '']} />
                  {data.compareLabel && <Legend wrapperStyle={{ fontSize: 11 }} />}
                  <Bar dataKey="value" name="nu" fill="#A78BFA" radius={[6, 6, 0, 0]} />
                  {data.compareLabel && <Bar dataKey="compareValue" name={data.compareLabel} fill="#C7C2D6" radius={[6, 6, 0, 0]} />}
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
