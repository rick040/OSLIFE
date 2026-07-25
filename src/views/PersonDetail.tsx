import { useMemo, useState } from 'react'
import {
  X, Pencil, Trash2, Mail, Phone, Instagram, Linkedin, Twitter, Globe,
  Building2, Briefcase, Share2, StickyNote, Link2, Plus, CheckCircle2,
} from 'lucide-react'
import type { Person, PersonKind } from '../types'
import { useStore } from '../store'
import { SheetShell } from '../components/crm'
import { fmtDate } from '../domains'
import { connectionsForPerson } from '../lib/crm/relaties'
import PersonForm from './PersonForm'
import { ConfirmDialog, Pill } from '../components/ui'

const KIND_LABEL: Record<PersonKind, string> = { network: 'Netwerk', business: 'Zakelijk', both: 'Beide' }
const KIND_HEX: Record<PersonKind, string> = { network: '#60A5FA', business: '#A78BFA', both: '#34D399' }
const CHANNEL_LABEL: Record<string, string> = { mail: 'Mail', whatsapp: 'WhatsApp', call: 'Bellen', in_person: 'Persoonlijk', fiverr: 'Fiverr', note: 'Notitie' }

const CONNECTION_LABEL_PRESETS = ['Partner', 'Collega van', 'Vriend(in) van', 'Geïntroduceerd door', 'Familie van', 'Werkt met']

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

async function shareOrCopy(url: string, title: string) {
  if (navigator.share) {
    try { await navigator.share({ url, title }); return } catch { /* user cancelled — fall through to copy */ }
  }
  try { await navigator.clipboard.writeText(url) } catch { /* clipboard unavailable, nothing else to do */ }
}

