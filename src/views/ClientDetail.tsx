import { useMemo, useState } from 'react'
import { X, Pencil, Trash2, Plus, FolderKanban, MessageCircle, Mail, Globe } from 'lucide-react'
import type { Client, Project } from '../types'
import { fmtDate } from '../domains'
import { DomainChip } from '../components/ui'
import { useStore } from '../store'
import ClientForm from './ClientForm'
import ProjectForm from './ProjectForm'
import ProjectDetail, { ConfirmDelete } from './ProjectDetail'
import { eur, CLIENT_HEX, CLIENT_STATUS_NL, CRM_STATUS, STATUS_HEX } from '../components/crm'
import { deriveGmailMessages } from '../lib/crm/gmailInbox'

export default function ClientDetail({ client: initial, onClose }: { client: Client; onClose: () => void }) {
  const client = useStore((s) => s.clients.find((c) => c.id === initial.id)) ?? initial
  const { projects, messages, clients, emails, deleteClient } = useStore()

  const clientProjects = projects.filter((p) => p.clientId === client.id || p.client === client.name)
  const gmailDerived = useMemo(() => deriveGmailMessages(emails, clients), [emails, clients])
  const allMessages = useMemo(() => [...messages, ...gmailDerived], [messages, gmailDerived])
  const clientMessages = allMessages
    .filter((m) => m.clientId === client.id)
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .slice(0, 6)

  const [editing, setEditing] = useState(false)
  const [addingProject, setAddingProject] = useState(false)
  const [openProject, setOpenProject] = useState<Project | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)

  const color = CLIENT_HEX[client.clientStatus ?? 'Past'] ?? '#8C9080'
  const totalValue = clientProjects.reduce((a, p) => a + (p.value ?? 0), 0)

  return (
    <div className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center">
      <div className="absolute inset-0 bg-scrim/55 backdrop-blur-md" onClick={onClose} />
      <div className="relative mt-auto md:mt-0 w-full md:max-w-lg md:max-h-[92dvh] max-h-[94dvh] flex flex-col bg-canvas md:rounded-4xl rounded-t-4xl border border-line shadow-pop overflow-hidden">

        {/* Header */}
        <div className="flex items-start gap-3 p-5 pb-4 border-b border-line shrink-0">
          <span className="h-12 w-12 rounded-full flex items-center justify-center shrink-0 text-lg font-bold" style={{ color, background: `${color}28` }}>
            {client.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="font-semibold text-lg leading-tight">{client.name}</div>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {client.clientStatus && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color, background: `${color}22` }}>{CLIENT_STATUS_NL[client.clientStatus] ?? client.clientStatus}</span>
              )}
              <DomainChip domain={client.domain} small />
            </div>
          </div>
          <button onClick={() => setEditing(true)} title="Bewerken" className="h-8 w-8 rounded-full bg-sunken flex items-center justify-center text-muted hover:text-ink shrink-0"><Pencil className="h-4 w-4" /></button>
          <button onClick={() => setConfirmDel(true)} title="Verwijderen" className="h-8 w-8 rounded-full bg-sunken flex items-center justify-center text-muted hover:text-red-500 shrink-0"><Trash2 className="h-4 w-4" /></button>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-sunken flex items-center justify-center text-muted hover:text-ink shrink-0"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Contact + meta */}
          <div className="rounded-2xl bg-surface border border-line overflow-hidden">
            {client.email && (
              <InfoRow label="E-mail" icon={Mail}>
                <a href={`mailto:${client.email}`} className="text-parkingyou-deep underline underline-offset-2">{client.email}</a>
              </InfoRow>
            )}
            {client.website && (
              <InfoRow label="Website" icon={Globe}>
                <a href={client.website} target="_blank" rel="noreferrer" className="text-parkingyou-deep underline underline-offset-2 truncate max-w-[200px] inline-block align-bottom">{client.website.replace(/^https?:\/\//, '')}</a>
              </InfoRow>
            )}
            <InfoRow label="Potentie">{client.potentie ?? '–'}</InfoRow>
            <InfoRow label="Scope">{client.scope != null ? eur(client.scope) : '–'}</InfoRow>
            {client.firstContact && <InfoRow label="Eerste contact">{fmtDate(client.firstContact)}</InfoRow>}
            <InfoRow label="Projectwaarde">{eur(totalValue)} · {clientProjects.length} project(en)</InfoRow>
          </div>

          {/* Projects */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-sm">Projecten</div>
              <button onClick={() => setAddingProject(true)} className="text-xs text-forest font-medium flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Nieuw</button>
            </div>
            {clientProjects.length === 0 ? (
              <div className="rounded-2xl bg-surface border border-line px-4 py-4 text-sm text-faint">Nog geen projecten voor deze klant.</div>
            ) : (
              <div className="space-y-2">
                {clientProjects.map((p) => {
                  const crm = CRM_STATUS[p.status]; const sc = STATUS_HEX[crm]
                  return (
                    <button key={p.id} onClick={() => setOpenProject(p)} className="w-full text-left rounded-2xl bg-surface border border-line px-4 py-3 hover:bg-sunken transition-colors">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm truncate flex items-center gap-2"><FolderKanban className="h-3.5 w-3.5 text-prjct shrink-0" />{p.name}</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md shrink-0" style={{ color: sc, background: `${sc}22` }}>{crm}</span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        {p.type && p.type.length > 0 && <span className="text-xs text-faint truncate">{p.type.join(' · ')}</span>}
                        <span className="text-xs font-semibold tabular-nums ml-auto">{eur(p.value)}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Messages */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-sm flex items-center gap-1.5"><MessageCircle className="h-4 w-4 text-buurtkaart-deep" /> Berichten</div>
              <span className="text-xs text-faint">{allMessages.filter((m) => m.clientId === client.id).length}</span>
            </div>
            {clientMessages.length === 0 ? (
              <div className="rounded-2xl bg-surface border border-line px-4 py-4 text-sm text-faint">Nog geen gekoppelde berichten. Koppel ze in de Berichten-inbox.</div>
            ) : (
              <div className="space-y-1.5">
                {clientMessages.map((m) => (
                  <div key={m.id} className="rounded-xl bg-surface border border-line px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase text-faint">{m.channel}</span>
                      <span className="text-[11px] text-faint ml-auto">{fmtDate(m.ts.slice(0, 10))}</span>
                    </div>
                    <div className="text-sm text-ink-soft truncate">{m.subject || m.snippet}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {editing && <ClientForm client={client} onClose={() => setEditing(false)} />}
      {addingProject && <ProjectForm project={null} presetClientId={client.id} onClose={() => setAddingProject(false)} />}
      {openProject && <ProjectDetail project={openProject} onClose={() => setOpenProject(null)} />}
      {confirmDel && (
        <ConfirmDelete
          label={`Klant “${client.name}” verwijderen?`}
          detail="Gekoppelde projecten blijven bestaan maar worden losgekoppeld."
          onCancel={() => setConfirmDel(false)}
          onConfirm={() => { deleteClient(client.id); onClose() }}
        />
      )}
    </div>
  )
}

function InfoRow({ label, icon: Icon, children }: { label: string; icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-line last:border-0">
      <span className="text-sm text-muted flex items-center gap-1.5">{Icon && <Icon className="h-3.5 w-3.5" />}{label}</span>
      <span className="text-sm font-medium text-right">{children}</span>
    </div>
  )
}
