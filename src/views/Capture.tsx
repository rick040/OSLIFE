import { useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { SectionTitle, Empty, DomainChip, Overlay } from '../components/ui'
import { BraindumpCard, BraindumpDetail, SOURCE_LABEL } from '../components/BraindumpCard'
import { detectTextShare } from '../lib/braindump'
import { parseClaudeExport } from '../lib/claudeImport'
import type { BraindumpEntry, BraindumpSourceKind, Domain } from '../types'
import { Inbox, Search, Share2, Loader2, Upload, Sparkles, X } from 'lucide-react'

const DOMAINS: Domain[] = ['parkingyou', 'prjct', 'buurtkaart', 'personal', 'cross']

export default function Capture() {
  const { braindumpEntries, braindumpCapture, deleteBraindumpEntry, retryBraindumpEntry, importClaudeConversations } = useStore()
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState<BraindumpEntry | null>(null)

  // Claude-chat import (option 2): read a claude.ai data-export JSON client-side,
  // parse it, and store each conversation as searchable knowledge.
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file later
    if (!file) return
    setImporting(true)
    setImportMsg(null)
    try {
      const raw = JSON.parse(await file.text())
      const records = parseClaudeExport(raw)
      if (!records.length) {
        setImportMsg('Geen gesprekken gevonden — kies je conversations.json uit de Claude-export.')
        return
      }
      const { imported, skipped } = await importClaudeConversations(records)
      setImportMsg(
        imported
          ? `${imported} Claude-gesprek(ken) geïmporteerd${skipped ? `, ${skipped} al aanwezig overgeslagen` : ''}.`
          : `Niks nieuws — die ${skipped} gesprek(ken) waren al geïmporteerd.`,
      )
    } catch {
      setImportMsg('Kon dit bestand niet lezen. Verwacht: conversations.json uit je Claude-export.')
    } finally {
      setImporting(false)
    }
  }

  const [showClaudeImport, setShowClaudeImport] = useState(false)

  // filters
  const [q, setQ] = useState('')
  const [kindFilter, setKindFilter] = useState<BraindumpSourceKind | 'all'>('all')
  const [domainFilter, setDomainFilter] = useState<Domain | 'all'>('all')

  async function submit() {
    const clean = text.trim()
    if (!clean || saving) return
    setSaving(true)
    setText('')
    const { kind, url } = detectTextShare(clean)
    await braindumpCapture({ sourceKind: kind, text: kind === 'text' ? clean : null, sourceUrl: url })
    setSaving(false)
  }

  // kinds actually present, for the filter chip row
  const presentKinds = useMemo(() => {
    const set = new Set<BraindumpSourceKind>()
    braindumpEntries.forEach((e) => set.add(e.sourceKind))
    return [...set]
  }, [braindumpEntries])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return braindumpEntries.filter((e) => {
      if (kindFilter !== 'all' && e.sourceKind !== kindFilter) return false
      if (domainFilter !== 'all' && e.domain !== domainFilter) return false
      if (!needle) return true
      const hay = [e.title, e.summary, e.markdown, e.tags.join(' '), e.sourceUrl].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(needle)
    })
  }, [braindumpEntries, q, kindFilter, domainFilter])

  // keep the open modal in sync as realtime enrichment updates the row
  const openLive = open ? braindumpEntries.find((e) => e.id === open.id) ?? open : null

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-7">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sunken">
            <Inbox className="h-5 w-5 text-ink-soft" />
          </span>
          <h1 className="text-xl font-medium text-ink">Braindump</h1>
        </div>
        <button className="btn-ghost" onClick={() => setShowClaudeImport(true)}>
          <Sparkles className="h-4 w-4" /> Importeer Claude-chats
        </button>
      </div>

      {/* quick capture */}
      <div className="card p-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit() }}
          rows={3}
          placeholder="Wat er ook in je hoofd zit… (plak gerust een link)"
          className="w-full rounded-xl bg-surface border border-line px-4 py-3 text-sm outline-none focus:border-buurtkaart/50 resize-none"
        />
        <div className="flex items-center justify-between mt-3">
          <span className="text-[11px] text-faint flex items-center gap-1.5">
            <Share2 className="h-3.5 w-3.5" /> Of deel iets vanaf je telefoon naar “Braindump”.
          </span>
          <button className="btn-primary" onClick={submit} disabled={!text.trim() || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Opslaan
          </button>
        </div>
      </div>

      {showClaudeImport && (
        <Overlay tone="black" onClose={() => setShowClaudeImport(false)} panelClassName="card w-full max-w-md p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-prjct" /> Importeer je Claude-chats
            </p>
            <button onClick={() => setShowClaudeImport(false)} className="text-faint hover:text-ink p-1 shrink-0" aria-label="Sluiten">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-faint">
            Exporteer je data op claude.ai (Instellingen → Privacy) en kies hier <code>conversations.json</code>.
            HEYRA kan ze daarna doorzoeken en eruit antwoorden.
          </p>
          {importMsg && <p className="text-xs text-muted">{importMsg}</p>}
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onImportFile} />
          <button className="btn-ghost w-full" onClick={() => fileRef.current?.click()} disabled={importing}>
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Bestand kiezen
          </button>
        </Overlay>
      )}

      {/* filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Zoek in je braindumps…"
            className="w-full rounded-xl bg-surface border border-line pl-9 pr-3 py-2.5 text-sm outline-none focus:border-buurtkaart/50"
          />
        </div>

        {(presentKinds.length > 1 || domainFilter !== 'all') && (
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={kindFilter === 'all'} onClick={() => setKindFilter('all')}>Alles</FilterChip>
            {presentKinds.map((k) => (
              <FilterChip key={k} active={kindFilter === k} onClick={() => setKindFilter(k)}>
                {SOURCE_LABEL[k]}
              </FilterChip>
            ))}
            <span className="w-px bg-line mx-1 self-stretch" />
            {DOMAINS.filter((d) => braindumpEntries.some((e) => e.domain === d)).map((d) => (
              <button key={d} onClick={() => setDomainFilter(domainFilter === d ? 'all' : d)}
                className={`rounded-full transition-opacity ${domainFilter === d ? 'ring-2 ring-buurtkaart/50' : 'opacity-70 hover:opacity-100'}`}>
                <DomainChip domain={d} small />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* grid */}
      <div>
        <SectionTitle>{filtered.length} vastgelegd</SectionTitle>
        {filtered.length ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {filtered.map((e) => (
              <BraindumpCard key={e.id} entry={e} onOpen={() => setOpen(e)} />
            ))}
          </div>
        ) : (
          <Empty>
            {braindumpEntries.length ? 'Niks gevonden met deze filters.' : 'Nog niks vastgelegd — gooi je eerste gedachte of link erin.'}
          </Empty>
        )}
      </div>

      {openLive && (
        <BraindumpDetail
          entry={openLive}
          onClose={() => setOpen(null)}
          onDelete={deleteBraindumpEntry}
          onRetry={retryBraindumpEntry}
        />
      )}
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`chip text-xs ${active ? 'bg-buurtkaart/15 text-buurtkaart-deep border border-buurtkaart/40' : 'bg-sunken text-muted'}`}
    >
      {children}
    </button>
  )
}
