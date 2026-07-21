import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const WEEKDAYS_NL = ['M', 'D', 'W', 'D', 'V', 'Z', 'Z']

const pad = (n: number) => String(n).padStart(2, '0')

/** Compact month grid with a dot on marked (due-date) days — tap a day to filter the list below it. */
export function MiniCalendar({
  markedDates,
  selected,
  onSelect,
}: {
  markedDates: Set<string>
  selected: string | null
  onSelect: (date: string | null) => void
}) {
  const now = new Date()
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() })

  const first = new Date(cursor.y, cursor.m, 1)
  const startWeekday = (first.getDay() + 6) % 7 // Monday-first grid
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate()
  const cells: (string | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${cursor.y}-${pad(cursor.m + 1)}-${pad(i + 1)}`),
  ]
  const monthLabel = first.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
  const todayIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

  const prevMonth = () => setCursor((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }))
  const nextMonth = () => setCursor((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }))

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="text-faint hover:text-ink p-1" aria-label="Vorige maand">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-sm font-medium capitalize">{monthLabel}</div>
        <button onClick={nextMonth} className="text-faint hover:text-ink p-1" aria-label="Volgende maand">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-faint mb-1">
        {WEEKDAYS_NL.map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) =>
          date === null ? (
            <div key={i} />
          ) : (
            <button
              key={date}
              onClick={() => onSelect(selected === date ? null : date)}
              className={`relative h-8 rounded-lg text-xs transition-colors ${
                selected === date
                  ? 'bg-forest text-white'
                  : date === todayIso
                  ? 'bg-sunken text-ink font-semibold'
                  : 'hover:bg-sunken text-ink'
              }`}
            >
              {Number(date.slice(-2))}
              {markedDates.has(date) && (
                <span className={`absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full ${selected === date ? 'bg-white' : 'bg-cross'}`} />
              )}
            </button>
          ),
        )}
      </div>
    </div>
  )
}
