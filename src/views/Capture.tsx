import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { SectionTitle, Empty, DomainChip } from '../components/ui'
import { BraindumpCard, BraindumpDetail, SOURCE_LABEL } from '../components/BraindumpCard'
import { detectTextShare } from '../lib/braindump'
import type { BraindumpEntry, BraindumpSourceKind, Domain } from '../types'
import { Inbox, Search, Share2, Loader2 } from 'lucide-react'

const DOMAINS: Domain[] = ['parkingyou', 'prjct', 'buurtkaart', 'personal', 'cross']

export default function Capture() {
  const { braindumpEntries, braindumpCapture, deleteBraindumpEntry, retryBraindumpEntry } = useStore()
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState<BraindumpEntry | null>(null)

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
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Inbox className="h-5 w-5 text-buurtkaart" /> Braindump
        </h1>
        <p className="text-sm text-muted mt-1">
          Één ingang. Gooi alles erin — een gedachte, link, afbeelding, PDF of video. Het systeem maakt er
          een lichte notitie van die HEYRA en OSLife als context gebruiken.
        </p>
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
