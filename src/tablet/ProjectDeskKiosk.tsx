import { useEffect, useMemo, useState } from 'react'
import { FolderKanban, Users2 } from 'lucide-react'
import { useStore } from '../store'
import { ProjectBoardRail } from './desk/ProjectBoardRail'
import { ProjectFocusPanel } from './desk/ProjectFocusPanel'
import { ProjectSidePanel } from './desk/ProjectSidePanel'
import { ClientRail, ClientFocusPanel } from './desk/ClientDesk'

type Mode = 'projects' | 'crm'
const STORAGE_KEY = 'oslife.tablet.projectDesk'

function loadPersisted(): { focusedProjectId: string | null; focusedClientId: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { focusedProjectId: null, focusedClientId: null }
    const parsed = JSON.parse(raw)
    return { focusedProjectId: parsed.focusedProjectId ?? null, focusedClientId: parsed.focusedClientId ?? null }
  } catch {
    return { focusedProjectId: null, focusedClientId: null }
  }
}

/**
 * The desk tablet: a split-screen "what am I working on" overview that sits
 * next to the desktop — a project board + focused project workspace (Pomodoro
 * timer, milestones, remaining tasks, deliverables) and deadline calendar, with
 * a CRM toggle to browse clients/contacts. Interactive (timer, task/milestone
 * toggling, project/client selection) but not an editor — creating/editing
 * projects, clients, tasks or milestones stays on the phone.
 */
export default function ProjectDeskKiosk() {
  const projects = useStore((s) => s.projects)
  const clients = useStore((s) => s.clients)
  const activeTimer = useStore((s) => s.activeTimer)

  const [mode, setMode] = useState<Mode>('projects')
  const [focusedProjectId, setFocusedProjectId] = useState<string | null>(() => loadPersisted().focusedProjectId)
  const [focusedClientId, setFocusedClientId] = useState<string | null>(() => loadPersisted().focusedClientId)
  const [now, setNow] = useState(() => new Date())

  // A desk tablet's tab is never closed — keep the clock/date live.
  useEffect(() => {
    const tick = () => setNow(new Date())
    const id = window.setInterval(tick, 30_000)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('focus', tick)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ focusedProjectId, focusedClientId }))
  }, [focusedProjectId, focusedClientId])

  const liveProjects = useMemo(() => projects.filter((p) => !p.archived && p.status !== 'done'), [projects])

  const focusedProject = useMemo(() => {
    if (focusedProjectId) {
      const found = projects.find((p) => p.id === focusedProjectId)
      if (found) return found
    }
    if (activeTimer) {
      const running = projects.find((p) => p.id === activeTimer.projectId)
      if (running) return running
    }
    const withDeadline = [...liveProjects].filter((p) => p.deadline).sort((a, b) => a.deadline!.localeCompare(b.deadline!))
    return withDeadline[0] ?? liveProjects[0] ?? null
  }, [focusedProjectId, projects, activeTimer, liveProjects])

  const focusedClient = (focusedClientId ? clients.find((c) => c.id === focusedClientId) : null) ?? clients[0] ?? null

  const openClient = (clientId: string) => {
    setFocusedClientId(clientId)
    setMode('crm')
  }
  const openProject = (projectId: string) => {
    setFocusedProjectId(projectId)
    setMode('projects')
  }

  return (
    <div className="h-screen overflow-hidden flex flex-col p-5 md:p-7 gap-4 md:gap-5">
      <header className="flex items-center gap-4 shrink-0 pr-12">
        <div>
          <div className="text-lg md:text-xl font-bold text-ink capitalize">
            {now.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Amsterdam' })}
          </div>
          <div className="text-sm text-faint tabular-nums">
            {now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' })}
          </div>
        </div>
        <div className="ml-auto flex rounded-xl bg-sunken p-1">
          <button
            onClick={() => setMode('projects')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm md:text-base font-semibold transition-colors ${
              mode === 'projects' ? 'bg-canvas shadow-sm text-ink' : 'text-faint'
            }`}
          >
            <FolderKanban className="h-4 w-4 md:h-5 md:w-5" /> Projecten
          </button>
          <button
            onClick={() => setMode('crm')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm md:text-base font-semibold transition-colors ${
              mode === 'crm' ? 'bg-canvas shadow-sm text-ink' : 'text-faint'
            }`}
          >
            <Users2 className="h-4 w-4 md:h-5 md:w-5" /> CRM
          </button>
        </div>
      </header>

      {mode === 'projects' ? (
        <div className="grid grid-cols-12 gap-4 md:gap-5 flex-1 min-h-0">
          <div className="col-span-3 min-h-0">
            <ProjectBoardRail projects={projects} focusedId={focusedProject?.id ?? null} onSelect={setFocusedProjectId} />
          </div>
          <div className="col-span-6 min-h-0">
            {focusedProject ? (
              <ProjectFocusPanel project={focusedProject} onClientClick={openClient} />
            ) : (
              <div className="card p-8 text-center text-faint">Nog geen projecten — maak er een op je telefoon.</div>
            )}
          </div>
          <div className="col-span-3 min-h-0">
            <ProjectSidePanel project={focusedProject} projects={projects} onClientClick={openClient} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-4 md:gap-5 flex-1 min-h-0">
          <div className="col-span-4 min-h-0">
            <ClientRail clients={clients} focusedId={focusedClient?.id ?? null} onSelect={setFocusedClientId} />
          </div>
          <div className="col-span-8 min-h-0">
            {focusedClient ? (
              <ClientFocusPanel client={focusedClient} onOpenProject={openProject} />
            ) : (
              <div className="card p-8 text-center text-faint">Nog geen klanten — maak er een op je telefoon.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
