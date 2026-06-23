import { useStore } from '../store'
import { TODAY, fmtDate, daysBetween } from '../domains'
import { DomainChip } from '../components/ui'
import type { ProjectStatus } from '../types'
import { FolderKanban, Calendar, Euro } from 'lucide-react'

const COLUMNS: { id: ProjectStatus; label: string; accent: string }[] = [
  { id: 'lead', label: 'Lead', accent: 'text-personal' },
  { id: 'active', label: 'Actief', accent: 'text-parkingyou' },
  { id: 'review', label: 'Review', accent: 'text-prjct' },
  { id: 'blocked', label: 'Geblokkeerd', accent: 'text-cross' },
  { id: 'done', label: 'Klaar', accent: 'text-buurtkaart' },
]

const eur0 = (n: number) => `€${n.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}`

export default function Projects() {
  const { projects, setProjectStatus } = useStore()

  const pipeline = projects.filter((p) => p.status !== 'done').reduce((a, p) => a + p.value, 0)
  const won = projects.filter((p) => p.status === 'done').reduce((a, p) => a + p.value, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <FolderKanban className="h-5 w-5 text-parkingyou" /> Projects
          </h1>
          <p className="text-sm text-muted mt-1">Mirror van je Notion-projectendatabase. Sleep door de fases.</p>
        </div>
        <div className="flex gap-3">
          <div className="card px-4 py-2">
            <div className="text-[11px] text-muted">Pipeline</div>
            <div className="text-lg font-semibold">{eur0(pipeline)}</div>
          </div>
          <div className="card px-4 py-2">
            <div className="text-[11px] text-muted">Gewonnen</div>
            <div className="text-lg font-semibold text-buurtkaart">{eur0(won)}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {COLUMNS.map((col) => {
          const items = projects.filter((p) => p.status === col.id)
          return (
            <div key={col.id} className="min-w-0">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className={`text-xs font-semibold uppercase tracking-wider ${col.accent}`}>{col.label}</span>
                <span className="text-xs text-faint">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((p) => {
                  const dd = p.deadline ? daysBetween(TODAY, p.deadline) : null
                  const overdue = dd !== null && dd < 0
                  return (
                    <div key={p.id} className="card p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium text-ink leading-tight">{p.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <DomainChip domain={p.domain} small />
                        <span className="text-[11px] text-faint truncate">{p.client}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-line overflow-hidden">
                        <div className="h-full rounded-full bg-prjct" style={{ width: `${p.progress * 100}%` }} />
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        {p.value > 0 ? (
                          <span className="flex items-center gap-0.5 text-muted">
                            <Euro className="h-3 w-3" /> {p.value.toLocaleString('nl-NL')}
                          </span>
                        ) : (
                          <span className="text-faint">intern</span>
                        )}
                        <span className={`flex items-center gap-0.5 ${overdue ? 'text-cross' : 'text-faint'}`}>
                          <Calendar className="h-3 w-3" />
                          {p.deadline ? (overdue ? `${-dd!}d te laat` : fmtDate(p.deadline)) : 'geen datum'}
                        </span>
                      </div>
                      <select
                        value={p.status}
                        onChange={(e) => setProjectStatus(p.id, e.target.value as ProjectStatus)}
                        className="w-full text-xs bg-sunken border border-line rounded-lg px-2 py-1 text-ink-soft focus:outline-none focus:border-prjct"
                      >
                        {COLUMNS.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )
                })}
                {items.length === 0 && (
                  <div className="text-[11px] text-faint italic text-center py-4 border border-dashed border-line rounded-xl">
                    leeg
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
