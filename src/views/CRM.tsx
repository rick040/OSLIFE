import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { SectionTitle } from '../components/ui'
import Messages from './Messages'
import type { ClientStatus } from '../types'
import { TODAY } from '../domains'
import { clientHealth, FOLLOWUP_META } from '../lib/crm/followUp'
import {
  eur, CRM_STATUS, STATUS_HEX, CLIENT_HEX, CLIENT_STATUS_NL,
  Kpi, ClientCard,
} from '../components/crm'
import {
  FilterViewBar, ProjectGridList, useProjectBrowserModals,
} from '../components/ProjectBrowser'
import type { ProjectViewMode } from '../components/ProjectBrowser'
import {
  Users,
  FolderKanban,
  Wallet,
  CheckCircle2,
  MessageCircle,
  ChevronRight,
  Plus,
  UserPlus,
  Sparkles,
} from 'lucide-react'
import OnboardingWizard from '../components/OnboardingWizard'

const STATUS_ORDER = ['In uitvoering', 'Gepland', 'Gepauzeerd', 'Opgeleverd'] as const

export default function CRM() {
  const { projects, clients, messages, markConversationRead } = useStore()
  const [filter, setFilter] = useState('In uitvoering')
  const [view, setView] = useState<ProjectViewMode>('grid')
  const [showMessages, setShowMessages] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const {
    setOpenProject, setOpenClient, setCreatingProject, setCreatingClient,
    openClientById, modals,
  } = useProjectBrowserModals(clients)

  function handleOnboardingDone(result: { clientId: string | null; projectId: string | null }) {
    setShowOnboarding(false)
    // Read fresh from the store rather than this render's `projects`/`clients`
    // closure — the create just resolved and may not have re-rendered CRM yet.
    const fresh = useStore.getState()
    if (result.projectId) {
      const p = fresh.projects.find((x) => x.id === result.projectId)
      if (p) setOpenProject(p)
    } else if (result.clientId) {
      const c = fresh.clients.find((x) => x.id === result.clientId)
      if (c) setOpenClient(c)
    }
  }

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

  // Object-permanence follow-up: clients whose cycle is due (red) or nearly due
  // (yellow), red first — so they resurface instead of quietly slipping away.
  const followUps = useMemo(() => {
    const rank = { red: 0, yellow: 1 } as Record<string, number>
    return clients
      .map((c) => ({ c, health: clientHealth(c, TODAY) }))
      .filter((x) => x.health === 'red' || x.health === 'yellow')
      .sort((a, b) => rank[a.health] - rank[b.health])
  }, [clients])

  const shown = filter === 'Alle' ? projects : projects.filter((p) => CRM_STATUS[p.status] === filter)

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 flex-wrap">
        <Users className="h-5 w-5 text-prjct" />
        <h1 className="text-xl font-semibold">CRM</h1>
        <span className="chip bg-sunken text-muted ml-1">
          <span className="h-1.5 w-1.5 rounded-full bg-forest" /> {projects.length} projecten · {clients.length} klanten
        </span>
        <div className="flex gap-2 ml-auto">
          <button onClick={() => setCreatingClient(true)} className="chip bg-surface border border-line text-muted hover:text-ink">
            <UserPlus className="h-3.5 w-3.5" /> Klant
          </button>
          <button onClick={() => setCreatingProject(true)} className="chip bg-forest text-white">
            <Plus className="h-3.5 w-3.5" /> Project
          </button>
        </div>
      </div>

      {/* Onboarding wizard entry — the full flow: paste a client message, let
          AI draft the project, review every step, commit to the CRM. */}
      <button onClick={() => setShowOnboarding(true)} className="card p-4 w-full flex items-center gap-3 hover:bg-sunken transition-colors text-left border-forest/30 bg-forest/5">
        <span className="h-10 w-10 rounded-2xl bg-forest/15 flex items-center justify-center shrink-0">
          <Sparkles className="h-5 w-5 text-forest" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold">Klant onboarden</div>
          <div className="text-xs text-muted">Plak een bericht, laat AI het project opzetten — scope, taken, mijlpalen &amp; voorstel</div>
        </div>
        <ChevronRight className="h-4 w-4 text-faint shrink-0" />
      </button>

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

      {/* Opvolgen — clients due (or nearly due) for follow-up */}
      {followUps.length > 0 && (
        <div className="card p-4">
          <SectionTitle hint="Klanten die je volgens hun opvolgcyclus weer moet spreken.">Opvolgen</SectionTitle>
          <div className="space-y-1.5">
            {followUps.map(({ c, health }) => {
              const m = FOLLOWUP_META[health]
              return (
                <button key={c.id} onClick={() => setOpenClient(c)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-surface border border-line hover:bg-sunken transition-colors text-left">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: m.hex }} />
                  <span className="text-sm font-medium truncate flex-1">{c.name}</span>
                  <span className="text-[11px] font-semibold shrink-0" style={{ color: m.hex }}>{m.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

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
        <FilterViewBar filter={filter} onFilterChange={setFilter} view={view} onViewChange={setView} className="mb-3" />

        <ProjectGridList
          projects={shown}
          view={view}
          emptyMessage="Geen projecten in deze status."
          onOpenProject={setOpenProject}
          onClientClick={openClientById}
        />
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
      {showOnboarding && (
        <OnboardingWizard onClose={() => setShowOnboarding(false)} onDone={handleOnboardingDone} />
      )}
      {modals}
    </div>
  )
}
