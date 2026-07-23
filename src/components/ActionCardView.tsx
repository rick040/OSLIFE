import type { ActionCard, ActionField, EntityRef } from '../heyra/actions/types'
import DataVizCard from './DataVizCard'
import SearchResultCard from './SearchResultCard'
import {
  Wand2, CheckCircle2, XCircle, AlertTriangle, HelpCircle, ArrowRight,
} from 'lucide-react'

/** Renders one ActionField's value (or previousValue) as short display text. Dates/currency get light formatting; everything else falls back to a plain string so a new field type never crashes the card. */
function fmtFieldValue(field: ActionField, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (field.type === 'currency' && typeof value === 'number') return `€${value.toLocaleString('nl-NL')}`
  if (field.type === 'date' && typeof value === 'string') {
    const d = new Date(value + (value.length === 10 ? 'T00:00:00' : ''))
    return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
  }
  if (field.type === 'boolean') return value ? 'ja' : 'nee'
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

function FieldRow({ field }: { field: ActionField }) {
  const hasDiff = field.previousValue !== undefined && field.previousValue !== field.value
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-line/60 last:border-0">
      <span className="text-xs text-faint">{field.label}</span>
      {hasDiff ? (
        <span className="flex items-center gap-1.5 text-sm">
          <span className="text-faint line-through">{fmtFieldValue(field, field.previousValue)}</span>
          <ArrowRight className="h-3 w-3 text-faint" />
          <span className="font-medium text-ink">{fmtFieldValue(field, field.value)}</span>
        </span>
      ) : (
        <span className="text-sm text-ink">{fmtFieldValue(field, field.value)}</span>
      )}
    </div>
  )
}

function Disambiguation({ card, onSelect }: { card: ActionCard; onSelect: (entity: EntityRef) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted flex items-center gap-1.5">
        <HelpCircle className="h-3.5 w-3.5" /> Welke bedoel je?
      </p>
      <div className="flex flex-wrap gap-2">
        {(card.candidates ?? []).map((c) => (
          <button
            key={`${c.table}:${c.id}`}
            onClick={() => onSelect(c)}
            className="text-xs rounded-full border border-line px-3 py-1 text-muted hover:text-ink hover:border-prjct/40 transition-colors"
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export interface ActionCardViewProps {
  card: ActionCard
  onConfirm?: (card: ActionCard) => void
  onCancel?: (card: ActionCard) => void
  onSelectCandidate?: (card: ActionCard, entity: EntityRef) => void
  onNav?: (v: string) => void
}

/**
 * The one generic renderer for every ActionKind — switched only on
 * `renderHint`, never on `kind`. Adding a new action kind means a registry
 * entry (registry.ts) and, at most, a new renderHint case here — not a new
 * component and a new render block in Heyra.tsx.
 */
export default function ActionCardView({ card, onConfirm, onCancel, onSelectCandidate, onNav }: ActionCardViewProps) {
  if (card.renderHint === 'chart' && card.chartData) return <DataVizCard data={card.chartData} />
  if (card.renderHint === 'table' && card.searchResults) return <SearchResultCard data={card.searchResults} onNav={onNav} />

  const needsDisambiguation = !card.entity && (card.candidates?.length ?? 0) > 0
  const awaitingConfirm = card.mutating && card.status === 'proposed' && !needsDisambiguation

  return (
    <div className="card overflow-hidden animate-fade-up">
      <div className="flex items-center gap-2 px-4 py-2 bg-sunken">
        <Wand2 className="h-4 w-4 text-muted" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">{card.title}</span>
        {card.entity && <span className="ml-auto text-[10px] text-faint">{card.entity.label}</span>}
      </div>

      <div className="p-4 space-y-3">
        {card.description && <p className="text-sm text-ink-soft">{card.description}</p>}

        {needsDisambiguation ? (
          <Disambiguation card={card} onSelect={(entity) => onSelectCandidate?.(card, entity)} />
        ) : (
          card.fields.length > 0 && (
            <div>
              {card.fields.map((f) => (
                <FieldRow key={f.key} field={f} />
              ))}
            </div>
          )
        )}

        {card.status === 'failed' && card.error && (
          <p className="text-xs text-cross-deep flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> {card.error}
          </p>
        )}

        {awaitingConfirm && (
          <div className="flex gap-2 pt-1">
            <button className="btn-primary" onClick={() => onConfirm?.(card)}>
              <CheckCircle2 className="h-4 w-4" /> Bevestigen
            </button>
            <button className="btn-ghost" onClick={() => onCancel?.(card)}>
              <XCircle className="h-4 w-4" /> Annuleren
            </button>
          </div>
        )}

        {card.status === 'dispatched' && (
          <span className="chip bg-buurtkaart/15 text-buurtkaart-deep">
            <CheckCircle2 className="h-3.5 w-3.5" /> Uitgevoerd
          </span>
        )}
        {card.status === 'dismissed' && (
          <span className="chip bg-line text-muted">
            <XCircle className="h-3.5 w-3.5" /> Geannuleerd
          </span>
        )}
      </div>
    </div>
  )
}
