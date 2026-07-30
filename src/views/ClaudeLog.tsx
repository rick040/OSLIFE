import { useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { SectionTitle, Empty } from '../components/ui'
import { BraindumpCard, BraindumpDetail } from '../components/BraindumpCard'
import { parseClaudeExport, isClaudeConversationEntry } from '../lib/claudeImport'
import type { BraindumpEntry } from '../types'
import { Bot, Search, Sparkles, Upload, Loader2, X } from 'lucide-react'

export default function ClaudeLog() {
  const {
    braindumpEntries, deleteBraindumpEntry, retryBraindumpEntry, updateBraindumpEntry,
    braindumpLinks, linkBraindumpEntry, unlinkBraindumpEntry, threads, wikiEntries,
    importClaudeConversations,
  } = useStore()

  const [open, setOpen] = useState<BraindumpEntry | null>(null)
  const [q, setQ] = useState('')

  // Bulk import from a claude.ai data export — moved here from Braindump since
  // it's the same content (a Claude conversation), just a historical batch
  // instead of a live one-shot recap.
  const fileRef = useRef<HTMLInputElement>(null)
  const [showImport, setShowImport] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
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

  const claudeEntries = useMemo(
    () => braindumpEntries.filter(isClaudeConversationEntry),
    [braindumpEntries],
  )

  const allTags = useMemo(() => {
    const set = new Set<string>()
    claudeEntries.forEach((e) => e.tags.forEach((t) => set.add(t)))
    return [...set].sort()
  }, [claudeEntries])

  const taskOptions = useMemo(
    () => threads.filter((t) => t.status === 'open').map((t) => ({ id: t.id, title: t.title })),
    [threads],
  )
  const wikiOptions = useMemo(() => wikiEntries.map((w) => ({ id: w.id, title: w.title })), [wikiEntries])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return claudeEntries
    return claudeEntries.filter((e) => {
      const hay = [e.title, e.summary, e.markdown, e.tags.join(' '), e.sourceUrl].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(needle)
    })
  }, [claudeEntries, q])

  const openLive = open ? claudeEntries.find((e) => e.id === open.id) ?? open : null

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-7">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sunken">
            <Bot className="h-5 w-5 text-ink-soft" />
          </span>
          <div>
            <h1 className="text-xl font-medium text-ink">Claude</h1>
            <p className="text-xs text-faint">Gesprekken met Claude, live gelogd of geïmporteerd</p>
          </div>
        </div>
        <button className="btn-ghost" onClick={() => setShowImport(true)}>
          <Sparkles className="h-4 w-4" /> Importeer Claude-chats
        </button>
      </div>

      {showImport && (
        <div className="card p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-prjct" /> Importeer je Claude-chats
            </p>
            <button onClick={() => setShowImport(false)} className="text-faint hover:text-ink p-1 shrink-0" aria-label="Sluiten">
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
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Zoek in je Claude-gesprekken…"
          className="w-full rounded-xl bg-surface border border-line pl-9 pr-3 py-2.5 text-sm outline-none focus:border-buurtkaart/50"
        />
      </div>

      <div>
        <SectionTitle>{filtered.length} gesprek(ken)</SectionTitle>
        {filtered.length ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {filtered.map((e) => (
              <BraindumpCard key={e.id} entry={e} onOpen={() => setOpen(e)} />
            ))}
          </div>
        ) : (
          <Empty>
            {claudeEntries.length
              ? 'Niks gevonden met deze zoekterm.'
              : 'Nog geen Claude-gesprekken — vraag Claude om iets voor je te onthouden, of importeer je export.'}
          </Empty>
        )}
      </div>

      {openLive && (
        <BraindumpDetail
          entry={openLive}
          onClose={() => setOpen(null)}
          onDelete={deleteBraindumpEntry}
          onRetry={retryBraindumpEntry}
          onUpdate={updateBraindumpEntry}
          allTags={allTags}
          links={braindumpLinks.filter((l) => l.braindumpEntryId === openLive.id)}
          taskOptions={taskOptions}
          wikiOptions={wikiOptions}
          onLink={linkBraindumpEntry}
          onUnlink={unlinkBraindumpEntry}
        />
      )}
    </div>
  )
}
