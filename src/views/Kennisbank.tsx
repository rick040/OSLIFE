import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { fmtDate } from '../domains'
import { DomainChip, Empty, Overlay } from '../components/ui'
import { Markdown } from '../components/BraindumpCard'
import type { WikiEntry } from '../types'
import { CATEGORY_META, type LearningCategory } from '../heyra/learning'
import { BookOpen, Check, X, ExternalLink, Sparkles } from 'lucide-react'

function CategoryChip({ category }: { category: LearningCategory | null }) {
  if (!category) return null
  const meta = CATEGORY_META[category]
  return (
    <span className="chip text-[10px] shrink-0" style={{ background: `${meta.hex}22`, color: meta.hex }}>
      {meta.label}
    </span>
  )
}

function WikiSuggestionCard({ entry, onResolve }: {
  entry: WikiEntry
  onResolve: (id: string, decision: 'confirm' | 'reject') => void
}) {
  const [busy, setBusy] = useState(false)
  const resolve = (decision: 'confirm' | 'reject') => {
    setBusy(true)
    onResolve(entry.id, decision)
  }
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-3.5 w-3.5 text-faint shrink-0" />
          <span className="text-sm font-medium text-ink truncate">{entry.title}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <CategoryChip category={entry.category} />
          {entry.domain && <DomainChip domain={entry.domain} small />}
        </div>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-wider text-faint mb-0.5">Kernpunt</p>
        <p className="text-sm text-ink-soft">{entry.takeaway}</p>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-faint mb-0.5">Toepassing</p>
        <p className="text-sm text-ink-soft">{entry.application}</p>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          disabled={busy}
          onClick={() => resolve('confirm')}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-forest/10 text-forest border border-forest-hi/40 py-2 text-sm font-medium hover:bg-forest/15 disabled:opacity-50"
        >
          <Check className="h-4 w-4" /> Naar kennisbank
        </button>
        <button
          disabled={busy}
          onClick={() => resolve('reject')}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-line/60 text-muted border border-line py-2 text-sm font-medium hover:bg-line disabled:opacity-50"
        >
          <X className="h-4 w-4" /> Negeren
        </button>
      </div>
    </div>
  )
}

function WikiCard({ entry, onOpen }: { entry: WikiEntry; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="card p-3 text-left flex flex-col gap-1.5 hover:border-buurtkaart/40 transition-colors"
    >
      <div className="flex items-center gap-1.5">
        <CategoryChip category={entry.category} />
        {entry.domain && <DomainChip domain={entry.domain} small />}
        <span className="text-[11px] text-faint ml-auto">{fmtDate(entry.createdAt)}</span>
      </div>
      <p className="text-sm font-medium text-ink line-clamp-2 leading-snug">{entry.title}</p>
      <p className="text-xs text-muted line-clamp-2">{entry.takeaway}</p>
    </button>
  )
}

