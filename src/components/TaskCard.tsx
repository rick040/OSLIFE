import { useState } from 'react'
import type { TaskDraft, Domain, Priority } from '../types'
import { DOMAIN_META, DOMAIN_HEX } from '../domains'
import { relativeDue } from '../heyra/datetime'
import { googleCalendarUrl } from '../lib/gcal'
import {
  CalendarClock, Flag, ListTodo, CheckCircle2, CalendarPlus, Pencil, Check,
} from 'lucide-react'

const PRIORITY_STYLE: Record<Priority, string> = {
  High: 'bg-cross/15 text-cross-deep',
  Medium: 'bg-personal/15 text-personal-deep',
  Low: 'bg-line text-muted',
}

const DOMAINS: Domain[] = ['parkingyou', 'prjct', 'buurtkaart', 'personal', 'cross']

/**
 * The Taakmaker reply: a dynamically styled, editable task card. The accent
 * (left bar, header) follows the chosen domain. Two actions: add it to your
 * tasks (open loop), or open a prefilled Google Calendar event.
 */
export default function TaskCard({
  draft: initial,
  added,
  onAdd,
}: {
  draft: TaskDraft
  added: boolean
  onAdd: (draft: TaskDraft) => void
}) {
  const [draft, setDraft] = useState<TaskDraft>(initial)
  const [editing, setEditing] = useState(false)

  const meta = DOMAIN_META[draft.domain]
  const accent = DOMAIN_HEX[draft.domain]
  const rel = relativeDue(draft.due)

  const patch = (p: Partial<TaskDraft>) => setDraft((d) => ({ ...d, ...p }))

  return (
    <div
      className="card overflow-hidden animate-fade-up"
      style={{ borderColor: `${accent}55` }}
    >
      {/* accent header bar */}
      <div className="flex items-center gap-2 px-4 py-2" style={{ background: `${accent}14` }}>
        <ListTodo className="h-4 w-4" style={{ color: accent }} />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: accent }}>
          Taakkaart
        </span>
        <span className="chip ml-auto" style={{ background: `${accent}22`, color: accent }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
          {meta.label}
        </span>
        <button
          onClick={() => setEditing((v) => !v)}
          className="text-faint hover:text-ink p-1 rounded-lg hover:bg-surface/60"
          aria-label={editing ? 'Klaar met bewerken' : 'Bewerken'}
        >
          {editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="p-4 space-y-3">
        {/* title */}
        {editing ? (
          <input
            value={draft.title}
            onChange={(e) => patch({ title: e.target.value })}
            className="input w-full text-base font-medium"
            placeholder="Wat moet er gebeuren?"
          />
        ) : (
          <h3 className="text-base font-semibold leading-snug">{draft.title}</h3>
        )}

        {/* meta row */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`chip ${rel.overdue ? 'bg-cross/15 text-cross-deep' : rel.soon ? 'bg-personal/15 text-personal-deep' : 'bg-sunken text-muted'}`}
          >
            <CalendarClock className="h-3.5 w-3.5" />
            {draft.due
              ? `${new Date(draft.due + 'T00:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}${draft.time ? ` · ${draft.time}` : ''} · ${rel.label}`
              : 'geen datum'}
          </span>
          <span className={`chip ${PRIORITY_STYLE[draft.priority]}`}>
            <Flag className="h-3.5 w-3.5" /> {draft.priority}
          </span>
        </div>

        {/* editable fields */}
        {editing && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <label className="text-[11px] text-muted flex flex-col gap-1">
              Datum
              <input
                type="date"
                value={draft.due ?? ''}
                onChange={(e) => patch({ due: e.target.value || null })}
                className="input"
              />
            </label>
            <label className="text-[11px] text-muted flex flex-col gap-1">
              Tijd
              <input
                type="time"
                value={draft.time ?? ''}
                onChange={(e) => patch({ time: e.target.value || null })}
                className="input"
              />
            </label>
            <label className="text-[11px] text-muted flex flex-col gap-1">
              Prioriteit
              <select
                value={draft.priority}
                onChange={(e) => patch({ priority: e.target.value as Priority })}
                className="input"
              >
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </label>
            <label className="text-[11px] text-muted flex flex-col gap-1">
              Domein
              <select
                value={draft.domain}
                onChange={(e) => patch({ domain: e.target.value as Domain })}
                className="input"
              >
                {DOMAINS.map((d) => (
                  <option key={d} value={d}>{DOMAIN_META[d].label}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        {/* actions */}
        <div className="flex flex-wrap gap-2 pt-1">
          {added ? (
            <span className="btn bg-buurtkaart/15 text-buurtkaart-deep cursor-default">
              <CheckCircle2 className="h-4 w-4" /> Toegevoegd aan taken
            </span>
          ) : (
            <button className="btn-primary" onClick={() => onAdd(draft)}>
              <CheckCircle2 className="h-4 w-4" /> Toevoegen aan taken
            </button>
          )}
          <a
            href={googleCalendarUrl(draft)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost"
          >
            <CalendarPlus className="h-4 w-4" /> Google Agenda
          </a>
        </div>
      </div>
    </div>
  )
}
