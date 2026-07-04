import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { TODAY, fmtDate } from '../domains'
import { SectionTitle, Empty } from '../components/ui'
import { Mail, MailOpen, CheckCheck, ExternalLink } from 'lucide-react'
import type { EmailItem } from '../types'
import { classifyImportance, emailTags, ALL_EMAIL_TAGS } from '../lib/crm/emailClassify'
import { usePersistedState } from '../lib/usePersistedState'

// ── helpers ──────────────────────────────────────────────────────────────────

function extractName(addr: string): string {
  if (!addr) return '(onbekend)'
  const m = addr.match(/^([^<]+?)\s*<.*>$/)
  if (m) return m[1].replace(/(^"|"$)/g, '').trim()
  const at = addr.indexOf('@')
  if (at !== -1) return addr.slice(0, at)
  return addr
}

function impColor(imp: string | null | undefined): string {
  switch (imp) {
    case 'high': return '#C58392'  // red
    case 'med':  return '#C6A05B'  // orange
    case 'low':  return '#8C9080'  // muted
    default:     return '#6FA07C'  // forest (important fallback)
  }
}

function resolveImportance(e: EmailItem): 'high' | 'med' | 'low' | null {
  // The synced `importance` is unreliable (flags social/newsletters high), so
  // classify locally from sender + subject instead.
  return classifyImportance(e)
}

function when(iso: string) {
  const date = iso.slice(0, 10)
  if (date === TODAY) return iso.slice(11, 16)
  return fmtDate(date)
}

// ── types ─────────────────────────────────────────────────────────────────────

type Filter = 'all' | 'high' | 'med' | 'low'

const FILTER_LABEL: Record<Filter, string> = {
  all:  'Alles',
  high: 'Belangrijk',
  med:  'Misschien',
  low:  'Ruis',
}

interface ThreadGroup {
  row: EmailItem
  count: number
}

// ── component ─────────────────────────────────────────────────────────────────

