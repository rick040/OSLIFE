import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { TODAY, DOMAIN_META, fmtDate } from '../domains'
import { addDays } from '../lib/dates'
import {
  URGENCY_META,
  PRIORITY_ORDER,
  PRIORITY_LABEL,
  PRIORITY_STYLE,
  SORT_LABEL,
  taskUrgency,
  urgencyBadge,
  groupByUrgency,
  sortTasks,
  taskCounts,
  type SortMode,
  type TaskUrgency,
} from '../lib/taskFocus'
import { DomainChip, Empty, Overlay, ConfirmDialog, SectionTitle, SegmentedProgress } from '../components/ui'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu'
import { parseTaskDraft } from '../heyra/skills'
import type { Domain, Thread, Priority, ChecklistItem } from '../types'
import {
  CheckSquare, Plus, CheckCircle2, RotateCcw, Trash2, Pencil, Check, ChevronDown, ChevronRight,
  X, Search, Calendar, User, Flag, ListTodo, Clock, AlertCircle, MoreHorizontal, Star, CalendarClock,
  ArrowDownWideNarrow, FileText, Eraser, Sparkles,
} from 'lucide-react'

const WORK_DOMAINS: Domain[] = ['parkingyou', 'prjct', 'buurtkaart', 'cross']
const ALL_DOMAINS: Domain[] = ['parkingyou', 'prjct', 'buurtkaart', 'personal', 'cross']

type Filter = 'all' | 'personal' | 'work'

/** The four one-tap deadlines behind "Verzet naar" — covers almost every reschedule. */
const SNOOZE_OPTIONS: { label: string; value: string | null }[] = [
  { label: 'Vandaag', value: TODAY },
  { label: 'Morgen', value: addDays(TODAY, 1) },
  { label: 'Volgende week', value: addDays(TODAY, 7) },
  { label: 'Geen deadline', value: null },
]

