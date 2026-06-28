import { useEffect, useState } from 'react'
import { X, FolderKanban } from 'lucide-react'
import type { Project, ProjectStatus } from '../types'
import { fmtDate } from '../domains'
import { useStore } from '../store'

const eur = (n: number | null) => {
  if (n == null) return '–'
  if (Math.abs(n) >= 1000) return `€${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return `€${n.toLocaleString('nl-NL')}`
}

const CRM_STATUS: Record<ProjectStatus, string> = {
  active: 'In uitvoering',
  review: 'In uitvoering',
  lead: 'Gepland',
  blocked: 'Gepauzeerd',
  done: 'Opgeleverd',
}

const STATUS_HEX: Record<string, string> = {
  'In uitvoering': '#6FA07C',
  Gepland: '#6E8CA8',
  Gepauzeerd: '#C6A05B',
  Opgeleverd: '#9385B0',
}

const PRIO_HEX: Record<string, string> = { High: '#C58392', Medium: '#C6A05B', Low: '#8C9080' }
const PRIO_NL: Record<string, string> = { High: 'Hoog', Medium: 'Gemiddeld', Low: 'Laag' }

const DOMAIN_COLOR: Record<string, string> = {
  parkingyou: '#6E8CA8',
  prjct: '#9385B0',
  buurtkaart: '#6FA07C',
  personal: '#C6A05B',
  cross: '#C58392',
}

export default function ProjectDetail({
  project,
  onClose,
}: {
  project: Project
  onClose: () => void
}) {
  const { clients } = useStore()
  const client = clients.find((c) => c.id === project.clientId) ?? null
  const [voortgangOpen, setVoortgangOpen] = useState(true)

  const crmStatus = CRM_STATUS[project.status]
  const statusColor = STATUS_HEX[crmStatus]
  const iconColor = DOMAIN_COLOR[project.domain] ?? '#9385B0'

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center">
      <div className="absolute inset-0 bg-scrim/55 backdrop-blur-md" onClick={onClose} />
      <div className="relative mt-auto md:mt-0 w-full md:max-w-lg md:max-h-[90dvh] flex flex-col bg-canvas md:rounded-4xl rounded-t-4xl border border-line shadow-pop overflow-y-auto">
        {/* Header */}
        <div className="flex items-start gap-3 p-5 pb-4 sticky top-0 bg-canvas z-10">
          <span
            className="h-12 w-12 rounded-3xl flex items-center justify-center shrink-0"
            style={{ background: `${iconColor}28` }}
          >
            <FolderKanban className="h-6 w-6" style={{ color: iconColor }} />
          </span>
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="font-semibold text-lg leading-tight">{project.name}</div>
            {project.type && project.type.length > 0 && (
              <div className="text-sm text-faint mt-0.5">{project.type.join(' · ')}</div>
            )}
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full bg-sunken flex items-center justify-center text-muted hover:text-ink shrink-0 mt-0.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Info card */}
        <div className="mx-4 rounded-2xl bg-surface border border-line overflow-hidden">
          <InfoRow label="Status">
            <span className="font-semibold" style={{ color: statusColor }}>
              {crmStatus}
            </span>
          </InfoRow>
          <InfoRow label="Klant" divider>
            <span className="font-semibold">{client?.name ?? 'Geen klant'}</span>
          </InfoRow>
          <InfoRow label="Deadline" divider>
            <span className="text-muted">{project.deadline ? fmtDate(project.deadline) : '–'}</span>
          </InfoRow>
          <InfoRow label="Waarde" divider>
            <span className="text-muted tabular-nums">{project.value ? eur(project.value) : '–'}</span>
          </InfoRow>
          {project.priority && (
            <InfoRow label="Prioriteit" divider>
              <span className="font-semibold" style={{ color: PRIO_HEX[project.priority] }}>
                {PRIO_NL[project.priority] ?? project.priority}
              </span>
            </InfoRow>
          )}
        </div>

        {/* Voortgang */}
        <div className="mx-4 mt-3 rounded-2xl bg-surface border border-line overflow-hidden">
          <button
            onClick={() => setVoortgangOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3.5"
          >
            <span className="font-semibold text-sm">Voortgang</span>
            <span
              className="h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: `${statusColor}22`, color: statusColor }}
            >
              {voortgangOpen ? '–' : '+'}
            </span>
          </button>
          {voortgangOpen && (
            <div className="px-4 pb-4">
              <div className="h-2 w-full rounded-full bg-line overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(2, Math.round(project.progress * 100))}%`, background: statusColor }}
                />
              </div>
              <div className="text-xs text-faint mt-1.5 text-right tabular-nums">
                {Math.round(project.progress * 100)}%
              </div>
            </div>
          )}
        </div>

        {/* Taken */}
        <div className="px-4 mt-4 pb-6">
          <div className="font-semibold mb-2">Taken</div>
          <div className="rounded-2xl bg-surface border border-line px-4 py-4 text-sm text-faint">
            Geen takendatabase in dit project
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoRow({
  label,
  children,
  divider,
}: {
  label: string
  children: React.ReactNode
  divider?: boolean
}) {
  return (
    <div className={`flex items-center justify-between px-4 py-3.5 ${divider ? 'border-t border-line' : ''}`}>
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  )
}
