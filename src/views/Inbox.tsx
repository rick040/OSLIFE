import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { TODAY, fmtDate } from '../domains'
import { SectionTitle, Empty } from '../components/ui'
import {
  Mail, MailOpen, CheckCheck, ExternalLink, ChevronDown, ChevronRight,
  Sparkles, CalendarClock, Reply, Loader2,
} from 'lucide-react'
import type { EmailItem, EmailReminder } from '../types'
import { classifyImportance, emailTags, ALL_EMAIL_TAGS } from '../lib/crm/emailClassify'
import { usePersistedState } from '../lib/usePersistedState'
import { summarizeEmail, draftEmailReply, saveGmailDraft } from '../lib/supabase'

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

function resolveImportance(e: EmailItem): 'high' | 'med' | 'low' {
  // The synced `importance` is unreliable (flags social/newsletters high), so
  // classify locally from sender + subject instead.
  return classifyImportance(e)
}

function when(iso: string) {
  const date = iso.slice(0, 10)
  if (date === TODAY) return iso.slice(11, 16)
  return fmtDate(date)
}

interface ThreadGroup {
  row: EmailItem
  count: number
}

/** Group already-sorted (newest-first) emails by thread, newest row wins each group. */
function groupByThread(sorted: EmailItem[]): ThreadGroup[] {
  const map = new Map<string, ThreadGroup>()
  for (const e of sorted) {
    const key = e.threadId ?? e.id
    const cur = map.get(key)
    if (!cur) map.set(key, { row: e, count: 1 })
    else cur.count++
  }
  return [...map.values()]
}

// ── Highlights panel ─────────────────────────────────────────────────────────
// Pulled purely from already-loaded "Belangrijk" emails that have an AI
// summary — no extra fetch. Bullets link back to their source email.

interface Highlight {
  text: string
  date?: string | null
  email: EmailItem
}

function buildHighlights(emails: EmailItem[]) {
  const important = emails.filter((e) => resolveImportance(e) === 'high' && e.aiSummarizedAt)
  const takeaways: Highlight[] = []
  const reminders: Highlight[] = []
  for (const e of important) {
    for (const t of e.aiTakeaways ?? []) takeaways.push({ text: t, email: e })
    for (const r of e.aiReminders ?? []) reminders.push({ text: r.text, date: r.date, email: e })
  }
  reminders.sort((a, b) => {
    if (a.date && b.date) return a.date < b.date ? -1 : 1
    if (a.date) return -1
    if (b.date) return 1
    return 0
  })
  return { takeaways: takeaways.slice(0, 6), reminders: reminders.slice(0, 6) }
}

