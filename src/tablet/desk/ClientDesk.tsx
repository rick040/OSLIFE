import { Globe, Mail, MessageSquare } from 'lucide-react'
import { useStore } from '../../store'
import type { Client } from '../../types'
import { TODAY } from '../../domains'
import { fmtDate } from '../../domains'
import { clientHealth, FOLLOWUP_META } from '../../lib/crm/followUp'
import { CLIENT_HEX, CLIENT_STATUS_NL, FollowUpDot, PersonAvatar, eur, ProjectRow } from '../../components/crm'
import { DomainChip } from '../../components/ui'

const HEALTH_RANK: Record<string, number> = { red: 0, yellow: 1, none: 2, green: 3 }

/** Left rail: all clients, most-needs-attention first (follow-up health). */
export function ClientRail({
  clients, focusedId, onSelect,
}: { clients: Client[]; focusedId: string | null; onSelect: (id: string) => void }) {
  const sorted = [...clients].sort((a, b) => {
    const r = HEALTH_RANK[clientHealth(a, TODAY)] - HEALTH_RANK[clientHealth(b, TODAY)]
    return r !== 0 ? r : a.name.localeCompare(b.name)
  })

  return (
    <div className="flex flex-col gap-2 h-full overflow-y-auto pr-1">
      {sorted.length === 0 && <p className="text-sm text-faint p-2">Nog geen klanten.</p>}
      {sorted.map((c) => {
        const color = CLIENT_HEX[c.clientStatus ?? 'Past'] ?? '#a3a3a3'
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`w-full text-left p-3 rounded-xl border transition-colors flex items-center gap-2.5 ${
              c.id === focusedId ? 'border-forest bg-forest/8' : 'border-line hover:bg-sunken'
            }`}
          >
            <span
              className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
              style={{ color, background: `${color}28` }}
            >
              {c.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm md:text-base font-semibold truncate">{c.name}</div>
              {c.clientStatus && <div className="text-xs text-faint">{CLIENT_STATUS_NL[c.clientStatus] ?? c.clientStatus}</div>}
            </div>
            <FollowUpDot client={c} className="shrink-0" />
          </button>
        )
      })}
    </div>
  )
}

/** Right panel: contact info, linked people, linked projects and recent
 *  messages for the focused client — everything useful before a call. */
export function ClientFocusPanel({ client, onOpenProject }: { client: Client; onOpenProject: (projectId: string) => void }) {
  const people = useStore((s) => s.people)
  const projects = useStore((s) => s.projects)
  const messages = useStore((s) => s.messages)

  const contactPeople = people.filter((p) => p.clientId === client.id)
  const linkedProjects = projects.filter((p) => p.clientId === client.id && !p.archived)
  const recentMessages = messages
    .filter((m) => m.clientId === client.id)
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .slice(0, 4)

  const health = clientHealth(client, TODAY)
  const healthMeta = FOLLOWUP_META[health]

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      <div className="card p-5 md:p-6 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-2xl md:text-3xl font-bold leading-tight truncate">{client.name}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: healthMeta.hex }} />
              <span className="text-sm text-faint">{healthMeta.label}</span>
            </div>
          </div>
          {client.clientStatus && (
            <span
              className="text-xs md:text-sm font-semibold px-2.5 py-1 rounded-md shrink-0"
              style={{ color: CLIENT_HEX[client.clientStatus], background: `${CLIENT_HEX[client.clientStatus]}22` }}
            >
              {CLIENT_STATUS_NL[client.clientStatus] ?? client.clientStatus}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <DomainChip domain={client.domain} />
          {client.scope != null && <span className="text-sm font-semibold tabular-nums">Scope: {eur(client.scope)}</span>}
          {client.potentie && <span className="chip bg-sunken text-ink-soft">Potentie: {client.potentie}</span>}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 text-sm text-faint">
          {client.email && <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{client.email}</span>}
          {client.website && <span className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" />{client.website}</span>}
          {client.lastContactedAt && <span>Laatste contact: {fmtDate(client.lastContactedAt)}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
        <div className="card p-4 md:p-5 flex flex-col min-h-0">
          <div className="text-sm md:text-base font-semibold mb-3 shrink-0">Contactpersonen</div>
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
            {contactPeople.length === 0 ? (
              <p className="text-sm text-faint">Nog geen contactpersonen gekoppeld.</p>
            ) : (
              contactPeople.map((p) => (
                <div key={p.id} className="flex items-center gap-2.5">
                  <PersonAvatar person={p} className="h-9 w-9 text-sm" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.displayName}{p.jobTitle ? ` · ${p.jobTitle}` : ''}</div>
                    <div className="text-xs text-faint truncate">{[...p.emails, ...p.phones].join(' · ') || 'Geen contactgegevens'}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card p-4 md:p-5 flex flex-col min-h-0">
          <div className="text-sm md:text-base font-semibold mb-3 shrink-0">Projecten</div>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {linkedProjects.length === 0 ? (
              <p className="text-sm text-faint">Nog geen projecten.</p>
            ) : (
              linkedProjects.map((p) => <ProjectRow key={p.id} p={p} onClick={() => onOpenProject(p.id)} />)
            )}
          </div>
        </div>
      </div>

      {recentMessages.length > 0 && (
        <div className="card p-4 md:p-5 shrink-0">
          <div className="text-sm md:text-base font-semibold mb-2.5 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-ink-soft" /> Laatste berichten
          </div>
          <div className="space-y-2">
            {recentMessages.map((m) => (
              <div key={m.id} className="text-sm flex items-baseline gap-2">
                <span className="text-faint text-xs shrink-0">{fmtDate(m.ts)}</span>
                <span className="truncate">{m.subject ? `${m.subject} — ` : ''}{m.snippet}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
