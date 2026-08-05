import { useState } from 'react'
import type { ReactNode } from 'react'
import { LayoutGrid, List, Columns3 } from 'lucide-react'
import { Empty } from './ui'
import ProjectDetail from '../views/ProjectDetail'
import ClientDetail from '../views/ClientDetail'
import ProjectForm from '../views/ProjectForm'
import ClientForm from '../views/ClientForm'
import { ProjectCard, ProjectRow } from './crm'
import type { Project, Client } from '../types'

export const STATUS_FILTERS = [
  { value: 'Alle', label: 'Alle' },
  { value: 'In uitvoering', label: 'Actief' },
  { value: 'Gepland', label: 'Gepland' },
  { value: 'Gepauzeerd', label: 'Pauze' },
  { value: 'Opgeleverd', label: 'Opgeleverd' },
]

export type ProjectViewMode = 'grid' | 'lijst'

/** Page-level layout: the normal browse view, or the tablet-style "Bureau"
 *  desk workspace (board rail + focused project/client + side panel) — see
 *  src/tablet/desk. Desktop-only; the toggle is hidden below the lg breakpoint. */
export type PageLayoutMode = 'overzicht' | 'bureau'

/** Overzicht/Bureau layout toggle, shared by CRM and Projects. Hidden on
 *  narrow screens — the desk layout's multi-column grid needs desktop width. */
export function LayoutModeToggle({
  mode, onChange,
}: { mode: PageLayoutMode; onChange: (mode: PageLayoutMode) => void }) {
  return (
    <div className="hidden lg:flex rounded-xl bg-sunken p-1 shrink-0">
      <button
        onClick={() => onChange('overzicht')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          mode === 'overzicht' ? 'bg-surface shadow-sm text-ink' : 'text-faint'
        }`}
      >
        <LayoutGrid className="h-3.5 w-3.5" /> Overzicht
      </button>
      <button
        onClick={() => onChange('bureau')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          mode === 'bureau' ? 'bg-surface shadow-sm text-ink' : 'text-faint'
        }`}
      >
        <Columns3 className="h-3.5 w-3.5" /> Bureau
      </button>
    </div>
  )
}

/** Picks the project a desk-style layout should focus by default: an explicit
 *  id, else the project with a running timer, else the soonest deadline, else
 *  the first live project. Shared by the tablet desk kiosk and the desktop
 *  "Bureau" layout so both land on the same project. */
export function pickFocusedProject(
  projects: Project[],
  focusedId: string | null,
  runningProjectId?: string | null,
): Project | null {
  if (focusedId) {
    const found = projects.find((p) => p.id === focusedId)
    if (found) return found
  }
  if (runningProjectId) {
    const running = projects.find((p) => p.id === runningProjectId)
    if (running) return running
  }
  const live = projects.filter((p) => !p.archived && p.status !== 'done')
  const withDeadline = [...live].filter((p) => p.deadline).sort((a, b) => a.deadline!.localeCompare(b.deadline!))
  return withDeadline[0] ?? live[0] ?? null
}

/** Status filter chips + grid/lijst view toggle row, shared by CRM and Projects. */
export function FilterViewBar({
  filter,
  onFilterChange,
  view,
  onViewChange,
  className,
}: {
  filter: string
  onFilterChange: (value: string) => void
  view: ProjectViewMode
  onViewChange: (view: ProjectViewMode) => void
  className?: string
}) {
  return (
    <div className={`flex items-center justify-between gap-3 flex-wrap${className ? ` ${className}` : ''}`}>
      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => onFilterChange(f.value)}
            className={`chip ${filter === f.value ? 'bg-forest text-white' : 'bg-surface border border-line text-muted hover:text-ink'}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex rounded-xl bg-sunken p-0.5 shrink-0">
        <button onClick={() => onViewChange('grid')} className={`px-2.5 py-1 rounded-lg ${view === 'grid' ? 'bg-surface shadow-sm text-ink' : 'text-faint'}`}>
          <LayoutGrid className="h-4 w-4" />
        </button>
        <button onClick={() => onViewChange('lijst')} className={`px-2.5 py-1 rounded-lg ${view === 'lijst' ? 'bg-surface shadow-sm text-ink' : 'text-faint'}`}>
          <List className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

/** Project grid/list rendering over ProjectCard/ProjectRow, with an empty state. */
export function ProjectGridList({
  projects,
  view,
  gridClassName = 'grid grid-cols-2 sm:grid-cols-3 gap-3',
  emptyMessage,
  onOpenProject,
  onClientClick,
}: {
  projects: Project[]
  view: ProjectViewMode
  gridClassName?: string
  emptyMessage: ReactNode
  onOpenProject: (p: Project) => void
  onClientClick: (clientId: string) => void
}) {
  if (projects.length === 0) {
    return <Empty>{emptyMessage}</Empty>
  }
  return view === 'grid' ? (
    <div className={gridClassName}>
      {projects.map((p) => <ProjectCard key={p.id} p={p} onClick={() => onOpenProject(p)} onClientClick={onClientClick} />)}
    </div>
  ) : (
    <div className="space-y-2.5">
      {projects.map((p) => <ProjectRow key={p.id} p={p} onClick={() => onOpenProject(p)} onClientClick={onClientClick} />)}
    </div>
  )
}

/**
 * Shared open/close/selected state for the project & client detail/create
 * modals, plus the rendered modal block (`modals`) and the openClientById helper.
 */
export function useProjectBrowserModals(clients: Client[]) {
  const [openProject, setOpenProject] = useState<Project | null>(null)
  const [openClient, setOpenClient] = useState<Client | null>(null)
  const [creatingProject, setCreatingProject] = useState(false)
  const [creatingClient, setCreatingClient] = useState(false)

  function openClientById(clientId: string) {
    const c = clients.find((x) => x.id === clientId)
    if (c) setOpenClient(c)
  }

  const modals = (
    <>
      {openProject && <ProjectDetail project={openProject} onClose={() => setOpenProject(null)} />}
      {openClient && <ClientDetail client={openClient} onClose={() => setOpenClient(null)} />}
      {creatingProject && <ProjectForm project={null} onClose={() => setCreatingProject(false)} />}
      {creatingClient && <ClientForm client={null} onClose={() => setCreatingClient(false)} />}
    </>
  )

  return {
    setOpenProject,
    setOpenClient,
    setCreatingProject,
    setCreatingClient,
    openClientById,
    modals,
  }
}
