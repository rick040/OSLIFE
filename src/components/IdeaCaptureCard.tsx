import { useState } from 'react'
import type { IdeaCaptureDraft } from '../heyra/cards'
import type { Domain } from '../types'
import { DOMAIN_META } from '../domains'
import { Sparkles, Pencil, Check, Loader2, ArrowRight } from 'lucide-react'

/**
 * HEYRA recognized a business-idea pitch mid-conversation: review + edit the
 * title/domain before it becomes a Strategie HQ row — nothing is written
 * until "Laat HEYRA uitwerken" is pressed, mirroring ClientIntakeCard's
 * review-then-commit contract. Once committed, idea-elaborate takes over
 * exactly as it does for a capture made directly on Strategie HQ.
 */
export default function IdeaCaptureCard({
  draft: initial,
  createdId,
  onCommit,
  onNav,
}: {
  draft: IdeaCaptureDraft
  createdId?: string | null
  onCommit: (draft: IdeaCaptureDraft) => void
  onNav?: (v: string) => void
}) {
  const [draft, setDraft] = useState<IdeaCaptureDraft>(initial)
  const [editing, setEditing] = useState(false)
  const [committing, setCommitting] = useState(false)

  const patch = (p: Partial<IdeaCaptureDraft>) => setDraft((d) => ({ ...d, ...p }))
  const created = Boolean(createdId)

  async function commit() {
    setCommitting(true)
    try {
      onCommit(draft)
    } finally {
      setCommitting(false)
    }
  }

  return (
    <div className="card overflow-hidden animate-fade-up">
      <div className="flex items-center gap-2 px-4 py-2 bg-sunken">
        <Sparkles className="h-4 w-4 text-muted" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">Strategie HQ</span>
        {!created && (
          <button
            onClick={() => setEditing((v) => !v)}
            className="ml-auto text-faint hover:text-ink p-1 rounded-lg hover:bg-surface/60"
            aria-label={editing ? 'Klaar met bewerken' : 'Bewerken'}
          >
            {editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      <div className="p-4 space-y-3">
        {editing ? (
          <input
            value={draft.title}
            onChange={(e) => patch({ title: e.target.value })}
            className="input w-full text-base font-medium"
            placeholder="Titel"
          />
        ) : (
          <h3 className="text-base font-semibold leading-snug">{draft.title}</h3>
        )}

        <p className="text-sm text-muted leading-relaxed">{draft.rawInput}</p>

        {editing ? (
          <select
            value={draft.domain}
            onChange={(e) => patch({ domain: e.target.value as Domain })}
            className="input w-full"
          >
            {(Object.keys(DOMAIN_META) as Domain[]).map((d) => (
              <option key={d} value={d}>{DOMAIN_META[d].label}</option>
            ))}
          </select>
        ) : (
          <span className="chip bg-line text-muted">{DOMAIN_META[draft.domain].label}</span>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {created ? (
            <span className="btn bg-buurtkaart/15 text-buurtkaart-deep cursor-default">
              <Loader2 className="h-4 w-4 animate-spin" /> HEYRA werkt dit uit…
            </span>
          ) : (
            <button className="btn-primary" onClick={commit} disabled={committing}>
              <Sparkles className="h-4 w-4" /> {committing ? 'Vastleggen…' : 'Laat HEYRA uitwerken'}
            </button>
          )}
          {created && onNav && (
            <button className="btn-ghost" onClick={() => onNav('strategiehq')}>
              Open in Strategie HQ <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
