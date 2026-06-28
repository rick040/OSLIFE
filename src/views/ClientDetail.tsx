import { useEffect } from 'react'
import { X } from 'lucide-react'
import type { Client, ProjectStatus } from '../types'
import { fmtDate } from '../domains'
import { DomainChip } from '../components/ui'
import { useStore } from '../store'

const eur = (n: number | null) => {
  if (n == null) return '–'
  if (Math.abs(n) >= 1000) return `€${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return `€${n.toLocaleString('nl-NL')}`
}

const CLIENT_HEX: Record<string, string> = {
  Active: '#6FA07C',
  Lead: '#6E8CA8',
  Prospect: '#9385B0',
  Planned: '#C6A05B',
  Inactive: '#C58392',
  Past: '#8C9080',
}

const CLIENT_STATUS_NL: Record<string, string> = { Active: 'Actief', Lead: 'Lead', Prospect: 'Prospect', Planned: 'Gepland', Inactive: 'Inactief', Past: 'Voorbij' }

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

export default function ClientDetail({
  client,
  onClose,
}: {
  client: Client
  onClose: () => void
}) {
  const { projects } = useStore()
  const clientProjects = projects.filter(
    (p) => p.clientId === client.id || p.client === client.name,
  )
  const color = CLIENT_HEX[client.clientStatus ?? 'Past'] ?? '#8C9080'

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const hasContactInfo = !!(client.email || client.website)

  return (
    <div className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center">
      <div className="absolute inset-0 bg-scrim/55 backdrop-blur-md" onClick={onClose} />
      <div className="relative mt-auto md:mt-0 w-full md:max-w-lg md:max-h-[90dvh] flex flex-col bg-canvas md:rounded-4xl rounded-t-4xl border border-line shadow-pop overflow-y-auto">
        {/* Header */}
        <div className="flex items-start gap-3 p-5 pb-4 sticky top-0 bg-canvas z-10">
          <span
            className="h-12 w-12 rounded-full flex items-center justify-center shrink-0 text-lg font-bold"
            style={{ color, background: `${color}28` }}
          >
            {client.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="font-semibold text-lg leading-tight">{client.name}</div>
            <div className="flex items-center gap-1.5 mt-1">
              {client.clientStatus && (
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={{ color, background: `${color}22` }}
                >
                  {CLIENT_STATUS_NL[client.clientStatus] ?? client.clientStatus}
                </span>
              )}
              <DomainChip domain={client.domain} small />
            </div>
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
          {client.email && (
            <InfoRow label="E-mail">
              <a
                href={`mailto:${client.email}`}
                className="text-parkingyou-deep underline underline-offset-2"
              >
                {client.email}
              </a>
            </InfoRow>
          )}
          {client.website && (
            <InfoRow label="Website" divider={!!client.email}>
              <a
                href={client.website}
                target="_blank"
                rel="noreferrer"
                className="text-parkingyou-deep underline underline-offset-2 truncate max-w-[200px] block"
              >
                {client.website.replace(/^https?:\/\//, '')}
              </a>
            </InfoRow>
          )}
          <InfoRow label="Potentie" divider={hasContactInfo}>
            <span className="font-semibold">{client.potentie ?? '–'}</span>
          </InfoRow>
          <InfoRow label="Scope" divider>
            <span className="font-semibold tabular-nums">
              {client.scope != null ? eur(client.scope) : '–'}
            </span>
          </InfoRow>
          {client.firstContact && (
            <InfoRow label="Eerste contact" divider>
              <span className="text-muted">{fmtDate(client.firstContact)}</span>
            </InfoRow>
          )}
        </div>

        {/* Projects */}
        <div className="px-4 mt-4 pb-6">
          <div className="flex items-baseline justify-between mb-2">
            <div className="font-semibold">Projecten</div>
            <span className="text-xs text-faint">{clientProjects.length}</span>
          </div>
          {clientProjects.length === 0 ? (
            <div className="rounded-2xl bg-surface border border-line px-4 py-4 text-sm text-faint">
              Geen projecten gekoppeld aan deze klant
            </div>
          ) : (
            <div className="space-y-2">
              {clientProjects.map((p) => {
                const crmStatus = CRM_STATUS[p.status]
                const statusColor = STATUS_HEX[crmStatus]
                return (
                  <div key={p.id} className="rounded-2xl bg-surface border border-line px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm truncate">{p.name}</span>
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-md shrink-0"
                        style={{ color: statusColor, background: `${statusColor}22` }}
                      >
                        {crmStatus}
                      </span>
                    </div>
                    {p.type && p.type.length > 0 && (
                      <div className="text-xs text-faint mt-0.5">{p.type.join(' · ')}</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
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
