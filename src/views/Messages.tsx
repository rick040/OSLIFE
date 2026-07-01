import { useEffect, useMemo, useState } from 'react'
import type { Message, Channel } from '../types'
import { X, ChevronLeft, Mail, Zap, MessageSquare, Search, Plus, Upload, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { TODAY } from '../domains'
import { Sheet, Field, TextInput, TextArea, SelectInput, PrimaryBtn } from '../components/crm'

const CH: Record<Channel, { label: string; hex: string; icon: typeof Mail }> = {
  email: { label: 'E-mail', hex: '#6E8CA8', icon: Mail },
  fiverr: { label: 'Fiverr', hex: '#9385B0', icon: Zap },
  whatsapp: { label: 'WhatsApp', hex: '#6FA07C', icon: MessageSquare },
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return 'nu'
  if (min < 60) return `${min}m`
  const h = Math.round(min / 60)
  if (h < 24) return `${h}u`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d`
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', timeZone: 'Europe/Amsterdam' })
}

interface Conversation {
  key: string
  contact: string
  projectName: string | null
  latest: Message
  channels: Set<Channel>
  count: number
  unread: number
  messages: Message[]
}

export default function Messages({
  messages,
  onClose,
  onReadConversation,
}: {
  messages: Message[]
  onClose: () => void
  onReadConversation: (contactKey: string) => void
}) {
  const [filter, setFilter] = useState<'all' | Channel>('all')
  const [query, setQuery] = useState('')
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [overlay, setOverlay] = useState<'none' | 'compose' | 'import'>('none')

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const conversations = useMemo(() => {
    const map = new Map<string, Conversation>()
    for (const m of messages) {
      let c = map.get(m.contactKey)
      if (!c) {
        c = { key: m.contactKey, contact: m.contact, projectName: m.projectName ?? null, latest: m, channels: new Set(), count: 0, unread: 0, messages: [] }
        map.set(m.contactKey, c)
      }
      c.count++
      if (m.unread) c.unread++
      c.channels.add(m.channel)
      c.messages.push(m)
      if (m.ts > c.latest.ts) {
        c.latest = m
        c.contact = m.contact
        if (m.projectName) c.projectName = m.projectName
      }
    }
    return [...map.values()].sort((a, b) => b.latest.ts.localeCompare(a.latest.ts))
  }, [messages])

  const counts = {
    all: conversations.length,
    email: conversations.filter((c) => c.channels.has('email')).length,
    fiverr: conversations.filter((c) => c.channels.has('fiverr')).length,
    whatsapp: conversations.filter((c) => c.channels.has('whatsapp')).length,
  }
  const totalUnread = conversations.reduce((s, c) => s + c.unread, 0)

  const q = query.trim().toLowerCase()
  const shown = conversations.filter((c) => {
    if (filter !== 'all' && !c.channels.has(filter)) return false
    if (!q) return true
    return (
      c.contact.toLowerCase().includes(q) ||
      (c.projectName ?? '').toLowerCase().includes(q) ||
      c.latest.snippet.toLowerCase().includes(q) ||
      (c.latest.subject ?? '').toLowerCase().includes(q)
    )
  })

  const openConv = openKey ? conversations.find((c) => c.key === openKey) ?? null : null

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <div className="absolute inset-0 bg-scrim/55 backdrop-blur-md" onClick={onClose} />

      <div className="relative mt-auto md:mt-0 md:m-auto w-full md:max-w-2xl h-[92dvh] md:h-[85dvh] flex flex-col bg-canvas md:rounded-4xl rounded-t-4xl border border-line shadow-pop overflow-hidden animate-fade-up">
        {openConv ? (
          <Thread conv={openConv} onBack={() => setOpenKey(null)} />
        ) : (
          <>
            <div className="flex items-center justify-between p-5 pb-3 gap-2">
              <h1 className="text-lg font-semibold">Berichten</h1>
              <div className="flex items-center gap-2">
                <button onClick={() => setOverlay('import')} className="chip bg-surface border border-line text-muted hover:text-ink" title="WhatsApp importeren">
                  <Upload className="h-3.5 w-3.5" /> WhatsApp
                </button>
                <button onClick={() => setOverlay('compose')} className="chip bg-forest text-white">
                  <Plus className="h-3.5 w-3.5" /> Bericht
                </button>
                <button onClick={onClose} className="btn-ghost !rounded-full !p-2" aria-label="Sluiten">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="px-5">
              <div className="flex items-center gap-2 bg-sunken rounded-xl px-3 py-2">
                <Search className="h-4 w-4 text-faint" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Zoek in berichten…"
                  className="flex-1 bg-transparent text-sm outline-none"
                />
              </div>
              <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1">
                {(['all', 'email', 'fiverr', 'whatsapp'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`chip whitespace-nowrap ${filter === f ? 'bg-forest text-white' : 'bg-surface border border-line text-muted'}`}
                  >
                    {f === 'all' ? `Alle · ${counts.all}` : `${CH[f].label} · ${counts[f]}`}
                  </button>
                ))}
              </div>
              {totalUnread > 0 && <div className="text-[11px] text-faint mt-2">{totalUnread} ongelezen</div>}
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2.5">
              {shown.length === 0 ? (
                <div className="text-center text-sm text-faint py-12">Geen berichten{filter !== 'all' ? ' in dit kanaal' : ''}.</div>
              ) : (
                shown.map((c) => {
                  const meta = CH[c.latest.channel]
                  const Icon = meta.icon
                  return (
                    <button
                      key={c.key}
                      onClick={() => {
                        setOpenKey(c.key)
                        onReadConversation(c.key)
                      }}
                      className="card p-3 w-full flex items-center gap-3 text-left hover:bg-sunken transition-colors"
                    >
                      <div className="relative shrink-0">
                        <span className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold" style={{ color: meta.hex, background: `${meta.hex}2e` }}>
                          {c.contact.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-surface flex items-center justify-center" style={{ background: meta.hex }}>
                          <Icon className="h-2 w-2 text-white" />
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-semibold truncate">{c.contact}</span>
                          <span className="text-[11px] text-faint shrink-0">{timeAgo(c.latest.ts)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {c.projectName && (
                            <span className="text-[10px] font-semibold text-prjct-deep bg-prjct/12 px-1.5 py-0.5 rounded max-w-[130px] truncate shrink-0">{c.projectName}</span>
                          )}
                          {c.channels.size > 1 && [...c.channels].map((ch) => (
                            <span
                              key={ch}
                              className="h-1.5 w-1.5 rounded-full shrink-0"
                              style={{ background: CH[ch].hex }}
                              title={CH[ch].label}
                            />
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className={`flex-1 min-w-0 text-xs truncate ${c.unread ? 'text-ink font-medium' : 'text-faint'}`}>
                            {c.latest.subject ? c.latest.subject : c.latest.snippet}
                          </span>
                          {c.count > 1 && <span className="text-[11px] text-faint shrink-0">{c.count}</span>}
                          {c.unread > 0 && <span className="h-2 w-2 rounded-full shrink-0" style={{ background: meta.hex }} />}
                        </div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </>
        )}
      </div>

      {overlay === 'compose' && <ComposeMessage onClose={() => setOverlay('none')} />}
      {overlay === 'import' && <ImportWhatsapp onClose={() => setOverlay('none')} />}
    </div>
  )
}

function Thread({ conv, onBack }: { conv: Conversation; onBack: () => void }) {
  const { deleteMessage } = useStore()
  const meta = CH[conv.latest.channel]
  const ordered = [...conv.messages].sort((a, b) => a.ts.localeCompare(b.ts))
  return (
    <>
      <div className="flex items-center gap-3 p-4 border-b border-line">
        <button onClick={onBack} className="text-forest" aria-label="Terug">
          <ChevronLeft className="h-6 w-6" />
        </button>
        <span className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0" style={{ color: meta.hex, background: `${meta.hex}2e` }}>
          {conv.contact.slice(0, 1).toUpperCase()}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{conv.contact}</div>
          <div className="text-[11px] text-faint">
            {conv.projectName && <span className="text-prjct-deep font-semibold">{conv.projectName} · </span>}
            {conv.count} berichten
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {ordered.map((m) => (m.channel === 'whatsapp'
          ? <Bubble key={m.id} m={m} onDelete={() => deleteMessage(m.id)} />
          : <MailCard key={m.id} m={m} onDelete={() => deleteMessage(m.id)} />))}
      </div>
    </>
  )
}

function Bubble({ m, onDelete }: { m: Message; onDelete: () => void }) {
  const out = m.direction === 'out'
  return (
    <div className={`max-w-[82%] group ${out ? 'ml-auto' : ''}`}>
      <div
        className={`px-3 py-2 text-sm whitespace-pre-wrap break-words rounded-2xl ${
          out ? 'bg-forest text-white rounded-br-sm' : 'card rounded-bl-sm'
        }`}
      >
        {m.body || m.snippet}
      </div>
      <div className={`flex items-center gap-2 text-[10px] text-faint mt-1 ${out ? 'justify-end' : ''}`}>
        {timeAgo(m.ts)}
        <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 hover:text-red-400"><Trash2 className="h-3 w-3" /></button>
      </div>
    </div>
  )
}

function MailCard({ m, onDelete }: { m: Message; onDelete: () => void }) {
  const meta = CH[m.channel]
  return (
    <div className="card p-3 group">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: meta.hex, background: `${meta.hex}22` }}>{meta.label}</span>
        {m.direction === 'out' && <span className="text-[10px] text-faint">verzonden</span>}
        <button onClick={onDelete} className="ml-auto text-faint opacity-0 group-hover:opacity-100 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      {m.subject && <div className="text-sm font-semibold mb-1">{m.subject}</div>}
      <div className="text-[13px] text-muted leading-relaxed whitespace-pre-wrap">{m.body || m.snippet}</div>
      <div className="text-[11px] text-faint mt-2">{timeAgo(m.ts)}</div>
    </div>
  )
}

// ── Compose a single message ────────────────────────────────────────────────
function ComposeMessage({ onClose }: { onClose: () => void }) {
  const { clients, projects, addMessage } = useStore()
  const [channel, setChannel] = useState<Channel>('email')
  const [direction, setDirection] = useState<'in' | 'out'>('in')
  const [clientId, setClientId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [contact, setContact] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  const clientProjects = projects.filter((p) => !clientId || p.clientId === clientId)

  function submit() {
    if (!body.trim() && !subject.trim()) return
    const client = clients.find((c) => c.id === clientId)
    const name = contact.trim() || client?.name || 'Onbekend'
    addMessage({
      contact: name,
      contactKey: clientId ? `cli:${clientId}` : `c:${name.toLowerCase().replace(/\s+/g, '-')}`,
      clientId: clientId || null,
      projectId: projectId || null,
      projectName: projects.find((p) => p.id === projectId)?.name ?? null,
      channel,
      direction,
      subject: subject.trim() || null,
      snippet: body.trim().slice(0, 140) || subject.trim(),
      body: body.trim() || null,
      ts: new Date().toISOString(),
      unread: false,
      source: 'manual',
    })
    onClose()
  }

  return (
    <Sheet title="Bericht toevoegen" onClose={onClose} footer={<PrimaryBtn onClick={submit} disabled={!body.trim() && !subject.trim()}>Toevoegen</PrimaryBtn>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Kanaal">
          <SelectInput value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
            <option value="email">E-mail</option><option value="fiverr">Fiverr</option><option value="whatsapp">WhatsApp</option>
          </SelectInput>
        </Field>
        <Field label="Richting">
          <SelectInput value={direction} onChange={(e) => setDirection(e.target.value as 'in' | 'out')}>
            <option value="in">Ontvangen</option><option value="out">Verzonden</option>
          </SelectInput>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Klant">
          <SelectInput value={clientId} onChange={(e) => { setClientId(e.target.value); setProjectId('') }}>
            <option value="">— geen —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </SelectInput>
        </Field>
        <Field label="Project">
          <SelectInput value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">— geen —</option>
            {clientProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </SelectInput>
        </Field>
      </div>
      <Field label="Contact" hint="leeg = klantnaam">
        <TextInput value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Naam van afzender" />
      </Field>
      {channel !== 'whatsapp' && (
        <Field label="Onderwerp"><TextInput value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
      )}
      <Field label="Bericht"><TextArea value={body} onChange={(e) => setBody(e.target.value)} rows={4} /></Field>
    </Sheet>
  )
}

// ── Import a WhatsApp export ─────────────────────────────────────────────────
function ImportWhatsapp({ onClose }: { onClose: () => void }) {
  const { clients, projects, importWhatsapp } = useStore()
  const [raw, setRaw] = useState('')
  const [meNames, setMeNames] = useState('Rick')
  const [clientId, setClientId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const clientProjects = projects.filter((p) => !clientId || p.clientId === clientId)

  async function run() {
    if (!raw.trim()) return
    setBusy(true)
    const r = await importWhatsapp(
      raw,
      meNames.split(',').map((s) => s.trim()).filter(Boolean),
      { clientId: clientId || null, projectId: projectId || null },
    )
    setBusy(false)
    setResult(`${r.imported} van ${r.total} bericht(en) geïmporteerd.`)
  }

  return (
    <Sheet
      title="WhatsApp importeren"
      onClose={onClose}
      footer={<PrimaryBtn onClick={result ? onClose : run} disabled={busy || (!raw.trim() && !result)}>{busy ? 'Bezig…' : result ? 'Klaar' : 'Importeren'}</PrimaryBtn>}
    >
      <p className="text-xs text-faint leading-relaxed">
        Open een WhatsApp-chat → ⋮ → <b>Meer</b> → <b>Chat exporteren</b> → <b>Zonder media</b>, en plak de tekst hieronder.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Koppel aan klant">
          <SelectInput value={clientId} onChange={(e) => { setClientId(e.target.value); setProjectId('') }}>
            <option value="">— geen —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </SelectInput>
        </Field>
        <Field label="Project">
          <SelectInput value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">— geen —</option>
            {clientProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </SelectInput>
        </Field>
      </div>
      <Field label="Jouw naam(en) in de chat" hint="komma-gescheiden — bepaalt welke berichten ‘verzonden’ zijn">
        <TextInput value={meNames} onChange={(e) => setMeNames(e.target.value)} placeholder="Rick, Rick Prjct" />
      </Field>
      <Field label="Geëxporteerde chat">
        <TextArea value={raw} onChange={(e) => setRaw(e.target.value)} rows={8} placeholder="[12/06/2026, 14:32] Klant: Hoi Rick!…" />
      </Field>
      {result && (
        <div className="text-sm rounded-xl px-3 py-2 flex items-center gap-2" style={{ background: '#6FA07C18' }}>
          <Upload className="h-4 w-4 text-forest" /> {result}
        </div>
      )}
    </Sheet>
  )
}
