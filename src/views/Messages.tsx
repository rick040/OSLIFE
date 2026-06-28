import { useEffect, useMemo, useState } from 'react'
import type { Message, Channel } from '../types'
import { X, ChevronLeft, Mail, Zap, MessageSquare, Search } from 'lucide-react'

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
            <div className="flex items-center justify-between p-5 pb-3">
              <h1 className="text-lg font-semibold">Berichten</h1>
              <button onClick={onClose} className="btn-ghost !rounded-full !p-2" aria-label="Sluiten">
                <X className="h-4 w-4" />
              </button>
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
                        {c.projectName && (
                          <span className="inline-block text-[10px] font-semibold text-prjct-deep bg-prjct/12 px-1.5 py-0.5 rounded mt-1 max-w-full truncate">{c.projectName}</span>
                        )}
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
    </div>
  )
}

function Thread({ conv, onBack }: { conv: Conversation; onBack: () => void }) {
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
        {ordered.map((m) => (m.channel === 'whatsapp' ? <Bubble key={m.id} m={m} /> : <MailCard key={m.id} m={m} />))}
      </div>
    </>
  )
}

function Bubble({ m }: { m: Message }) {
  const out = m.direction === 'out'
  return (
    <div className={`max-w-[82%] ${out ? 'ml-auto' : ''}`}>
      <div
        className={`px-3 py-2 text-sm whitespace-pre-wrap break-words rounded-2xl ${
          out ? 'bg-forest text-white rounded-br-sm' : 'card rounded-bl-sm'
        }`}
      >
        {m.body || m.snippet}
      </div>
      <div className={`text-[10px] text-faint mt-1 ${out ? 'text-right' : ''}`}>{timeAgo(m.ts)}</div>
    </div>
  )
}

function MailCard({ m }: { m: Message }) {
  const meta = CH[m.channel]
  return (
    <div className="card p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: meta.hex, background: `${meta.hex}22` }}>{meta.label}</span>
        {m.direction === 'out' && <span className="text-[10px] text-faint">verzonden</span>}
      </div>
      {m.subject && <div className="text-sm font-semibold mb-1">{m.subject}</div>}
      <div className="text-[13px] text-muted leading-relaxed whitespace-pre-wrap">{m.body || m.snippet}</div>
      <div className="text-[11px] text-faint mt-2">{timeAgo(m.ts)}</div>
    </div>
  )
}