function subtaskId(): string {
  return `chk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function ActivityRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-sunken px-4 py-3">
      <Icon className="h-4 w-4 text-faint shrink-0" />
      <span className="text-sm text-muted flex-1">{label}</span>
      <span className="text-sm text-ink font-medium">{value}</span>
    </div>
  )
}

// ── per-task action menu — every "adjust" that used to need the overlay ──────
// Reschedule, re-prioritise, re-file under another domain, pin to today or
// delete, all one tap deep from the row itself. The overlay stays for reading
// and writing detail; this is for changing your mind quickly.
function TaskActionsMenu({
  task,
  onEdit,
  onDelete,
}: {
  task: Thread
  onEdit: () => void
  onDelete: () => void
}) {
  const store = useStore()
  const pinned = task.focusDate === TODAY

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="text-faint hover:text-ink p-1.5 rounded-lg hover:bg-sunken outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Meer acties"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" /> Titel wijzigen
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => store.updateThread(task.id, { focusDate: pinned ? null : TODAY })}>
          <Star className={`h-3.5 w-3.5 ${pinned ? 'fill-personal text-personal' : ''}`} />
          {pinned ? 'Van vandaag afhalen' : 'Zet op vandaag'}
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <CalendarClock className="h-3.5 w-3.5" /> Verzet naar
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {SNOOZE_OPTIONS.map((o) => (
              <DropdownMenuItem key={o.label} onClick={() => store.updateThread(task.id, { due: o.value })}>
                {o.label}
                {o.value && <span className="ml-auto text-[11px] text-faint">{fmtDate(o.value)}</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Flag className="h-3.5 w-3.5" /> Prioriteit
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {PRIORITY_ORDER.map((p) => (
              <DropdownMenuItem key={p} onClick={() => store.updateThread(task.id, { priority: p })}>
                {PRIORITY_LABEL[p]}
                {task.priority === p && <Check className="ml-auto h-3.5 w-3.5" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={() => store.updateThread(task.id, { priority: null })}>
              Geen
              {!task.priority && <Check className="ml-auto h-3.5 w-3.5" />}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span className={`h-2 w-2 rounded-full ${DOMAIN_META[task.domain].dot}`} /> Domein
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {ALL_DOMAINS.map((d) => (
              <DropdownMenuItem key={d} onClick={() => store.updateThread(task.id, { domain: d })}>
                <span className={`h-2 w-2 rounded-full ${DOMAIN_META[d].dot}`} /> {DOMAIN_META[d].label}
                {task.domain === d && <Check className="ml-auto h-3.5 w-3.5" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />
        {task.status === 'open' ? (
          <DropdownMenuItem onClick={() => store.closeThread(task.id)}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Afronden
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => store.reopenThread(task.id)}>
            <RotateCcw className="h-3.5 w-3.5" /> Heropenen
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onDelete} className="text-cross-deep focus:text-cross-deep">
          <Trash2 className="h-3.5 w-3.5" /> Verwijderen
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ── task row — everything you need to triage without opening anything ───────
// A colour rail on the left says how late it is before you've read a word; the
// meta line carries deadline, priority, domain, subtask progress and whether
// there's a description; the checkbox ticks it off in place; the caret opens
// subtasks and notes inline; the ⋯ menu reschedules/re-prioritises/deletes.
function TaskListItem({ task, onOpen }: { task: Thread; onOpen: () => void }) {
  const store = useStore()
  const [expanded, setExpanded] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [titleDraft, setTitleDraft] = useState(task.title)
  const [subtaskInput, setSubtaskInput] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const closed = task.status === 'closed'
  const urgency = closed ? ('none' as TaskUrgency) : taskUrgency(task.due)
  const meta = URGENCY_META[urgency]
  const checklist = task.checklist ?? []
  const doneCount = checklist.filter((c) => c.done).length
  const pinned = task.focusDate === TODAY
  const hasDetail = checklist.length > 0 || !!task.notes

  function commitRename() {
    const next = titleDraft.trim()
    if (next && next !== task.title) store.updateThread(task.id, { title: next })
    setRenaming(false)
  }

  function addSubtask() {
    const text = subtaskInput.trim()
    if (!text) return
    const item: ChecklistItem = { id: subtaskId(), text, done: false }
    store.updateThread(task.id, { checklist: [...checklist, item] })
    setSubtaskInput('')
  }

  return (
    <div className={`card relative overflow-hidden ${closed ? 'opacity-60' : ''}`}>
      {/* urgency rail — the pre-attentive "how bad is this" signal */}
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${meta.rail}`} aria-hidden />

      <div className="flex items-start gap-3 py-3 pl-4 pr-2">
        <button
          onClick={() => (closed ? store.reopenThread(task.id) : store.closeThread(task.id))}
          aria-label={closed ? 'Heropenen' : 'Afronden'}
          className={`shrink-0 mt-0.5 h-6 w-6 rounded-lg border flex items-center justify-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
            closed ? 'bg-forest border-forest text-white' : 'border-line-strong text-transparent hover:border-forest hover:text-forest'
          }`}
        >
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>

        <div className="min-w-0 flex-1 flex flex-col gap-1.5">
          {renaming ? (
            <form
              onSubmit={(e) => { e.preventDefault(); commitRename() }}
              className="flex items-center gap-2"
            >
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => { if (e.key === 'Escape') { setTitleDraft(task.title); setRenaming(false) } }}
                className="input flex-1 text-sm"
              />
              <button type="submit" className="btn-ghost !px-2.5 !py-1.5" aria-label="Titel opslaan">
                <Check className="h-3.5 w-3.5" />
              </button>
            </form>
          ) : (
            <button
              onClick={onOpen}
              className={`text-left text-sm leading-snug outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md ${
                closed ? 'text-faint line-through' : 'text-ink'
              }`}
            >
              {task.title}
            </button>
          )}

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`chip !py-0 ${meta.pill}`}>
              <Calendar className="h-3 w-3" /> {closed ? fmtDate(task.due) : urgencyBadge(task.due)}
            </span>
            <DomainChip domain={task.domain} small />
            {task.priority && <span className={`chip !py-0 ${PRIORITY_STYLE[task.priority]}`}>{PRIORITY_LABEL[task.priority]}</span>}
            {checklist.length > 0 && (
              <span className="chip !py-0 bg-sunken text-muted">
                <ListTodo className="h-3 w-3" /> {doneCount}/{checklist.length}
              </span>
            )}
            {task.notes && <FileText className="h-3 w-3 text-faint" aria-label="heeft beschrijving" />}
            {task.owedTo && task.owedTo !== 'self (HEYRA)' && (
              <span className="chip !py-0 bg-sunken text-muted">
                <User className="h-3 w-3" /> {task.owedTo}
              </span>
            )}
          </div>

          {checklist.length > 0 && !expanded && (
            <div className="pt-0.5 pr-2">
              <SegmentedProgress done={doneCount} total={checklist.length} />
            </div>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => store.updateThread(task.id, { focusDate: pinned ? null : TODAY })}
            aria-label={pinned ? 'Van vandaag afhalen' : 'Zet op vandaag'}
            aria-pressed={pinned}
            title={pinned ? 'Staat op je belangrijkste vandaag' : 'Zet bij je belangrijkste vandaag'}
            className={`p-1.5 rounded-lg hover:bg-sunken outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              pinned ? 'text-personal' : 'text-faint hover:text-personal'
            }`}
          >
            <Star className={`h-4 w-4 ${pinned ? 'fill-current' : ''}`} />
          </button>
          {hasDetail && (
            <button
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? 'Details inklappen' : 'Details uitklappen'}
              aria-expanded={expanded}
              className="text-faint hover:text-ink p-1.5 rounded-lg hover:bg-sunken outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          )}
          <TaskActionsMenu
            task={task}
            onEdit={() => { setTitleDraft(task.title); setRenaming(true) }}
            onDelete={() => setConfirmDelete(true)}
          />
        </div>
      </div>

      {/* inline detail — tick subtasks and read the description without
          leaving the list; the overlay is for editing everything at once */}
      {expanded && (
        <div className="border-t border-line px-4 py-3 pl-5 flex flex-col gap-3">
          {task.notes && <p className="text-xs leading-relaxed text-ink-soft whitespace-pre-wrap">{task.notes}</p>}
          {checklist.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {checklist.map((item) => (
                <div key={item.id} className="flex items-center gap-2.5 group">
                  <button
                    onClick={() => store.updateThread(task.id, { checklist: checklist.map((c) => (c.id === item.id ? { ...c, done: !c.done } : c)) })}
                    aria-label={`${item.text} afvinken`}
                    className={`shrink-0 h-4 w-4 rounded border flex items-center justify-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      item.done ? 'bg-forest border-forest text-white' : 'border-line-strong text-transparent hover:border-forest hover:text-forest'
                    }`}
                  >
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  </button>
                  <span className={`text-xs flex-1 min-w-0 ${item.done ? 'line-through text-faint' : 'text-ink-soft'}`}>{item.text}</span>
                  <button
                    onClick={() => store.updateThread(task.id, { checklist: checklist.filter((c) => c.id !== item.id) })}
                    className="text-faint hover:text-cross-deep opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 shrink-0"
                    aria-label="Subtaak verwijderen"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); addSubtask() }} className="flex gap-2">
            <input
              value={subtaskInput}
              onChange={(e) => setSubtaskInput(e.target.value)}
              placeholder="Subtaak toevoegen…"
              className="input flex-1 !py-1.5 text-xs"
            />
            <button type="submit" className="btn-ghost !px-2.5 !py-1.5" disabled={!subtaskInput.trim()} aria-label="Subtaak toevoegen">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Taak verwijderen?"
          message={`"${task.title}" wordt definitief verwijderd.`}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => { store.deleteThread(task.id); setConfirmDelete(false) }}
        />
      )}
    </div>
  )
}

