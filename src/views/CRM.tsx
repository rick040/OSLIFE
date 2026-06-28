import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { TODAY, daysBetween, fmtDate } from '../domains'
import { DomainChip, SectionTitle, Empty } from '../components/ui'
import Messages from './Messages'
import ProjectDetail from './ProjectDetail'
import ClientDetail from './ClientDetail'
import type { Project, ProjectStatus, ClientStatus, Client } from '../types'
import {
  Users,
  FolderKanban,
  Wallet,
  CheckCircle2,
  Clock,
  MessageCircle,
  ChevronRight,
  LayoutGrid,
  List,
} from 'lucide-react'

const eur = (n: number | null) => {
  if (n == null) return '–'
  if (Math.abs(n) >= 1000) return `€${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return `€${n.toLocaleString('nl-NL')}`
}

// OS LIFE Project.status → Dutch CRM status (mirrors Notion Projects DB).
const CRM_STATUS: Record<ProjectStatus, string> = {
  active: 'In uitvoering',
  review: 'In uitvoering',
  lead: 'Gepland',
  blocked: 'Gepauzeerd',
  done: 'Opgeleverd',
}
const STATUS_ORDER = ['In uitvoering', 'Gepland', 'Gepauzeerd', 'Opgeleverd'] as const

const STATUS_HEX: Record<string, string> = {
  'In uitvoering': '#6FA07C', // buurtkaart
  Gepland: '#6E8CA8', // parkingyou
  Gepauzeerd: '#C6A05B', // personal
  Opgeleverd: '#9385B0', // prjct
}
const CLIENT_HEX: Record<string, string> = {
  Active: '#6FA07C',
  Lead: '#6E8CA8',
  Prospect: '#9385B0',
  Planned: '#C6A05B',
  Inactive: '#C58392',
  Past: '#8C9080',
}
const PRIO_HEX: Record<string, string> = { High: '#C58392', Medium: '#C6A05B', Low: '#8C9080' }
const PRIO_NL: Record<string, string> = { High: 'Hoog', Medium: 'Gemiddeld', Low: 'Laag' }
const CLIENT_STATUS_NL: Record<string, string> = { Active: 'Actief', Lead: 'Lead', Prospect: 'Prospect', Planned: 'Gepland', Inactive: 'Inactief', Past: 'Voorbij' }

const STATUS_FILTERS = [
  { value: 'Alle', label: 'Alle' },
  { value: 'In uitvoering', label: 'Actief' },
  { value: 'Gepland', label: 'Gepland' },
  { value: 'Gepauzeerd', label: 'Pauze' },
  { value: 'Opgeleverd', label: 'Opgeleverd' },
]

function deadlineInfo(iso: string | null) {
  if (!iso) return null
  const d = daysBetween(TODAY, iso)
  if (d < 0) return { label: `${-d}d te laat`, color: '#C58392', urgent: true }
  if (d === 0) return { label: 'Vandaag', color: '#C6A05B', urgent: true }
  if (d <= 7) return { label: `over ${d}d`, color: '#C6A05B', urgent: true }
  return { label: fmtDate(iso), color: '#8C9080', urgent: false }
}

export default function CRM() {
  const { projects, clients, messages, markConversationRead } = useStore()
  const [filter, setFilter] = useState('In uitvoering')
  const [view, setView] = useState<'grid' | 'lijst'>('grid')
  const [showMessages, setShowMessages] = useState(false)
  const [openProject, setOpenProject] = useState<Project | null>(null)
  const [openClient, setOpenClient] = useState<Client | null>(null)

  const unread = messages.filter((m) => m.unread).length

  const byStatus = useMemo(() => {
    const m = new Map<string, { count: number; budget: number }>()
    STATUS_ORDER.forEach((s) => m.set(s, { count: 0, budget: 0 }))
    projects.forEach((p) => {
      const k = CRM_STATUS[p.status]
      const e = m.get(k)!
      e.count++
      e.budget += p.value ?? 0
    })
    return m
  }, [projects])

  const pipeline = (byStatus.get('In uitvoering')?.budget ?? 0) + (byStatus.get('Gepland')?.budget ?? 0)
  const delivered = byStatus.get('Opgeleverd')?.budget ?? 0
  const activeCount = byStatus.get('In uitvoering')?.count ?? 0
  const maxBudget = Math.max(1, ...STATUS_ORDER.map((s) => byStatus.get(s)?.budget ?? 0))

  const clientBuckets = useMemo(() => {
    const order: ClientStatus[] = ['Active', 'Lead', 'Prospect', 'Planned', 'Inactive', 'Past']
    const m = new Map<string, number>()
    clients.forEach((c) => m.set(c.clientStatus ?? '—', (m.get(c.clientStatus ?? '—') ?? 0) + 1))
    return order.filter((o) => m.get(o)).map((o) => ({ label: o, count: m.get(o)! }))
  }, [clients])
  const activeClients = clients.filter((c) => c.clientStatus === 'Active').length

  const shown = filter === 'Alle' ? projects : projects.filter((p) => CRM_STATUS[p.status] === filter)

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-prjct" />
        <h1 className="text-xl font-semibold">CRM</h1>
        <span className="chip bg-sunken text-muted ml-1">
          <span className="h-1.5 w-1.5 rounded-full bg-forest" /> {projects.length} projecten · {clients.length} klanten
        </span>
      </div>

      {/* Berichten entry */}
      <button onClick={() => setShowMessages(true)} className="card p-4 w-full flex items-center gap-3 hover:bg-sunken transition-colors text-left">
        <span className="h-10 w-10 rounded-2xl bg-buurtkaart/15 flex items-center justify-center shrink-0">
          <MessageCircle className="h-5 w-5 text-buurtkaart-deep" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold">Berichten</div>
          <div className="text-xs text-muted">E-mail, Fiverr &amp; WhatsApp van klanten</div>
        </div>
        {unread > 0 && <span className="chip bg-cross/15 text-cross-deep">{unread} ongelezen</span>}
        <ChevronRight className="h-4 w-4 text-faint shrink-0" />
      </button>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3">
        <Kpi icon={<FolderKanban className="h-4 w-4 text-buurtkaart-deep" />} label="Actief" value={String(activeCount)} sub={`${projects.length} totaal`} />
        <Kpi icon={<Wallet className="h-4 w-4 text-parkingyou-deep" />} label="Pipeline" value={eur(pipeline)} sub="in uitvoering + gepland" />
        <Kpi icon={<CheckCircle2 className="h-4 w-4 text-prjct-deep" />} label="Opgeleverd" value={eur(delivered)} sub={`${byStatus.get('Opgeleverd')?.count ?? 0} projecten`} />
        <Kpi icon={<Users className="h-4 w-4 text-cross-deep" />} label="Klanten" value={String(clients.length)} sub={`${activeClients} actief`} />
      </div>

      {/* Pipeline per status */}
      <div className="card p-4">
        <SectionTitle>Pipeline per status</SectionTitle>
        <div className="space-y-3">
          {STATUS_ORDER.map((s) => {
            const e = byStatus.get(s)!
            const c = STATUS_HEX[s]
            return (
              <div key={s}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: c }} /> {s}
                  </span>
                  <span className="text-xs text-faint tabular-nums">{e.count} · {eur(e.budget)}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-line overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(2, (e.budget / maxBudget) * 100)}%`, background: c }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Klanten per status */}
      {clientBuckets.length > 0 && (
        <div className="card p-4">
          <SectionTitle>Klanten per status</SectionTitle>
          <div className="flex h-2.5 rounded-full overflow-hidden mb-3">
            {clientBuckets.map((b) => (
              <div key={b.label} style={{ flex: b.count, background: CLIENT_HEX[b.label] }} title={`${b.label}: ${b.count}`} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {clientBuckets.map((b) => (
              <span key={b.label} className="text-xs text-muted flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: CLIENT_HEX[b.label] }} /> {CLIENT_STATUS_NL[b.label] ?? b.label} · {b.count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filters + view toggle */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`chip ${filter === f.value ? 'bg-forest text-white' : 'bg-surface border border-line text-muted hover:text-ink'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex rounded-xl bg-sunken p-0.5 shrink-0">
            <button onClick={() => setView('grid')} className={`px-2.5 py-1 rounded-lg ${view === 'grid' ? 'bg-surface shadow-sm text-ink' : 'text-faint'}`}>
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button onClick={() => setView('lijst')} className={`px-2.5 py-1 rounded-lg ${view === 'lijst' ? 'bg-surface shadow-sm text-ink' : 'text-faint'}`}>
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {shown.length === 0 ? (
          <Empty>Geen projecten in deze status.</Empty>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {shown.map((p) => <ProjectCard key={p.id} p={p} onClick={() => setOpenProject(p)} />)}
          </div>
        ) : (
          <div className="space-y-2.5">
            {shown.map((p) => <ProjectRow key={p.id} p={p} onClick={() => setOpenProject(p)} />)}
          </div>
        )}
      </div>

      {/* Clients overview */}
      {clients.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between mb-3">
            <SectionTitle>Klanten</SectionTitle>
            <span className="text-xs text-faint">{clients.length}</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
            {clients.map((c) => <ClientCard key={c.id} c={c} onClick={() => setOpenClient(c)} />)}
          </div>
        </div>
      )}

      {showMessages && (
        <Messages
          messages={messages}
          onClose={() => setShowMessages(false)}
          onReadConversation={markConversationRead}
        />
      )}
      {openProject && (
        <ProjectDetail project={openProject} onClose={() => setOpenProject(null)} />
      )}
      {openClient && (
        <ClientDetail client={openClient} onClose={() => setOpenClient(null)} />
      )}
    </div>
  )
}

function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="h-7 w-7 rounded-xl bg-sunken flex items-center justify-center">{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</span>
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-faint mt-0.5">{sub}</div>
    </div>
  )
}

function StatusBadge({ status }: { status: ProjectStatus }) {
  const label = CRM_STATUS[status]
  const c = STATUS_HEX[label]
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap" style={{ color: c, background: `${c}22` }}>
      {label}
    </span>
  )
}

function ProjectCard({ p, onClick }: { p: Project; onClick: () => void }) {
  const dl = deadlineInfo(p.deadline)
  return (
    <button onClick={onClick} className="card p-3.5 flex flex-col min-h-[150px] text-left w-full hover:bg-sunken transition-colors">
      <div className="flex items-center justify-between mb-2">
        <span className="h-9 w-9 rounded-2xl bg-sunken flex items-center justify-center">
          <FolderKanban className="h-4.5 w-4.5 text-prjct" />
        </span>
        <StatusBadge status={p.status} />
      </div>
      <div className="text-sm font-semibold leading-tight line-clamp-2">{p.name}</div>
      <div className="text-xs text-faint mt-0.5 truncate">{p.client}</div>
      <div className="flex-1" />
      <div className="flex flex-wrap gap-1 mt-2 mb-2">
        {p.priority && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: PRIO_HEX[p.priority], background: `${PRIO_HEX[p.priority]}22` }}>
            {PRIO_NL[p.priority] ?? p.priority}
          </span>
        )}
        {dl && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded inline-flex items-center gap-1" style={{ color: dl.color, background: `${dl.color}22` }}>
            <Clock className="h-2.5 w-2.5" /> {dl.label}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-line pt-2">
        <span className="text-sm font-semibold tabular-nums">{eur(p.value)}</span>
        {p.type?.[0] && <span className="text-[11px] text-faint">{p.type[0]}</span>}
      </div>
    </button>
  )
}

function ProjectRow({ p, onClick }: { p: Project; onClick: () => void }) {
  const dl = deadlineInfo(p.deadline)
  return (
    <button onClick={onClick} className="card p-3.5 flex items-start gap-3 text-left w-full hover:bg-sunken transition-colors">
      <span className="h-10 w-10 rounded-2xl bg-sunken flex items-center justify-center shrink-0">
        <FolderKanban className="h-5 w-5 text-prjct" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold truncate">{p.name}</span>
          <span className="text-sm font-semibold tabular-nums shrink-0">{eur(p.value)}</span>
        </div>
        <div className="text-xs text-muted truncate mt-0.5">{p.client}</div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <StatusBadge status={p.status} />
          {p.priority && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md" style={{ color: PRIO_HEX[p.priority], background: `${PRIO_HEX[p.priority]}22` }}>{PRIO_NL[p.priority] ?? p.priority}</span>
          )}
          {dl && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md inline-flex items-center gap-1" style={{ color: dl.color, background: `${dl.color}22` }}>
              <Clock className="h-2.5 w-2.5" /> {dl.label}
            </span>
          )}
          {p.type?.slice(0, 2).map((t) => (
            <span key={t} className="text-[10px] px-2 py-0.5 rounded-md bg-sunken text-faint">{t}</span>
          ))}
        </div>
      </div>
    </button>
  )
}

function ClientCard({ c, onClick }: { c: Client; onClick: () => void }) {
  const color = CLIENT_HEX[c.clientStatus ?? 'Past'] ?? '#8C9080'
  return (
    <button onClick={onClick} className="card p-3.5 w-40 shrink-0 text-left hover:bg-sunken transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <span className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0" style={{ color, background: `${color}28` }}>
          {c.name.slice(0, 1).toUpperCase()}
        </span>
        {c.clientStatus && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color, background: `${color}22` }}>{CLIENT_STATUS_NL[c.clientStatus] ?? c.clientStatus}</span>
        )}
      </div>
      <div className="text-sm font-semibold truncate">{c.name}</div>
      <div className="mt-1.5 space-y-0.5 text-[11px] text-faint">
        {c.potentie && <div>Potentie: {c.potentie}</div>}
        {c.scope != null && <div className="tabular-nums">Scope: {eur(c.scope)}</div>}
        <div className="flex items-center gap-1"><DomainChip domain={c.domain} small /></div>
      </div>
    </button>
  )
}
