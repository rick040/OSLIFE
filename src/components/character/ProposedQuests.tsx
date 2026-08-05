import { Sparkles, Plus, X } from 'lucide-react'
import { DomainChip } from '../ui'
import { fmtGoalValue } from '../../lib/format'
import { fmtDate } from '../../domains'
import type { GoalProposal } from '../../types'

/**
 * HEYRA's own proposals (src/heyra/goals.ts — same brain call North Star's
 * "voorstel doelen" button uses) surfaced here unprompted, in the RPG frame:
 * accepting one calls the same addGoal the button does, which immediately
 * becomes a real Goal — and on the very next render, a real new skill-tree
 * node. This is the "suggest things on its own" half of the loop; CharacterTab
 * auto-fires proposeGoals() once when the tray is empty so it doesn't require
 * a click, this component is what renders the result.
 */
export function ProposedQuests({
  proposals,
  loading,
  error,
  onAccept,
  onDismiss,
}: {
  proposals: GoalProposal[]
  loading: boolean
  error: string | null
  onAccept: (id: string) => void
  onDismiss: (id: string) => void
}) {
  if (!loading && !error && proposals.length === 0) return null

  return (
    <div className="space-y-2.5">
      {loading && proposals.length === 0 && (
        <div className="card p-4 flex items-center gap-2 text-sm text-faint">
          <span className="h-4 w-4 rounded-full border-2 border-prjct border-t-transparent animate-spin shrink-0" />
          HEYRA zoekt nieuwe quests…
        </div>
      )}

      {error && !loading && proposals.length === 0 && <div className="card p-3 text-sm text-faint italic">{error}</div>}

      {proposals.map((p) => (
        <div key={p.id} className="card p-4 border-2 border-dashed border-prjct/40 bg-prjct/5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Sparkles className="h-3.5 w-3.5 text-prjct shrink-0" aria-hidden="true" />
                <h3 className="text-sm font-medium text-ink truncate">{p.title}</h3>
                <DomainChip domain={p.domain} small />
              </div>
              <p className="text-xs text-faint mt-1">
                {fmtGoalValue(p.current, p.metric)} → {fmtGoalValue(p.target, p.metric)} · {fmtDate(p.deadline)}
              </p>
              {p.rationale && <p className="text-xs text-ink-soft mt-1.5">{p.rationale}</p>}
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={() => onAccept(p.id)} className="btn-primary !py-1 !px-3 text-xs">
              <Plus className="h-3.5 w-3.5" /> Begin deze quest
            </button>
            <button onClick={() => onDismiss(p.id)} className="btn-ghost !py-1 !px-3 text-xs">
              <X className="h-3.5 w-3.5" /> Negeer
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
