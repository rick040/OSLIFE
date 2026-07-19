import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { TODAY, daysBetween } from '../domains'
import type { Project } from '../types'
import {
  eur, CRM_STATUS, Kpi,
} from '../components/crm'
import {
  FilterViewBar, ProjectGridList, useProjectBrowserModals,
} from '../components/ProjectBrowser'
import type { ProjectViewMode } from '../components/ProjectBrowser'
import {
  FolderKanban, Wallet, AlertTriangle, CheckCircle2, Search,
  Plus, UserPlus, ArrowUpDown,
} from 'lucide-react'

type SortKey = 'deadline' | 'value' | 'name' | 'progress'
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'deadline', label: 'Deadline' },
  { value: 'value', label: 'Waarde (hoog-laag)' },
  { value: 'name', label: 'Naam (A-Z)' },
  { value: 'progress', label: 'Voortgang' },
]

function sortProjects(list: Project[], key: SortKey): Project[] {
  const sorted = [...list]
  switch (key) {
    case 'value':
      return sorted.sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    case 'name':
      return sorted.sort((a, b) => a.name.localeCompare(b.name))
    case 'progress':
      return sorted.sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0))
    case 'deadline':
    default:
      return sorted.sort((a, b) => (a.deadline ?? '9999-99-99').localeCompare(b.deadline ?? '9999-99-99'))
  }
}

export default function Projects() {
  const { projects, clients } = useStore()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('Alle')
  const [clientFilter, setClientFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('deadline')
  const [view, setView] = useState<ProjectViewMode>('grid')
  const {
    setOpenProject, setCreatingProject, setCreatingClient,
    openClientById, modals,
  } = useProjectBrowserModals(clients)

  const activeProjects = projects.filter((p) => p.status === 'active' || p.status === 'review')
  const pipeline = projects
    .filter((p) => p.status !== 'done')
    .reduce((a, p) => a + (p.value ?? 0), 0)
  const delivered = projects.filter((p) => p.status === 'done').reduce((a, p) => a + (p.value ?? 0), 0)
  const overdue = projects.filter((p) => p.status !== 'done' && p.deadline && daysBetween(TODAY, p.deadline) < 0)

  const clientsWithProjects = useMemo(
    () => clients.filter((c) => projects.some((p) => p.clientId === c.id)),
    [clients, projects],
  )

  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    let list = projects
    if (statusFilter !== 'Alle') list = list.filter((p) => CRM_STATUS[p.status] === statusFilter)
    if (clientFilter) list = list.filter((p) => p.clientId === clientFilter)
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.client.toLowerCase().includes(q) ||
          (p.type ?? []).some((t) => t.toLowerCase().includes(q)) ||
          (p.notes ?? '').toLowerCase().includes(q),
      )
    }
    return sortProjects(list, sortKey)
  }, [projects, statusFilter, clientFilter, q, sortKey])

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <FolderKanban className="h-5 w-5 text-prjct" /> Projecten
          </h1>
          <p className="text-sm text-muted mt-1">Al je projecten op één plek — gekoppeld aan je klanten, van lead tot oplevering.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setCreatingClient(true)} className="chip bg-surface border border-line text-muted hover:text-ink">
            <UserPlus className="h-3.5 w-3.5" /> Klant
          </button>
          <button onClick={() => setCreatingProject(true)} className="chip bg-forest text-white">
            <Plus className="h-3.5 w-3.5" /> Project
          </button>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={<FolderKanban className="h-4 w-4 text-buurtkaart-deep" />} label="Actief" value={String(activeProjects.length)} sub={`${projects.length} totaal`} />
        <Kpi icon={<Wallet className="h-4 w-4 text-parkingyou-deep" />} label="Pipeline" value={eur(pipeline)} sub="nog te factureren" />
        <Kpi icon={<AlertTriangle className="h-4 w-4 text-cross-deep" />} label="Achterstallig" value={String(overdue.length)} sub={overdue.length ? 'over deadline' : 'alles op schema'} alert={overdue.length > 0} />
        <Kpi icon={<CheckCircle2 className="h-4 w-4 text-prjct-deep" />} label="Opgeleverd" value={eur(delivered)} sub={`${projects.filter((p) => p.status === 'done').length} projecten`} />
      </div>

      {/* Search + client filter */}
      <div className="flex gap-2 flex-wrap">
        <div className="flex-1 min-w-[180px] flex items-center gap-2 bg-sunken rounded-xl px-3 py-2">
          <Search className="h-4 w-4 text-faint shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Zoek op naam, klant of type…"
            className="flex-1 min-w-0 bg-transparent text-sm outline-none"
          />
        </div>
        {clientsWithProjects.length > 0 && (
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="text-sm bg-sunken rounded-xl px-3 py-2 border border-line focus:outline-none focus:border-forest text-ink-soft"
          >
            <option value="">Alle klanten</option>
            {clientsWithProjects.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <div className="flex items-center gap-1.5 bg-sunken rounded-xl px-3 py-2">
          <ArrowUpDown className="h-3.5 w-3.5 text-faint shrink-0" />
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="bg-transparent text-sm outline-none text-ink-soft"
          >
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Status filter + view toggle */}
      <FilterViewBar filter={statusFilter} onFilterChange={setStatusFilter} view={view} onViewChange={setView} />

      <ProjectGridList
        projects={filtered}
        view={view}
        gridClassName="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
        emptyMessage={projects.length === 0 ? 'Nog geen projecten — maak je eerste project aan.' : 'Geen projecten voor dit filter.'}
        onOpenProject={setOpenProject}
        onClientClick={openClientById}
      />

      {modals}
    </div>
  )
}