function SocialRow({ icon: Icon, label, url }: { icon: React.ComponentType<{ className?: string }>; label: string; url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-line last:border-0 gap-2">
      <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 min-w-0 text-parkingyou-deep hover:underline underline-offset-2">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate text-sm">{label}</span>
      </a>
      <button
        title="Delen / kopiëren"
        onClick={() => { void shareOrCopy(url, label); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
        className="p-1.5 rounded-lg hover:bg-sunken text-muted shrink-0"
      >
        {copied ? <CheckCircle2 className="h-4 w-4 text-forest" /> : <Share2 className="h-4 w-4" />}
      </button>
    </div>
  )
}

export default function PersonDetail({ person: initial, onClose }: { person: Person; onClose: () => void }) {
  const person = useStore((s) => s.people.find((p) => p.id === initial.id)) ?? initial
  const { people, personConnections, interactions, deletePerson, logInteraction, addPersonConnection, deletePersonConnection } = useStore()

  const [editing, setEditing] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [note, setNote] = useState('')
  const [addingConnection, setAddingConnection] = useState(false)
  const [connOtherId, setConnOtherId] = useState('')
  const [connLabel, setConnLabel] = useState(CONNECTION_LABEL_PRESETS[0])
  const [connNote, setConnNote] = useState('')

  const color = KIND_HEX[person.kind]
  const since = daysSince(person.lastInteractionAt)
  const overdue = person.cadenceDays != null && since != null && since > person.cadenceDays

  const timeline = useMemo(
    () => interactions.filter((i) => i.personId === person.id).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 8),
    [interactions, person.id],
  )
  const connections = useMemo(() => connectionsForPerson(person.id, personConnections, people), [personConnections, people, person.id])
  const connectableOthers = useMemo(
    () => people.filter((p) => p.id !== person.id && !connections.some((c) => c.other.id === p.id)),
    [people, person.id, connections],
  )

  function submitNote() {
    if (!note.trim()) return
    logInteraction({ personId: person.id, channel: 'note', direction: 'out', summary: note.trim(), owedReply: false, occurredAt: new Date().toISOString() })
    setNote('')
  }

  function submitConnection() {
    if (!connOtherId) return
    addPersonConnection({ personAId: person.id, personBId: connOtherId, label: connLabel.trim() || 'Connectie', note: connNote.trim() || null })
    setConnOtherId(''); setConnNote(''); setAddingConnection(false)
  }

  return (
    <>
      <SheetShell onClose={onClose} panelClassName="md:max-w-lg md:max-h-[92dvh] max-h-[94dvh]">
        <div className="flex items-start gap-3 p-5 pb-4 border-b border-line shrink-0">
          <span className="h-12 w-12 rounded-full flex items-center justify-center shrink-0 text-lg font-bold" style={{ color, background: `${color}28` }}>
            {person.displayName.slice(0, 1).toUpperCase()}
          </span>
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="font-semibold text-lg leading-tight truncate">{person.displayName}</div>
            {(person.jobTitle || person.company) && (
              <div className="text-xs text-faint mt-0.5 truncate">{[person.jobTitle, person.company].filter(Boolean).join(' bij ')}</div>
            )}
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <Pill hex={color} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full">{KIND_LABEL[person.kind]}</Pill>
              {person.tags.map((t) => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-line text-muted">{t}</span>
              ))}
            </div>
          </div>
          <button onClick={() => setEditing(true)} title="Bewerken" className="h-8 w-8 rounded-full bg-sunken flex items-center justify-center text-muted hover:text-ink shrink-0"><Pencil className="h-4 w-4" /></button>
          <button onClick={() => setConfirmDel(true)} title="Verwijderen" className="h-8 w-8 rounded-full bg-sunken flex items-center justify-center text-muted hover:text-red-500 shrink-0"><Trash2 className="h-4 w-4" /></button>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-sunken flex items-center justify-center text-muted hover:text-ink shrink-0" aria-label="Sluiten"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className={`text-xs px-1 ${overdue ? 'text-cross' : 'text-muted'}`}>
            {since == null ? 'Nog geen contact gelogd' : `Laatste contact: ${since} dag(en) geleden`}
            {overdue && ' — tijd om bij te praten'}
          </div>

          {/* Contact info */}
          {(person.emails.length > 0 || person.phones.length > 0 || person.company || person.jobTitle) && (
            <div className="rounded-2xl bg-surface border border-line overflow-hidden">
              {person.company && <InfoRow label="Bedrijf" icon={Building2}>{person.company}</InfoRow>}
              {person.jobTitle && <InfoRow label="Functie" icon={Briefcase}>{person.jobTitle}</InfoRow>}
              {person.emails.map((e) => (
                <InfoRow key={e} label="E-mail" icon={Mail}><a href={`mailto:${e}`} className="text-parkingyou-deep underline underline-offset-2">{e}</a></InfoRow>
              ))}
              {person.phones.map((ph) => (
                <InfoRow key={ph} label="Telefoon" icon={Phone}><a href={`tel:${ph}`} className="text-parkingyou-deep underline underline-offset-2">{ph}</a></InfoRow>
              ))}
            </div>
          )}

          {/* Socials */}
          {(person.instagramUrl || person.linkedinUrl || person.twitterUrl || person.websiteUrl) && (
            <div>
              <div className="font-semibold text-sm mb-2">Social &amp; links</div>
              <div className="rounded-2xl bg-surface border border-line overflow-hidden">
                {person.instagramUrl && <SocialRow icon={Instagram} label="Instagram" url={person.instagramUrl} />}
                {person.linkedinUrl && <SocialRow icon={Linkedin} label="LinkedIn" url={person.linkedinUrl} />}
                {person.twitterUrl && <SocialRow icon={Twitter} label="X / Twitter" url={person.twitterUrl} />}
                {person.websiteUrl && <SocialRow icon={Globe} label="Website" url={person.websiteUrl} />}
              </div>
            </div>
          )}

          <button
            onClick={() => logInteraction({ personId: person.id, channel: 'call', direction: 'out', summary: null, owedReply: false, occurredAt: new Date().toISOString() })}
            className="w-full py-2.5 rounded-xl bg-forest/10 text-forest text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-forest/15 transition-colors"
          >
            <CheckCircle2 className="h-4 w-4" /> Contact gelogd
          </button>

          {/* Quick note */}
          <div>
            <div className="font-semibold text-sm mb-2 flex items-center gap-1.5"><StickyNote className="h-4 w-4 text-muted" /> Snelle notitie</div>
            <div className="flex gap-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitNote() }}
                placeholder="Waar spraken jullie over…"
                className="flex-1 text-sm bg-sunken rounded-xl px-3 py-2 outline-none border border-line focus:border-forest transition-colors"
              />
              <button onClick={submitNote} disabled={!note.trim()} className="px-3 rounded-xl bg-forest text-white text-sm font-semibold disabled:opacity-40 shrink-0">Toevoegen</button>
            </div>
          </div>

          {/* Timeline */}
          {timeline.length > 0 && (
            <div>
              <div className="font-semibold text-sm mb-2">Recent contact</div>
              <div className="space-y-1.5">
                {timeline.map((i) => (
                  <div key={i.id} className="rounded-xl bg-surface border border-line px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase text-faint">{CHANNEL_LABEL[i.channel] ?? i.channel}</span>
                      <span className="text-[11px] text-faint ml-auto">{fmtDate(i.occurredAt.slice(0, 10))}</span>
                    </div>
                    {i.summary && <div className="text-sm text-ink-soft mt-0.5">{i.summary}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Connections */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-sm flex items-center gap-1.5"><Link2 className="h-4 w-4 text-muted" /> Connecties</div>
              <button onClick={() => setAddingConnection((v) => !v)} className="text-xs text-forest font-medium flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Connectie</button>
            </div>

            {addingConnection && (
              <div className="rounded-2xl bg-surface border border-line p-3 mb-2 space-y-2">
                <select value={connOtherId} onChange={(e) => setConnOtherId(e.target.value)} className="w-full text-sm bg-sunken rounded-xl px-3 py-2 outline-none border border-line focus:border-forest">
                  <option value="">Kies een contact…</option>
                  {connectableOthers.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
                </select>
                <input
                  list="connection-label-presets"
                  value={connLabel}
                  onChange={(e) => setConnLabel(e.target.value)}
                  placeholder="Relatie (bv. Collega van)"
                  className="w-full text-sm bg-sunken rounded-xl px-3 py-2 outline-none border border-line focus:border-forest"
                />
                <datalist id="connection-label-presets">
                  {CONNECTION_LABEL_PRESETS.map((l) => <option key={l} value={l} />)}
                </datalist>
                <input
                  value={connNote}
                  onChange={(e) => setConnNote(e.target.value)}
                  placeholder="Notitie (optioneel)"
                  className="w-full text-sm bg-sunken rounded-xl px-3 py-2 outline-none border border-line focus:border-forest"
                />
                <button onClick={submitConnection} disabled={!connOtherId} className="w-full py-2 rounded-xl bg-forest text-white text-sm font-semibold disabled:opacity-40">Koppelen</button>
              </div>
            )}

            {connections.length === 0 ? (
              <div className="text-sm text-faint italic py-3 text-center border border-dashed border-line rounded-xl">Nog geen connecties gekoppeld.</div>
            ) : (
              <div className="space-y-1.5">
                {connections.map(({ connection, other }) => (
                  <div key={connection.id} className="rounded-xl bg-surface border border-line px-3 py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{other.displayName}</div>
                      <div className="text-xs text-faint truncate">{connection.label}{connection.note ? ` — ${connection.note}` : ''}</div>
                    </div>
                    <button onClick={() => deletePersonConnection(connection.id)} className="p-1.5 rounded-lg hover:bg-sunken text-faint hover:text-red-500 shrink-0"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {person.notes && (
            <div>
              <div className="font-semibold text-sm mb-2">Notities</div>
              <div className="rounded-2xl bg-surface border border-line px-4 py-3 text-sm text-ink-soft whitespace-pre-wrap">{person.notes}</div>
            </div>
          )}
        </div>
      </SheetShell>

      {editing && <PersonForm person={person} onClose={() => setEditing(false)} />}
      {confirmDel && (
        <ConfirmDialog
          title={`Contact “${person.displayName}” verwijderen?`}
          message="Gekoppelde connecties en contactmomenten worden ook verwijderd."
          onCancel={() => setConfirmDel(false)}
          onConfirm={() => { deletePerson(person.id); onClose() }}
        />
      )}
    </>
  )
}

function InfoRow({ label, icon: Icon, children }: { label: string; icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-line last:border-0 gap-3">
      <span className="text-sm text-muted flex items-center gap-1.5 shrink-0">{Icon && <Icon className="h-3.5 w-3.5" />}{label}</span>
      <span className="text-sm font-medium text-right truncate">{children}</span>
    </div>
  )
}