function HighlightsPanel({ emails, onFocus }: { emails: EmailItem[]; onFocus: (id: string) => void }) {
  const [open, setOpen] = usePersistedState('oslife.inbox.highlightsOpen', true)
  const { takeaways, reminders } = useMemo(() => buildHighlights(emails), [emails])
  if (takeaways.length === 0 && reminders.length === 0) return null

  return (
    <div className="card p-4">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 w-full text-left">
        {open ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronRight className="h-4 w-4 text-muted" />}
        <Sparkles className="h-4 w-4 text-ink-soft" />
        <span className="text-sm font-semibold">Overzicht</span>
        <span className="text-xs text-faint ml-auto">{takeaways.length + reminders.length} punten</span>
      </button>
      {open && (
        <div className="mt-3 grid sm:grid-cols-2 gap-4">
          {takeaways.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">Kernpunten</div>
              <ul className="space-y-1.5">
                {takeaways.map((h, i) => (
                  <li key={i}>
                    <button onClick={() => onFocus(h.email.id)} className="text-left w-full">
                      <span className="text-sm text-ink-soft"><span className="text-faint mr-1">•</span>{h.text}</span>
                      <span className="block text-[11px] text-faint">{extractName(h.email.from)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {reminders.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">Reminders &amp; taken</div>
              <ul className="space-y-1.5">
                {reminders.map((h, i) => (
                  <li key={i}>
                    <button onClick={() => onFocus(h.email.id)} className="text-left w-full flex items-start gap-1.5">
                      <CalendarClock className="h-3.5 w-3.5 text-ink-soft mt-0.5 shrink-0" />
                      <span>
                        <span className="text-sm text-ink-soft">
                          {h.text}{h.date && <span className="text-[11px] text-faint ml-1">({fmtDate(h.date)})</span>}
                        </span>
                        <span className="block text-[11px] text-faint">
                          {extractName(h.email.from)} <span className="text-faint">· staat in Taken</span>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Collapsed accordion (Misschien / Ruis) ───────────────────────────────────

function CollapsedGroup({
  label, count, open, onToggle, children,
}: {
  label: string
  count: number
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  if (count === 0) return null
  return (
    <div>
      <button onClick={onToggle} className="flex items-center gap-1.5 text-sm text-muted hover:text-ink w-full py-1.5">
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <span>{label} {count}</span>
      </button>
      {open && <div className="space-y-1.5 mt-1 mb-2">{children}</div>}
    </div>
  )
}

// ── Row (+ inline detail expansion) ──────────────────────────────────────────

function EmailRow({
  e, count, dense, expanded, onToggleExpand, onMarkRead, onDomainClick, applyEmailSummary, addTasksFromEmailReminders,
}: {
  e: EmailItem
  count: number
  dense?: boolean
  expanded: boolean
  onToggleExpand: () => void
  onMarkRead: () => void
  onDomainClick: (key: string) => void
  applyEmailSummary: (id: string, patch: Partial<EmailItem>) => void
  addTasksFromEmailReminders: (email: EmailItem, reminders: EmailReminder[]) => void
}) {
  const [summarizing, setSummarizing] = useState(false)
  const [showDraft, setShowDraft] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [draftText, setDraftText] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const imp = resolveImportance(e)
  const color = impColor(imp)
  const name = extractName(e.from)
  const tags = emailTags(e)

  // On-demand summarization the first time a not-yet-summarized email opens.
  useEffect(() => {
    if (!expanded || e.aiSummarizedAt || summarizing) return
    let cancelled = false
    setSummarizing(true)
    summarizeEmail(e.id).then((result) => {
      if (cancelled) return
      setSummarizing(false)
      if (result) {
        applyEmailSummary(e.id, {
          aiSummary: result.summary,
          aiTakeaways: result.takeaways,
          aiReminders: result.reminders,
          aiSummarizedAt: new Date().toISOString(),
        })
        if (result.reminders.length > 0) addTasksFromEmailReminders(e, result.reminders)
      }
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, e.id, e.aiSummarizedAt])

  async function startDraft() {
    setShowDraft(true)
    setSaveMsg(null)
    if (draftText) return
    setDrafting(true)
    const draft = await draftEmailReply(e.id)
    setDrafting(false)
    setDraftText(draft ?? '')
  }

  async function saveDraft() {
    setSaving(true)
    setSaveMsg(null)
    const res = await saveGmailDraft(e.id, draftText)
    setSaving(false)
    setSaveMsg(res.ok ? { ok: true, text: 'Concept opgeslagen in Gmail.' } : { ok: false, text: `Mislukt: ${res.error}` })
  }

  return (
    <div className={`card w-full ${dense ? 'p-3' : 'p-4'}`}>
      <div className="flex items-start gap-3">
        <span className="mt-1 h-2 w-2 rounded-full shrink-0" style={{ background: color }} />

        <button onClick={onToggleExpand} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className={`text-sm truncate ${e.unread ? 'text-ink font-semibold' : 'text-ink-soft'}`}>
              {name}
            </span>
            {tags.map((t) => (
              <span
                key={t.key}
                role="button"
                tabIndex={0}
                onClick={(ev) => { ev.stopPropagation(); onDomainClick(t.key) }}
                onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.stopPropagation(); onDomainClick(t.key) } }}
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
          {!dense && (
            <div className="text-[12px] text-faint mt-0.5 line-clamp-2">{e.aiSummary ?? e.snippet}</div>
          )}
        </button>

        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          {e.unread && (
            <button
              onClick={(ev) => { ev.stopPropagation(); onMarkRead() }}
              className="h-7 w-7 rounded-lg bg-sunken flex items-center justify-center hover:bg-surface transition-colors"
              aria-label="Markeer als gelezen"
              title="Markeer als gelezen"
            >
              <MailOpen className="h-3.5 w-3.5 text-ink-soft" />
            </button>
          )}
          <a
            href={`https://mail.google.com/mail/u/0/#inbox/${e.threadId ?? e.id}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(ev) => ev.stopPropagation()}
            className="h-7 w-7 rounded-lg bg-sunken flex items-center justify-center hover:bg-surface transition-colors"
            aria-label="Open in Gmail"
            title="Open in Gmail"
          >
            <ExternalLink className="h-3.5 w-3.5 text-ink-soft" />
          </a>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-line space-y-3">
          {summarizing ? (
            <div className="flex items-center gap-2 text-xs text-faint">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Samenvatting maken…
            </div>
          ) : e.aiSummary ? (
            <div className="rounded-xl bg-sunken p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
                <Sparkles className="h-3.5 w-3.5" /> AI-samenvatting
              </div>
              <p className="text-sm text-ink-soft">{e.aiSummary}</p>
              {(e.aiTakeaways?.length ?? 0) > 0 && (
                <ul className="text-sm text-ink-soft space-y-0.5 list-disc list-inside">
                  {e.aiTakeaways!.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              )}
              {(e.aiReminders?.length ?? 0) > 0 && (
                <ul className="text-sm space-y-0.5">
                  {e.aiReminders!.map((r, i) => (
                    <li key={i} className="flex items-center gap-1.5 text-ink-soft">
                      <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        {r.text}{r.date ? ` — ${fmtDate(r.date)}` : ''}
                        <span className="text-[11px] text-faint ml-1.5">· staat in Taken</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          <div className="text-sm text-ink-soft whitespace-pre-wrap max-h-64 overflow-y-auto">
            {e.body || e.snippet}
          </div>

          {!showDraft ? (
            <button onClick={startDraft} className="btn-ghost text-xs">
              <Reply className="h-3.5 w-3.5" /> Concept antwoord
            </button>
          ) : (
            <div className="space-y-2">
              {drafting ? (
                <div className="flex items-center gap-2 text-xs text-faint">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Concept schrijven…
                </div>
              ) : (
                <textarea
                  value={draftText}
                  onChange={(ev) => setDraftText(ev.target.value)}
                  rows={5}
                  className="input w-full text-sm resize-y"
                />
              )}
              <div className="flex items-center gap-2">
                <button onClick={saveDraft} disabled={saving || drafting || !draftText} className="btn-primary text-xs">
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Opslaan als concept in Gmail
                </button>
                <button onClick={() => { setShowDraft(false); setSaveMsg(null) }} className="btn-ghost text-xs">
                  Annuleren
                </button>
              </div>
              {saveMsg && (
                <p className={`text-xs ${saveMsg.ok ? 'text-forest' : 'text-personal'}`}>{saveMsg.text}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── component ─────────────────────────────────────────────────────────────────

export default function Inbox() {
  const { emails, markEmailRead, markAllEmailsRead, dataSource, applyEmailSummary, addTasksFromEmailReminders } = useStore()
  // null = all domains; otherwise a tag key ('prjct' | 'parkingyou' | …)
  const [domain, setDomain] = usePersistedState<string | null>('oslife.inbox.domain', null)
  // Optimistic local read-hide: only the explicit "mark all read" / envelope
  // action hides a row — opening one to read it should NOT make it vanish.
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [medOpen, setMedOpen] = usePersistedState('oslife.inbox.medOpen', false)
  const [lowOpen, setLowOpen] = usePersistedState('oslife.inbox.lowOpen', false)

  const visible = useMemo(
    () => emails.filter((e) => !readIds.has(e.id)),
    [emails, readIds],
  )

  const scoped = useMemo(
    () => (domain ? visible.filter((e) => emailTags(e).some((t) => t.key === domain)) : visible),
    [visible, domain],
  )

  const byImportance = useMemo(() => {
    const sorted = [...scoped].sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1))
    return {
      high: groupByThread(sorted.filter((e) => resolveImportance(e) === 'high')),
      med: groupByThread(sorted.filter((e) => resolveImportance(e) === 'med')),
      low: groupByThread(sorted.filter((e) => resolveImportance(e) === 'low')),
    }
  }, [scoped])

  const domainCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const e of visible) for (const t of emailTags(e)) c[t.key] = (c[t.key] ?? 0) + 1
    return c
  }, [visible])

  const totalUnread = visible.filter((e) => e.unread).length

  function toggleExpand(e: EmailItem) {
    setExpandedId((cur) => (cur === e.id ? null : e.id))
    if (e.unread) markEmailRead(e.id)
  }

  function doMarkRead(e: EmailItem) {
    setReadIds((prev) => new Set([...prev, e.id]))
    markEmailRead(e.id)
  }

  return (
    <div className="flex flex-col gap-7 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sunken">
            <Mail className="h-5 w-5 text-ink-soft" />
          </span>
          <div>
            <h1 className="text-xl font-medium text-ink">Inbox</h1>
            <p className="text-sm text-muted mt-0.5">
              De mails die er nu toe doen, uit je Gmail.{' '}
              {totalUnread > 0 ? `${totalUnread} ongelezen.` : 'Alles gelezen.'}
            </p>
          </div>
        </div>
        {totalUnread > 0 && (
          <button className="btn-ghost" onClick={() => { setReadIds(new Set(emails.map((e) => e.id))); markAllEmailsRead() }}>
            <CheckCheck className="h-4 w-4" /> Alles gelezen
          </button>
        )}
      </div>

      <HighlightsPanel emails={visible} onFocus={setExpandedId} />

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

      {/* Belangrijk — always expanded, this is the main list */}
      <div className="space-y-2">
        <SectionTitle>Belangrijk {byImportance.high.length > 0 && `(${byImportance.high.length})`}</SectionTitle>
        {byImportance.high.length === 0 ? (
          <Empty>Geen belangrijke mails in dit filter.</Empty>
        ) : (
          byImportance.high.map(({ row: e, count }) => (
            <EmailRow
              key={e.threadId ?? e.id}
              e={e}
              count={count}
              expanded={expandedId === e.id}
              onToggleExpand={() => toggleExpand(e)}
              onMarkRead={() => doMarkRead(e)}
              onDomainClick={(key) => setDomain((d) => (d === key ? null : key))}
              applyEmailSummary={applyEmailSummary}
              addTasksFromEmailReminders={addTasksFromEmailReminders}
            />
          ))
        )}
      </div>

      {/* Misschien / Ruis — collapsed by default, subordinate to Belangrijk */}
      <div className="border-t border-line pt-1">
        <CollapsedGroup label="Misschien" count={byImportance.med.length} open={medOpen} onToggle={() => setMedOpen(!medOpen)}>
          {byImportance.med.map(({ row: e, count }) => (
            <EmailRow
              key={e.threadId ?? e.id}
              e={e}
              count={count}
              dense
              expanded={expandedId === e.id}
              onToggleExpand={() => toggleExpand(e)}
              onMarkRead={() => doMarkRead(e)}
              onDomainClick={(key) => setDomain((d) => (d === key ? null : key))}
              applyEmailSummary={applyEmailSummary}
              addTasksFromEmailReminders={addTasksFromEmailReminders}
            />
          ))}
        </CollapsedGroup>
        <CollapsedGroup label="Ruis" count={byImportance.low.length} open={lowOpen} onToggle={() => setLowOpen(!lowOpen)}>
          {byImportance.low.map(({ row: e, count }) => (
            <EmailRow
              key={e.threadId ?? e.id}
              e={e}
              count={count}
              dense
              expanded={expandedId === e.id}
              onToggleExpand={() => toggleExpand(e)}
              onMarkRead={() => doMarkRead(e)}
              onDomainClick={(key) => setDomain((d) => (d === key ? null : key))}
              applyEmailSummary={applyEmailSummary}
              addTasksFromEmailReminders={addTasksFromEmailReminders}
            />
          ))}
        </CollapsedGroup>
      </div>

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
