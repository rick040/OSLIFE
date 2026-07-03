import { useStore } from '../store'
import { TODAY, fmtDate, daysBetween } from '../domains'
import { DomainChip } from '../components/ui'
import { Target, CheckCircle2, Circle, Flag } from 'lucide-react'
import { eur0 } from '../lib/format'

function fmtValue(n: number, metric: string) {
  if (metric === 'EUR') return eur0(n)
  if (metric === 'steps') return `${n.toLocaleString('nl-NL')}`
  return `${n}`
}

export default function NorthStar() {
  const { goals, milestones, toggleMilestone } = useStore()

  const totalMs = milestones.length
  const doneMs = milestones.filter((m) => m.done).length

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Target className="h-5 w-5 text-prjct" /> North Star
        </h1>
        <p className="text-sm text-muted mt-1">
          Je leven op hoog niveau: de doelen die ertoe doen en de mijlpalen ernaartoe. {doneMs}/{totalMs} mijlpalen gehaald.
        </p>
      </div>

      <div className="space-y-4">
        {goals.map((g) => {
          const pct = Math.min(1, g.current / g.target)
          const days = daysBetween(TODAY, g.deadline)
          const ms = milestones.filter((m) => m.goalId === g.id)
          return (
            <div key={g.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-medium">{g.title}</h2>
                    <DomainChip domain={g.domain} small />
                  </div>
                  <p className="text-xs text-faint mt-0.5">
                    deadline {fmtDate(g.deadline)} · {days > 0 ? `nog ${days} dagen` : 'verlopen'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xl font-semibold">{fmtValue(g.current, g.metric)}</div>
                  <div className="text-xs text-faint">van {fmtValue(g.target, g.metric)}</div>
                </div>
              </div>

              <div className="h-2.5 w-full rounded-full bg-line overflow-hidden mt-3">
                <div className="h-full rounded-full bg-prjct transition-all duration-700" style={{ width: `${pct * 100}%` }} />
              </div>
              <div className="text-xs text-muted mt-1">{Math.round(pct * 100)}%</div>

              {ms.length > 0 && (
                <div className="mt-4 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-faint">
                    <Flag className="h-3 w-3" /> mijlpalen
                  </div>
                  {ms.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => toggleMilestone(m.id)}
                      className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-sunken transition-colors text-left"
                    >
                      {m.done ? (
                        <CheckCircle2 className="h-4 w-4 text-buurtkaart shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-faint shrink-0" />
                      )}
                      <span className={`text-sm flex-1 ${m.done ? 'text-faint line-through' : 'text-ink'}`}>
                        {m.title}
                      </span>
                      {m.due && <span className="text-[11px] text-faint shrink-0">{fmtDate(m.due)}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