// ── task detail overlay — dive deeper: edit every field, work subtasks, see activity ─
function TaskDetailOverlay({ task, onClose }: { task: Thread; onClose: () => void }) {
  const store = useStore()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [domain, setDomain] = useState<Domain>(task.domain)
  const [due, setDue] = useState(task.due ?? '')
  const [priority, setPriority] = useState<Priority | ''>(task.priority ?? '')
  const [owedTo, setOwedTo] = useState(task.owedTo)
  const [notes, setNotes] = useState(task.notes ?? '')
  const [subtaskInput, setSubtaskInput] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const checklist = task.checklist ?? []
  const doneCount = checklist.filter((c) => c.done).length
  const urgency = task.status === 'closed' ? ('none' as TaskUrgency) : taskUrgency(task.due)
  const meta = URGENCY_META[urgency]
  const pinned = task.focusDate === TODAY

  function save() {
    store.updateThread(task.id, {
      title: title.trim() || task.title,
      domain,
      due: due || null,
      priority: (priority || null) as Priority | null,
      owedTo: owedTo.trim() || task.owedTo,
      notes: notes.trim() || null,
    })
    setEditing(false)
  }

  function addSubtask() {
    const text = subtaskInput.trim()
    if (!text) return
    const item: ChecklistItem = { id: subtaskId(), text, done: false }
    store.updateThread(task.id, { checklist: [...checklist, item] })
    setSubtaskInput('')
  }

  function toggleSubtask(id: string) {
    store.updateThread(task.id, { checklist: checklist.map((c) => (c.id === id ? { ...c, done: !c.done } : c)) })
  }

  function removeSubtask(id: string) {
    store.updateThread(task.id, { checklist: checklist.filter((c) => c.id !== id) })
  }

  return (
    <Overlay tone="black-blur" onClose={onClose} panelClassName="bg-surface rounded-3xl w-full max-w-lg shadow-2xl max-h-[88vh] flex flex-col overflow-hidden">
      <div className="p-5 flex flex-col gap-4 overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {editing ? (
              <select value={domain} onChange={(e) => setDomain(e.target.value as Domain)} className="input !py-1 text-xs">
                {ALL_DOMAINS.map((d) => (
                  <option key={d} value={d}>{DOMAIN_META[d].label}</option>
                ))}
              </select>
            ) : (
              <DomainChip domain={task.domain} />
            )}
            {task.status === 'closed' ? (
              <span className="chip bg-buurtkaart/15 text-buurtkaart-deep">Afgerond</span>
            ) : (
              <span className={`chip ${meta.pill}`}>{urgencyBadge(task.due)}</span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => store.updateThread(task.id, { focusDate: pinned ? null : TODAY })}
              aria-pressed={pinned}
              className={`p-2 rounded-lg hover:bg-sunken ${pinned ? 'text-personal' : 'text-faint hover:text-personal'}`}
              aria-label={pinned ? 'Van vandaag afhalen' : 'Zet op vandaag'}
            >
              <Star className={`h-4 w-4 ${pinned ? 'fill-current' : ''}`} />
            </button>
            <button
              onClick={() => (editing ? save() : setEditing(true))}
              className="text-faint hover:text-ink p-2 rounded-lg hover:bg-sunken"
              aria-label={editing ? 'Opslaan' : 'Bewerken'}
            >
              {editing ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            </button>
            <button onClick={onClose} className="text-faint hover:text-ink p-2 rounded-lg hover:bg-sunken" aria-label="Sluiten">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {editing ? (
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="input w-full text-lg font-medium" placeholder="Titel" />
        ) : (
          <h2 className="text-lg font-medium text-ink leading-snug">{task.title}</h2>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <User className="h-3.5 w-3.5 shrink-0" />
            {editing ? (
              <input value={owedTo} onChange={(e) => setOwedTo(e.target.value)} className="input !py-1 text-xs" placeholder="Voor wie" />
            ) : (
              <span>{task.owedTo}</span>
            )}
          </div>
          <div className={`flex items-center gap-1.5 text-xs ${urgency === 'overdue' ? 'text-cross-deep font-medium' : 'text-muted'}`}>
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            {editing ? (
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="input !py-1 text-xs" />
            ) : (
              <span>{fmtDate(task.due)}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <Flag className="h-3.5 w-3.5 shrink-0" />
            {editing ? (
              <select value={priority} onChange={(e) => setPriority(e.target.value as Priority | '')} className="input !py-1 text-xs">
                <option value="">Geen</option>
                {PRIORITY_ORDER.map((p) => (
                  <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
                ))}
              </select>
            ) : task.priority ? (
              <span className={`chip !py-0 ${PRIORITY_STYLE[task.priority]}`}>{PRIORITY_LABEL[task.priority]}</span>
            ) : (
              <span className="text-faint">geen prioriteit</span>
            )}
          </div>
        </div>

        {/* one-tap reschedule, without opening the edit mode first */}
        {task.status === 'open' && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-faint mr-0.5">Verzet naar</span>
            {SNOOZE_OPTIONS.map((o) => (
              <button
                key={o.label}
                onClick={() => { store.updateThread(task.id, { due: o.value }); setDue(o.value ?? '') }}
                className={`chip transition-colors ${
                  (task.due ?? null) === o.value ? 'bg-ink text-canvas' : 'bg-sunken text-muted hover:text-ink'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overzicht</TabsTrigger>
            <TabsTrigger value="activity">Activiteit</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="pt-4 flex flex-col gap-5">
            <div>
              <SectionTitle>Beschrijving</SectionTitle>
              {editing ? (
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="input w-full resize-none"
                  placeholder="Voeg details toe…"
                />
              ) : task.notes ? (
                <p className="text-sm text-ink-soft leading-relaxed whitespace-pre-wrap">{task.notes}</p>
              ) : (
                <p className="text-sm text-faint italic">Geen beschrijving.</p>
              )}
            </div>

            <div>
              <SectionTitle>{checklist.length > 0 ? `Subtaken · ${doneCount}/${checklist.length}` : 'Subtaken'}</SectionTitle>
              {checklist.length > 0 && (
                <div className="mb-3">
                  <SegmentedProgress done={doneCount} total={checklist.length} />
                </div>
              )}
              <div className="flex flex-col gap-2">
                {checklist.map((item) => (
                  <div key={item.id} className="flex items-center gap-2.5 rounded-2xl bg-sunken px-3 py-2.5 group">
                    <button
                      onClick={() => toggleSubtask(item.id)}
                      aria-label={`${item.text} afvinken`}
                      className={`shrink-0 h-5 w-5 rounded-md border flex items-center justify-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                        item.done ? 'bg-forest border-forest text-white' : 'border-line-strong text-transparent hover:border-forest hover:text-forest'
                      }`}
                    >
                      <Check className="h-3 w-3" strokeWidth={2.5} />
                    </button>
                    <span className={`text-sm flex-1 min-w-0 ${item.done ? 'line-through text-faint' : 'text-ink'}`}>{item.text}</span>
                    <button
                      onClick={() => removeSubtask(item.id)}
                      className="text-faint hover:text-cross-deep opacity-0 group-hover:opacity-100 p-1 shrink-0"
                      aria-label="Subtaak verwijderen"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {checklist.length === 0 && <p className="text-sm text-faint italic">Nog geen subtaken.</p>}
              </div>
              <form onSubmit={(e) => { e.preventDefault(); addSubtask() }} className="flex gap-2 mt-2.5">
                <input
                  value={subtaskInput}
                  onChange={(e) => setSubtaskInput(e.target.value)}
                  placeholder="Subtaak toevoegen…"
                  className="input flex-1"
                />
                <button type="submit" className="btn-ghost !px-3" disabled={!subtaskInput.trim()}>
                  <Plus className="h-4 w-4" />
                </button>
              </form>
            </div>
          </TabsContent>

          <TabsContent value="activity" className="pt-4 flex flex-col gap-2.5">
            <ActivityRow icon={Clock} label="Aangemaakt" value={fmtDate(task.createdAt.slice(0, 10))} />
            <ActivityRow icon={Calendar} label="Deadline" value={task.due ? fmtDate(task.due) : 'geen datum'} />
            <ActivityRow
              icon={task.status === 'open' ? AlertCircle : CheckCircle2}
              label="Status"
              value={task.status === 'open' ? 'Open' : 'Afgerond'}
            />
            <ActivityRow icon={Star} label="Belangrijkste vandaag" value={pinned ? 'ja' : 'nee'} />
          </TabsContent>
        </Tabs>
      </div>

      <div className="flex items-center gap-2 px-5 py-4 bg-sunken shrink-0">
        {task.status === 'open' ? (
          <button className="btn-primary flex-1" onClick={() => { store.closeThread(task.id); onClose() }}>
            <CheckCircle2 className="h-4 w-4" /> Afronden
          </button>
        ) : (
          <button className="btn-ghost flex-1" onClick={() => store.reopenThread(task.id)}>
            <RotateCcw className="h-4 w-4" /> Heropenen
          </button>
        )}
        <button className="btn-ghost !px-3 text-cross-deep" onClick={() => setConfirmDelete(true)} aria-label="Verwijderen">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Taak verwijderen?"
          message={`"${task.title}" wordt definitief verwijderd.`}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => { store.deleteThread(task.id); setConfirmDelete(false); onClose() }}
        />
      )}
    </Overlay>
  )
}

// ── new task modal — full creation form ──────────────────────────────────────
function NewTaskModal({ defaultDomain, onClose }: { defaultDomain: Domain; onClose: () => void }) {
  const store = useStore()
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [due, setDue] = useState('')
  const [domain, setDomain] = useState<Domain>(defaultDomain)
  const [priority, setPriority] = useState<Priority>('Medium')
  const [pinToday, setPinToday] = useState(false)

  function submit() {
    const text = title.trim()
    if (!text) return
    store.addTask({
      title: text,
      due: due || null,
      time: null,
      domain,
      priority,
      notes: notes.trim() || undefined,
      focusDate: pinToday ? TODAY : null,
    })
    onClose()
  }

  return (
    <Overlay tone="black-blur" onClose={onClose} panelClassName="bg-surface rounded-3xl w-full max-w-md shadow-2xl max-h-[88vh] overflow-y-auto">
      <form onSubmit={(e) => { e.preventDefault(); submit() }} className="p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <button type="button" className="text-sm text-faint hover:text-ink" onClick={onClose}>Annuleren</button>
          <span className="text-sm font-medium text-ink">Nieuwe taak</span>
          <button type="submit" className="text-sm font-medium text-forest-hi disabled:text-faint disabled:cursor-not-allowed" disabled={!title.trim()}>
            Toevoegen
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted">Titel</label>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className="input w-full" placeholder="Wat moet er gebeuren?" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted">Beschrijving</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="input w-full resize-none"
            placeholder="Voeg details toe… (optioneel)"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted">Deadline</label>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="input" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted">Domein</label>
            <select value={domain} onChange={(e) => setDomain(e.target.value as Domain)} className="input">
              {ALL_DOMAINS.map((d) => (
                <option key={d} value={d}>{DOMAIN_META[d].label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {SNOOZE_OPTIONS.filter((o) => o.value).map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => setDue(o.value ?? '')}
              className={`chip transition-colors ${due === o.value ? 'bg-ink text-canvas' : 'bg-sunken text-muted hover:text-ink'}`}
            >
              {o.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted">Prioriteit</label>
          <div className="grid grid-cols-3 gap-2">
            {PRIORITY_ORDER.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={`btn-ghost !py-2 text-sm justify-center ${priority === p ? '!bg-ink !text-canvas' : ''}`}
              >
                {PRIORITY_LABEL[p]}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setPinToday((v) => !v)}
          aria-pressed={pinToday}
          className={`btn-ghost justify-start ${pinToday ? '!bg-personal/15 !text-personal-deep' : ''}`}
        >
          <Star className={`h-4 w-4 ${pinToday ? 'fill-current' : ''}`} />
          Zet bij mijn belangrijkste taken van vandaag
        </button>
      </form>
    </Overlay>
  )
}

/** Tappable count in the header strip — doubles as the urgency filter. */
function StatTile({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string
  value: number
  tone: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-col items-start gap-0.5 rounded-2xl px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active ? 'bg-ink text-canvas' : 'bg-sunken hover:bg-line'
      }`}
    >
      <span className={`text-lg font-medium tabular-nums leading-none ${active ? 'text-canvas' : tone}`}>{value}</span>
      <span className={`text-[11px] leading-tight ${active ? 'text-canvas/70' : 'text-muted'}`}>{label}</span>
    </button>
  )
}

export default function Tasks({ initialTaskId = null }: { initialTaskId?: string | null } = {}) {
  const store = useStore()
  const { threads } = store
  const [filter, setFilter] = useState<Filter>('all')
  // The stat strip and the "belangrijkste vandaag" banner double as filters —
  // 'pinned' is the one that isn't an urgency bucket, so it's its own value.
  const [urgencyFilter, setUrgencyFilter] = useState<TaskUrgency | 'pinned' | null>(null)
  const [query, setQuery] = useState('')
  const [quickInput, setQuickInput] = useState('')
  const [sort, setSort] = useState<SortMode>('urgency')
  const [showDone, setShowDone] = useState(false)
  const [creating, setCreating] = useState(false)
  // Deep link (e.g. an Android widget tap) opens straight to this task.
  const [openId, setOpenId] = useState<string | null>(initialTaskId)
  const [confirmClearDone, setConfirmClearDone] = useState(false)

  const matchesFilter = (d: Domain) => (filter === 'all' ? true : filter === 'personal' ? d === 'personal' : WORK_DOMAINS.includes(d))
  const defaultDomain: Domain = filter === 'work' ? 'prjct' : 'personal'

  const scoped = threads.filter((t) => matchesFilter(t.domain))
  const counts = taskCounts(scoped)

  const q = query.trim().toLowerCase()
  const visible = q ? scoped.filter((t) => t.title.toLowerCase().includes(q) || (t.notes ?? '').toLowerCase().includes(q)) : scoped

  const openTasks = visible.filter((t) => t.status === 'open')
  const filteredOpen = urgencyFilter
    ? openTasks.filter((t) => {
        if (urgencyFilter === 'pinned') return t.focusDate === TODAY
        const u = taskUrgency(t.due)
        // "deze week" in the strip covers tomorrow through day seven, matching
        // the count it shows — a single-bucket filter would contradict it.
        if (urgencyFilter === 'week') return u === 'tomorrow' || u === 'week'
        return u === urgencyFilter
      })
    : openTasks
  const groups = useMemo(() => groupByUrgency(filteredOpen, sort), [filteredOpen, sort])
  const done = sortTasks(visible.filter((t) => t.status === 'closed'), 'created')

  const overdue = openTasks.filter((t) => taskUrgency(t.due) === 'overdue')
  const pinnedToday = scoped.filter((t) => t.focusDate === TODAY)
  const pinnedDone = pinnedToday.filter((t) => t.status === 'closed').length

  const openTask = openId ? threads.find((t) => t.id === openId) ?? null : null

  // Live read of what the quick-add line will actually create — the parser
  // picks a domain/deadline/priority out of the sentence, and silently
  // guessing wrong is worse than showing the guess before you hit enter.
  const quickPreview = useMemo(() => {
    const text = quickInput.trim()
    if (text.length < 3) return null
    const draft = parseTaskDraft(text)
    return matchesFilter(draft.domain) ? draft : { ...draft, domain: defaultDomain }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickInput, filter])

  function addQuick() {
    const text = quickInput.trim()
    if (!text) return
    const draft = parseTaskDraft(text)
    if (!matchesFilter(draft.domain)) draft.domain = defaultDomain
    store.addTask(draft)
    setQuickInput('')
  }

  function toggleUrgencyFilter(u: TaskUrgency | 'pinned') {
    setUrgencyFilter((prev) => (prev === u ? null : u))
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sunken">
          <CheckSquare className="h-5 w-5 text-ink-soft" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-medium text-ink">Taken</h1>
          <p className="text-muted text-sm mt-0.5">
            {counts.overdue > 0
              ? `${counts.overdue} te laat — die eerst`
              : counts.today > 0
                ? `${counts.today} voor vandaag`
                : counts.open > 0
                  ? `${counts.open} open, niks over tijd`
                  : 'Alles afgerond 🎉'}
          </p>
        </div>
      </div>

      {/* ── urgentie in één oogopslag — elk vak is ook het filter ───────────── */}
      <div className="grid grid-cols-4 gap-2">
        <StatTile
          label="te laat"
          value={counts.overdue}
          tone={counts.overdue > 0 ? 'text-cross-deep' : 'text-ink'}
          active={urgencyFilter === 'overdue'}
          onClick={() => toggleUrgencyFilter('overdue')}
        />
        <StatTile
          label="vandaag"
          value={counts.today}
          tone={counts.today > 0 ? 'text-personal-deep' : 'text-ink'}
          active={urgencyFilter === 'today'}
          onClick={() => toggleUrgencyFilter('today')}
        />
        <StatTile
          label="deze week"
          value={counts.week}
          tone="text-ink"
          active={urgencyFilter === 'week'}
          onClick={() => toggleUrgencyFilter('week')}
        />
        <StatTile
          label="geen datum"
          value={counts.undated}
          tone="text-ink"
          active={urgencyFilter === 'none'}
          onClick={() => toggleUrgencyFilter('none')}
        />
      </div>

      {pinnedToday.length > 0 && (
        <button
          onClick={() => toggleUrgencyFilter('pinned')}
          aria-pressed={urgencyFilter === 'pinned'}
          className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-left transition-colors ${
            urgencyFilter === 'pinned' ? 'bg-personal/20' : 'bg-personal/10 hover:bg-personal/15'
          }`}
        >
          <Star className="h-4 w-4 shrink-0 fill-personal text-personal" />
          <span className="text-xs text-personal-deep flex-1">
            {pinnedDone}/{pinnedToday.length} van je belangrijkste taken vandaag afgerond
          </span>
          <span className="text-[11px] text-personal-deep/70 shrink-0">
            {urgencyFilter === 'pinned' ? 'toon alles' : 'alleen deze'}
          </span>
        </button>
      )}

      {/* ── snel toevoegen — de primaire manier om iets kwijt te raken ──────── */}
      <div className="flex flex-col gap-2">
        <form onSubmit={(e) => { e.preventDefault(); addQuick() }} className="flex gap-2">
          <input
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            placeholder="Snel toevoegen…"
            className="input flex-1"
          />
          <button type="submit" className="btn-primary !px-4" disabled={!quickInput.trim()} aria-label="Taak toevoegen">
            <Plus className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setCreating(true)} className="btn-ghost !px-3" aria-label="Uitgebreid toevoegen" title="Uitgebreid toevoegen">
            <Pencil className="h-4 w-4" />
          </button>
        </form>
        {quickPreview ? (
          <div className="flex items-center gap-1.5 flex-wrap px-1">
            <Sparkles className="h-3 w-3 text-faint" />
            <span className="text-[11px] text-faint">wordt:</span>
            <DomainChip domain={quickPreview.domain} small />
            <span className={`chip !py-0 ${URGENCY_META[taskUrgency(quickPreview.due)].pill}`}>{urgencyBadge(quickPreview.due)}</span>
            <span className={`chip !py-0 ${PRIORITY_STYLE[quickPreview.priority]}`}>{PRIORITY_LABEL[quickPreview.priority]}</span>
          </div>
        ) : (
          <p className="px-1 text-[11px] text-faint">
            Typ gewoon een zin — “morgen offerte Van Dijk sturen, urgent” wordt een taak met datum, domein en prioriteit.
          </p>
        )}
      </div>

      {/* ── zoeken, scope en sortering ─────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-faint absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Zoek in taken…" className="input w-full pl-9" />
            {q && (
              <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-faint hover:text-ink" aria-label="Zoekopdracht wissen">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="btn-ghost !px-3 shrink-0" aria-label="Sorteren">
                <ArrowDownWideNarrow className="h-4 w-4" />
                <span className="hidden sm:inline text-xs">{SORT_LABEL[sort]}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Sorteer op</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(Object.keys(SORT_LABEL) as SortMode[]).map((m) => (
                <DropdownMenuItem key={m} onClick={() => setSort(m)}>
                  {SORT_LABEL[m]}
                  {sort === m && <Check className="ml-auto h-3.5 w-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-1 rounded-2xl bg-sunken p-1">
          {(['all', 'personal', 'work'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                filter === f ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
              }`}
            >
              {f === 'all' ? 'Alles' : f === 'personal' ? 'Persoonlijk' : 'Werk'}
            </button>
          ))}
        </div>

        {urgencyFilter && (
          <button onClick={() => setUrgencyFilter(null)} className="self-start chip bg-sunken text-muted hover:text-ink">
            <X className="h-3 w-3" /> filter wissen
          </button>
        )}
      </div>

      {/* ── de lijst, gegroepeerd op hoe laat iets is ───────────────────────── */}
      {groups.length ? (
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <div key={g.urgency} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 px-1">
                <span className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${URGENCY_META[g.urgency].dot}`} aria-hidden />
                  <span className={`text-[11px] font-medium uppercase tracking-wider ${URGENCY_META[g.urgency].text}`}>
                    {URGENCY_META[g.urgency].label}
                  </span>
                  <span className="text-[11px] text-faint tabular-nums">{g.tasks.length}</span>
                </span>
                {g.urgency === 'overdue' && g.tasks.length > 1 && (
                  <button
                    onClick={() => g.tasks.forEach((t) => store.updateThread(t.id, { due: TODAY }))}
                    className="text-[11px] text-muted hover:text-ink"
                  >
                    alles naar vandaag
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {g.tasks.map((t) => <TaskListItem key={t.id} task={t} onOpen={() => setOpenId(t.id)} />)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty>
          {q || urgencyFilter ? 'Geen taken die hierop matchen.' : 'Geen open taken hier. 🎉'}
        </Empty>
      )}

      {overdue.length > 0 && urgencyFilter !== 'overdue' && (
        <p className="px-1 text-[11px] leading-relaxed text-faint">
          Te laat betekent niet automatisch belangrijk — zet met ★ de paar taken op vandaag die er echt toe doen, die staan
          dan boven op je dashboard.
        </p>
      )}

      {done.length > 0 && (
        <div className="pt-1 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <button onClick={() => setShowDone((v) => !v)} className="flex items-center gap-1 text-xs text-faint hover:text-ink">
              {showDone ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              Afgerond ({done.length})
            </button>
            {showDone && (
              <button onClick={() => setConfirmClearDone(true)} className="flex items-center gap-1 text-xs text-faint hover:text-cross-deep">
                <Eraser className="h-3.5 w-3.5" /> opruimen
              </button>
            )}
          </div>
          {showDone && (
            <div className="flex flex-col gap-2">
              {done.map((t) => <TaskListItem key={t.id} task={t} onOpen={() => setOpenId(t.id)} />)}
            </div>
          )}
        </div>
      )}

      {creating && <NewTaskModal defaultDomain={defaultDomain} onClose={() => setCreating(false)} />}
      {openTask && <TaskDetailOverlay task={openTask} onClose={() => setOpenId(null)} />}
      {confirmClearDone && (
        <ConfirmDialog
          title={`${done.length} afgeronde ${done.length === 1 ? 'taak' : 'taken'} verwijderen?`}
          message="Deze verdwijnen definitief uit je lijst."
          onCancel={() => setConfirmClearDone(false)}
          onConfirm={() => { done.forEach((t) => store.deleteThread(t.id)); setConfirmClearDone(false) }}
        />
      )}
    </div>
  )
}