function WikiDetail({ entry, onClose }: { entry: WikiEntry; onClose: () => void }) {
  return (
    <Overlay
      tone="black"
      onClose={onClose}
      className="flex items-end md:items-center justify-center p-0 md:p-4"
      panelClassName="bg-canvas w-full md:max-w-2xl md:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto shadow-xl"
    >
      <div className="sticky top-0 bg-canvas/90 backdrop-blur border-b border-line px-4 py-3 flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-muted shrink-0" />
        <span className="text-xs text-muted">Kennisbank · {fmtDate(entry.createdAt)}</span>
        <button onClick={onClose} className="ml-auto text-faint hover:text-ink p-1 rounded-lg hover:bg-sunken" aria-label="Sluiten">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold text-ink">{entry.title}</h2>
          <CategoryChip category={entry.category} />
        </div>

        <div className="rounded-xl bg-sunken border border-line p-3">
          <p className="text-[10px] uppercase tracking-wider text-faint mb-1">Kernpunt</p>
          <p className="text-sm text-ink-soft">{entry.takeaway}</p>
        </div>
        <div className="rounded-xl bg-sunken border border-line p-3">
          <p className="text-[10px] uppercase tracking-wider text-faint mb-1">Toepassing op mij &amp; projecten</p>
          <p className="text-sm text-ink-soft">{entry.application}</p>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wider text-faint mb-1">Transcript</p>
          <Markdown text={entry.transcript} />
        </div>

        {entry.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {entry.tags.map((t) => (
              <span key={t} className="chip bg-line text-muted text-[11px]">#{t}</span>
            ))}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 bg-canvas/90 backdrop-blur border-t border-line px-4 py-3 flex items-center gap-2">
        {entry.sourceUrl && (
          <a href={entry.sourceUrl} target="_blank" rel="noreferrer" className="btn-ghost !py-1.5 text-xs">
            <ExternalLink className="h-3.5 w-3.5" /> Bron openen
          </a>
        )}
      </div>
    </Overlay>
  )
}

export default function Kennisbank() {
  const { wikiEntries, resolveWikiEntry, loadWikiEntries } = useStore()
  const [openEntry, setOpenEntry] = useState<WikiEntry | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<LearningCategory | 'all'>('all')

  useEffect(() => { void loadWikiEntries() }, [loadWikiEntries])

  const suggested = wikiEntries.filter((e) => e.status === 'suggested')
  const confirmed = wikiEntries.filter((e) => e.status === 'confirmed')
  const confirmedCategoriesPresent = useMemo(
    () => Array.from(new Set(confirmed.map((e) => e.category).filter((c): c is LearningCategory => c != null))),
    [confirmed],
  )
  const visibleConfirmed = categoryFilter === 'all' ? confirmed : confirmed.filter((e) => e.category === categoryFilter)
  const openLiveEntry = openEntry ? confirmed.find((e) => e.id === openEntry.id) ?? openEntry : null

  return (
    <div className="flex flex-col gap-7 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sunken">
          <BookOpen className="h-5 w-5 text-ink-soft" />
        </span>
        <h1 className="text-xl font-medium text-ink">Kennisbank</h1>
      </div>

      {suggested.length > 0 && (
        <div className="space-y-2 animate-fade-up">
          <p className="text-xs uppercase tracking-wider text-faint">Te beoordelen ({suggested.length})</p>
          <div className="space-y-3">
            {suggested.map((entry) => (
              <WikiSuggestionCard key={entry.id} entry={entry} onResolve={resolveWikiEntry} />
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {suggested.length > 0 && <p className="text-xs uppercase tracking-wider text-faint">Kennisbank ({confirmed.length})</p>}
        {confirmed.length === 0 ? (
          <Empty>Nog niets in je kennisbank. Deel iets interessants naar Vastleggen — Claude stelt zelf voor wat het waard is.</Empty>
        ) : (
          <>
            {confirmedCategoriesPresent.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setCategoryFilter('all')}
                  className={`chip text-[11px] ${categoryFilter === 'all' ? 'bg-forest/15 text-forest' : 'bg-line text-muted'}`}
                >
                  Alle ({confirmed.length})
                </button>
                {confirmedCategoriesPresent.map((cat) => {
                  const meta = CATEGORY_META[cat]
                  const count = confirmed.filter((e) => e.category === cat).length
                  return (
                    <button
                      key={cat}
                      onClick={() => setCategoryFilter(cat)}
                      className="chip text-[11px]"
                      style={categoryFilter === cat ? { background: `${meta.hex}22`, color: meta.hex } : undefined}
                    >
                      {meta.label} ({count})
                    </button>
                  )
                })}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 animate-fade-up">
              {visibleConfirmed.map((entry) => (
                <WikiCard key={entry.id} entry={entry} onOpen={() => setOpenEntry(entry)} />
              ))}
            </div>
          </>
        )}
      </div>

      {openLiveEntry && <WikiDetail entry={openLiveEntry} onClose={() => setOpenEntry(null)} />}
    </div>
  )
}