export default function Inbox() {
  const { emails, markEmailRead, markAllEmailsRead, dataSource } = useStore()
  const [filter, setFilter] = usePersistedState<Filter>('oslife.inbox.importance', 'high')
  // null = all domains; otherwise a tag key ('prjct' | 'parkingyou' | …)
  const [domain, setDomain] = usePersistedState<string | null>('oslife.inbox.domain', null)
  // Optimistic local read-hide: IDs marked read disappear immediately
  const [readIds, setReadIds] = useState<Set<string>>(new Set())

  const visible = useMemo(
    () => emails.filter((e) => !readIds.has(e.id)),
    [emails, readIds],
  )

  // Domain-scoped set drives both the importance counts and the list, so the
  // "Belangrijk 12" counts reflect the domain you've drilled into.
  const scoped = useMemo(
    () => (domain ? visible.filter((e) => emailTags(e).some((t) => t.key === domain)) : visible),
    [visible, domain],
  )

  const filtered = useMemo(
    () =>
      filter === 'all'
        ? scoped
        : scoped.filter((e) => resolveImportance(e) === filter),
    [scoped, filter],
  )

  // Group by threadId (newest row wins, count how many share the thread)
  const grouped = useMemo<ThreadGroup[]>(() => {
    const map = new Map<string, ThreadGroup>()
    const sorted = [...filtered].sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1))
    for (const e of sorted) {
      const key = e.threadId ?? e.id
      const cur = map.get(key)
      if (!cur) map.set(key, { row: e, count: 1 })
      else cur.count++
    }
    return [...map.values()]
  }, [filtered])

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: scoped.length, high: 0, med: 0, low: 0 }
    for (const e of scoped) {
      const imp = resolveImportance(e)
      if (imp === 'high' || imp === 'med' || imp === 'low') c[imp]++
    }
    return c
  }, [scoped])

  // Per-domain counts (across everything visible, ignoring the active domain
  // pick) so the domain chips always show the full picture.
  const domainCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const e of visible) for (const t of emailTags(e)) c[t.key] = (c[t.key] ?? 0) + 1
    return c
  }, [visible])

  const totalUnread = visible.filter((e) => e.unread).length

  function doMarkRead(e: EmailItem) {
    setReadIds((prev) => new Set([...prev, e.id]))
    markEmailRead(e.id)
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Mail className="h-5 w-5 text-personal" /> Inbox
          </h1>
          <p className="text-sm text-muted mt-1">
            De mails die er nu toe doen, uit je Gmail.{' '}
            {totalUnread > 0 ? `${totalUnread} ongelezen.` : 'Alles gelezen.'}
          </p>
        </div>
        {totalUnread > 0 && (
          <button className="btn-ghost" onClick={markAllEmailsRead}>
            <CheckCheck className="h-4 w-4" /> Alles gelezen
          </button>
        )}
      </div>

      {/* Importance filter */}
      <div className="flex gap-1.5 flex-wrap">
        {(['high', 'med', 'low', 'all'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`chip ${filter === f ? 'bg-forest text-white' : 'bg-surface border border-line text-muted hover:text-ink'}`}
          >
            {counts[f] > 0
              ? `${FILTER_LABEL[f]} ${counts[f]}`
              : FILTER_LABEL[f]}
          </button>
        ))}
      </div>

      {/* Domain filter — tap an area to scope the list (tap again to clear) */}
      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => setDomain(null)}
          className={`chip ${domain === null ? 'bg-ink text-surface' : 'bg-surface border border-line text-muted hover:text-ink'}`}
        >
          Alle domeinen
        </button>
        {ALL_EMAIL_TAGS.filter((t) => (domainCounts[t.key] ?? 0) > 0).map((t) => {
          const active = domain === t.key
          return (
            <button
              key={t.key}
              onClick={() => setDomain(active ? null : t.key)}
              className="chip font-semibold border"
              style={
                active
                  ? { background: t.hex, color: '#fff', borderColor: t.hex }
                  : { color: t.hex, background: `${t.hex}18`, borderColor: `${t.hex}44` }
              }
            >
              {t.label} {domainCounts[t.key]}
            </button>
          )
        })}
      </div>

      {grouped.length === 0 ? (
        <Empty>Geen mails in dit filter.</Empty>
      ) : (
        <div className="space-y-2">
          {grouped.map(({ row: e, count }) => {
            const imp = resolveImportance(e)
            const color = impColor(imp)
            const name = extractName(e.from)
            const tags = emailTags(e)
            return (
              <div
                key={e.threadId ?? e.id}
                className={`card w-full p-4 flex items-start gap-3 ${e.unread ? 'border-personal/30' : ''}`}
              >
                {/* Importance dot */}
                <span
                  className="mt-1 h-2 w-2 rounded-full shrink-0"
                  style={{ background: color }}
                />

                {/* Content */}
                <button
                  onClick={() => doMarkRead(e)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-sm truncate ${e.unread ? 'text-ink font-semibold' : 'text-ink-soft'}`}>
                      {name}
                    </span>
                    {tags.map((t) => (
                      <span
                        key={t.key}
                        role="button"
                        tabIndex={0}
                        onClick={(ev) => { ev.stopPropagation(); setDomain((d) => (d === t.key ? null : t.key)) }}
                        onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.stopPropagation(); setDomain((d) => (d === t.key ? null : t.key)) } }}
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 cursor-pointer hover:opacity-80"
                        style={{ color: t.hex, background: `${t.hex}22` }}
                        title={`Filter op ${t.label}`}
                      >
                        {t.label}
                      </span>
                    ))}
                    {count > 1 && (
                      <span className="text-[11px] font-bold text-ink-soft bg-sunken rounded-full px-1.5 py-0.5 shrink-0">
                        {count}
                      </span>
                    )}
                    <span className="text-[11px] text-faint ml-auto shrink-0">{when(e.receivedAt)}</span>
                  </div>
                  <div className={`text-sm mt-0.5 truncate ${e.unread ? 'text-ink' : 'text-muted'}`}>
                    {e.subject}
                  </div>
                  <div className="text-[12px] text-faint mt-0.5 line-clamp-2">{e.snippet}</div>
                </button>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0 mt-0.5">
                  {e.unread && (
                    <button
                      onClick={() => doMarkRead(e)}
                      className="h-7 w-7 rounded-lg bg-buurtkaart/10 flex items-center justify-center hover:bg-buurtkaart/20 transition-colors"
                      aria-label="Markeer als gelezen"
                      title="Markeer als gelezen"
                    >
                      <MailOpen className="h-3.5 w-3.5 text-buurtkaart-deep" />
                    </button>
                  )}
                  {e.threadId && (
                    <a
                      href={`https://mail.google.com/mail/u/0/#inbox/${e.threadId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(ev) => ev.stopPropagation()}
                      className="h-7 w-7 rounded-lg bg-parkingyou/10 flex items-center justify-center hover:bg-parkingyou/20 transition-colors"
                      aria-label="Open in Gmail"
                      title="Open in Gmail"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-parkingyou-deep" />
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <SectionTitle
        hint={
          dataSource === 'live'
            ? 'Automatisch gesynct vanuit Gmail (elke ~15 min). Als gelezen markeren werkt terug naar Gmail.'
            : 'Voorbeeldweergave met demo-data — nog niet verbonden met Gmail.'
        }
      >
        {dataSource === 'live' ? 'Live uit Gmail' : 'Voorbeeld-inbox'}
      </SectionTitle>
    </div>
  )
}
