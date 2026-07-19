import type { SearchCardData } from '../heyra/cards'
import { DomainChip } from './ui'
import { Search, ArrowRight, Network } from 'lucide-react'

/** The Zoeken reply: whatever matched the query, pulled live from the one memory. */
export default function SearchResultCard({ data, onNav }: { data: SearchCardData; onNav?: (v: string) => void }) {
  return (
    <div className="card overflow-hidden animate-fade-up">
      <div className="flex items-center gap-2 px-4 py-2 bg-sunken">
        <Search className="h-4 w-4 text-muted" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          Gevonden voor “{data.query}”
        </span>
      </div>
      {data.graphInsight && (
        <div className="mx-3 mt-3 flex items-start gap-2 rounded-xl bg-sunken px-2.5 py-2">
          <Network className="h-3.5 w-3.5 text-muted mt-0.5 shrink-0" />
          <p className="text-xs text-ink-soft">{data.graphInsight}</p>
        </div>
      )}
      <div className="p-3">
        {data.results.length ? (
          <div className="space-y-1.5">
            {data.results.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl px-2.5 py-1.5 hover:bg-sunken/60">
                <div className="min-w-0">
                  <p className="text-sm text-ink truncate">{r.title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <DomainChip domain={r.domain} small />
                    <span className="text-[10px] text-faint">{r.kind}{r.detail ? ` · ${r.detail}` : ''}</span>
                  </div>
                </div>
              </div>
            ))}
            {onNav && (
              <button
                onClick={() => onNav('memory')}
                className="text-xs text-muted hover:text-ink flex items-center gap-1 pt-1 px-2.5"
              >
                alles in Geheugen <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-faint italic px-2.5 py-2">Niks gevonden in je geheugen voor deze zoekopdracht.</p>
        )}
      </div>
    </div>
  )
}
