// ── Belangrijkste vandaag ───────────────────────────────────────────────────
// The dashboard's answer to "what are the two or three things I actually have
// to get done today". Everything else on that screen reports state (saldo,
// slaap, mail); this is the one block you *act* on — tick a task and it's
// closed for real, in the same store the Taken screen writes to.
//
// Two kinds of row live here:
//  - pinned (★ in Taken, or the + picker below): a deliberate choice, kept
//    even once it's ticked off so the block shows the day's progress instead
//    of quietly emptying itself;
//  - suggested: the most pressing open tasks, filling the empty slots so the
//    block is useful on a day nothing was pinned. One tap promotes one to a
//    real pin.
import { useState } from 'react'
import { useStore } from '../store'
import { TODAY } from '../domains'
import { focusTasksForDay, sortTasks, taskUrgency, urgencyBadge, URGENCY_META, PRIORITY_LABEL, PRIORITY_STYLE } from '../lib/taskFocus'
import { DomainChip, Empty, Overlay } from './ui'
import type { Thread } from '../types'
import { ArrowRight, Check, Plus, Star, X, Target } from 'lucide-react'

const FOCUS_LIMIT = 3

function FocusRow({
  task,
  pinned,
  onToggleDone,
  onPin,
  onUnpin,
}: {
  task: Thread
  pinned: boolean
  onToggleDone: () => void
  onPin: () => void
  onUnpin: () => void
}) {
  const closed = task.status === 'closed'
  const urgency = closed ? 'none' : taskUrgency(task.due)
  const checklist = task.checklist ?? []

  return (
    <div className={`flex items-start gap-3 rounded-2xl px-4 py-3 ${pinned ? 'bg-sunken' : 'bg-sunken/50 border border-dashed border-line'}`}>
      <button
        onClick={onToggleDone}
        aria-label={closed ? `${task.title} heropenen` : `${task.title} afvinken`}
        className={`shrink-0 mt-0.5 h-6 w-6 rounded-lg border flex items-center justify-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
          closed ? 'bg-forest border-forest text-white' : 'border-line-strong text-transparent hover:border-forest hover:text-forest'
        }`}
      >
        <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>

      <div className="min-w-0 flex-1 flex flex-col gap-1.5">
        <p className={`text-sm leading-snug ${closed ? 'line-through text-faint' : 'text-ink'}`}>{task.title}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`chip !py-0 ${URGENCY_META[urgency].pill}`}>{closed ? 'afgerond' : urgencyBadge(task.due)}</span>
          <DomainChip domain={task.domain} small />
          {task.priority && <span className={`chip !py-0 ${PRIORITY_STYLE[task.priority]}`}>{PRIORITY_LABEL[task.priority]}</span>}
          {checklist.length > 0 && (
            <span className="chip !py-0 bg-canvas text-muted">{checklist.filter((c) => c.done).length}/{checklist.length}</span>
          )}
          {!pinned && <span className="text-[11px] text-faint">voorstel</span>}
        </div>
      </div>

      {pinned ? (
        <button
          onClick={onUnpin}
          aria-label="Van vandaag afhalen"
          className="shrink-0 p-1.5 rounded-lg text-personal hover:bg-canvas outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Star className="h-4 w-4 fill-current" />
        </button>
      ) : (
        <button
          onClick={onPin}
          aria-label="Vastzetten voor vandaag"
          title="Vastzetten voor vandaag"
          className="shrink-0 p-1.5 rounded-lg text-faint hover:text-personal hover:bg-canvas outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Star className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

/** Pick-from-all-open-tasks sheet, so the block can be filled without leaving the dashboard. */
function FocusPicker({ candidates, onClose }: { candidates: Thread[]; onClose: () => void }) {
  const store = useStore()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const list = q ? candidates.filter((t) => t.title.toLowerCase().includes(q)) : candidates

  return (
    <Overlay tone="black-blur" onClose={onClose} panelClassName="bg-surface rounded-3xl w-full max-w-md shadow-2xl max-h-[80vh] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
        <span className="text-sm font-medium text-ink">Kies je belangrijkste taken</span>
        <button onClick={onClose} className="text-faint hover:text-ink p-1.5 rounded-lg hover:bg-sunken" aria-label="Sluiten">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="px-5 pb-3">
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Zoek een taak…" className="input w-full" />
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto px-5 pb-5">
        {list.length ? (
          list.map((t) => {
            const pinned = t.focusDate === TODAY
            return (
              <button
                key={t.id}
                onClick={() => store.updateThread(t.id, { focusDate: pinned ? null : TODAY })}
                className={`flex items-start gap-3 rounded-2xl px-4 py-3 text-left transition-colors ${
                  pinned ? 'bg-personal/15 ring-1 ring-personal/40' : 'bg-sunken hover:bg-line'
                }`}
              >
                <Star className={`h-4 w-4 shrink-0 mt-0.5 ${pinned ? 'fill-personal text-personal' : 'text-faint'}`} />
                <div className="min-w-0 flex-1 flex flex-col gap-1">
                  <span className="text-sm text-ink leading-snug">{t.title}</span>
                  <span className="flex items-center gap-1.5 flex-wrap">
                    <span className={`chip !py-0 ${URGENCY_META[taskUrgency(t.due)].pill}`}>{urgencyBadge(t.due)}</span>
                    <DomainChip domain={t.domain} small />
                  </span>
                </div>
              </button>
            )
          })
        ) : (
          <Empty>{q ? 'Geen taak gevonden.' : 'Geen open taken om te kiezen.'}</Empty>
        )}
      </div>
    </Overlay>
  )
}

export default function FocusToday({ onNav }: { onNav: (v: string) => void }) {
  const { threads, closeThread, reopenThread, updateThread } = useStore()
  const [picking, setPicking] = useState(false)

  const picks = focusTasksForDay(threads, TODAY, FOCUS_LIMIT)
  const pinnedCount = picks.filter((p) => p.pinned).length
  const doneCount = picks.filter((p) => p.pinned && p.task.status === 'closed').length
  const candidates = sortTasks(threads.filter((t) => t.status === 'open'), 'urgency')

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Belangrijkste vandaag</p>
        {pinnedCount > 0 ? (
          <span className="text-xs text-muted tabular-nums">{doneCount}/{pinnedCount} klaar</span>
        ) : (
          <button className="text-xs text-muted hover:text-ink flex items-center gap-1" onClick={() => onNav('tasks')}>
            alle taken <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className="card p-3 flex flex-col gap-2">
        {picks.length > 0 ? (
          <>
            {picks.map(({ task, pinned }) => (
              <FocusRow
                key={task.id}
                task={task}
                pinned={pinned}
                onToggleDone={() => (task.status === 'closed' ? reopenThread(task.id) : closeThread(task.id))}
                onPin={() => updateThread(task.id, { focusDate: TODAY })}
                onUnpin={() => updateThread(task.id, { focusDate: null })}
              />
            ))}
            <div className="flex items-center justify-between gap-2 px-1 pt-0.5">
              <button onClick={() => setPicking(true)} className="text-xs text-muted hover:text-ink flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" /> taak kiezen
              </button>
              <button onClick={() => onNav('tasks')} className="text-xs text-muted hover:text-ink flex items-center gap-1">
                alle taken <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </>
        ) : (
          <button
            onClick={() => onNav('tasks')}
            className="flex flex-col items-center gap-2 rounded-2xl bg-sunken px-4 py-6 text-center transition-colors hover:bg-line"
          >
            <Target className="h-5 w-5 text-faint" />
            <span className="text-sm text-ink-soft">Niks openstaand vandaag</span>
            <span className="text-xs text-faint">Voeg een taak toe en zet ’m met ★ op vandaag.</span>
          </button>
        )}
      </div>

      {pinnedCount === 0 && picks.length > 0 && (
        <p className="px-1 text-[11px] leading-relaxed text-faint">
          Dit zijn voorstellen op basis van je deadlines — tik ★ om er zelf drie te kiezen die vandaag echt tellen.
        </p>
      )}

      {picking && <FocusPicker candidates={candidates} onClose={() => setPicking(false)} />}
    </div>
  )
}
