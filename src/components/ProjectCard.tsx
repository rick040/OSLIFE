import type { Project } from '../types'
import { DomainChip } from './ui'
import { fmtDate } from '../domains'
import { FolderKanban, Calendar, Euro, ArrowRight } from 'lucide-react'

const STATUS_LABEL: Record<Project['status'], string> = {
  lead: 'Lead',
  active: 'Actief',
  review: 'Review',
  blocked: 'Geblokkeerd',
  done: 'Klaar',
}

const STATUS_STYLE: Record<Project['status'], string> = {
  lead: 'bg-personal/15 text-personal-deep',
  active: 'bg-parkingyou/15 text-parkingyou-deep',
  review: 'bg-prjct/15 text-prjct-deep',
  blocked: 'bg-cross/15 text-cross-deep',
  done: 'bg-buurtkaart/15 text-buurtkaart-deep',
}

const eur0 = (n: number) => `€${n.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}`

/** The Projectkaart reply: a live snapshot of one project, pulled from the CRM/projects store. */
export default function ProjectCard({ project, onNav }: { project: Project; onNav?: (v: string) => void }) {
  const pct = Math.round(project.progress * 100)
  return (
    <div className="card overflow-hidden animate-fade-up">
      <div className="flex items-center gap-2 px-4 py-2 bg-sunken">
        <FolderKanban className="h-4 w-4 text-muted" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">Projectkaart</span>
        <span className={`chip ml-auto ${STATUS_STYLE[project.status]}`}>{STATUS_LABEL[project.status]}</span>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <h3 className="text-base font-semibold leading-snug">{project.name}</h3>
          <p className="text-xs text-faint mt-0.5">{project.client}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DomainChip domain={project.domain} small />
          {project.deadline && (
            <span className="chip bg-line text-muted">
              <Calendar className="h-3.5 w-3.5" /> {fmtDate(project.deadline)}
            </span>
          )}
          <span className="chip bg-line text-muted">
            <Euro className="h-3.5 w-3.5" /> {eur0(project.value)}
          </span>
        </div>

        <div>
          <div className="flex items-center justify-between text-[11px] text-faint mb-1">
            <span>Voortgang</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-line overflow-hidden">
            <div className="h-full rounded-full bg-prjct transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {onNav && (
          <button onClick={() => onNav('projects')} className="btn-ghost">
            Open in Projecten <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
