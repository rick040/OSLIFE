import { useState } from 'react'
import { useStore } from '../store'
import { TODAY, DOMAIN_META, daysBetween, fmtDate } from '../domains'
import { dueLabel } from '../lib/dates'
import { DomainChip, Empty, Overlay, ConfirmDialog, SectionTitle, SegmentedProgress } from '../components/ui'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { parseTaskDraft } from '../heyra/skills'
import type { Domain, Thread, Priority, ChecklistItem } from '../types'
import {
  CheckSquare, Plus, CheckCircle2, RotateCcw, Trash2, Pencil, Check, ChevronDown, ChevronRight,
  X, Search, Calendar, User, Flag, ListTodo, Clock, AlertCircle,
} from 'lucide-react'

const WORK_DOMAINS: Domain[] = ['parkingyou', 'prjct', 'buurtkaart', 'cross']
const ALL_DOMAINS: Domain[] = ['parkingyou', 'prjct', 'buurtkaart', 'personal', 'cross']
const PRIORITIES: Priority[] = ['High', 'Medium', 'Low']
const PRIORITY_ORDER: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 }
const PRIORITY_STYLE: Record<Priority, string> = {
  High: 'bg-cross/15 text-cross-deep',
  Medium: 'bg-personal/15 text-personal-deep',
  Low: 'bg-line text-muted',
}

type Filter = 'all' | 'personal' | 'work'

function subtaskId(): string {
  return `chk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** Open tasks first by urgency (soonest/overdue deadline first, no date last), then priority. */
function sortOpen(tasks: Thread[]): Thread[] {
  return [...tasks].sort((a, b) => {
    const da = a.due ? daysBetween(TODAY, a.due) : 9999
    const db = b.due ? daysBetween(TODAY, b.due) : 9999
    if (da !== db) return da - db
    const pa = a.priority ? PRIORITY_ORDER[a.priority] : 3
    const pb = b.priority ? PRIORITY_ORDER[b.priority] : 3
    return pa - pb
  })
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

// ── task row — the scannable card in the list, opens the detail overlay ─────
function TaskListItem({ task, onOpen }: { task: Thread; onOpen: () => void }) {
  const store = useStore()
  const dueInfo = dueLabel(task.due, { active: task.status === 'open' })
  const checklist = task.checklist ?? []

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      className="card p-4 flex flex-col gap-2.5 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <DomainChip domain={task.domain} small />
          {task.priority && <span className={`chip !py-0 ${PRIORITY_STYLE[task.priority]}`}>{task.priority}</span>}
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {task.status === 'open' ? (
            <button className="text-faint hover:text-buurtkaart-deep p-1.5 rounded-lg hover:bg-sunken" onClick={() => store.closeThread(task.id)} aria-label="Afronden">
              <CheckCircle2 className="h-4 w-4" />
            </button>
          ) : (
            <button className="text-faint hover:text-ink p-1.5 rounded-lg hover:bg-sunken" onClick={() => store.reopenThread(task.id)} aria-label="Heropenen">
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
          <button className="text-faint hover:text-cross-deep p-1.5 rounded-lg hover:bg-sunken" onClick={() => store.deleteThread(task.id)} aria-label="Verwijderen">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <p className={`text-sm leading-snug ${task.status === 'closed' ? 'text-faint line-through' : 'text-ink'}`}>{task.title}</p>

      <div className="flex items-center gap-3 flex-wrap">
        <span className={`text-[11px] flex items-center gap-1 ${dueInfo.overdue ? 'text-cross-deep font-medium' : 'text-faint'}`}>
          <Calendar className="h-3 w-3" /> {dueInfo.label}
        </span>
        <span className="text-[11px] text-faint flex items-center gap-1 truncate">
          <User className="h-3 w-3" /> {task.owedTo}
        </span>
        {checklist.length > 0 && (
          <span className="text-[11px] text-faint flex items-center gap-1 ml-auto shrink-0">
            <ListTodo className="h-3 w-3" /> {checklist.filter((c) => c.done).length}/{checklist.length}
          </span>
        )}
      </div>
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
  const dueInfo = dueLabel(task.due, { active: task.status === 'open' })

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
            {task.status === 'closed' && <span className="chip bg-buurtkaart/15 text-buurtkaart-deep">Afgerond</span>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
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
          <div className={`flex items-center gap-1.5 text-xs ${dueInfo.overdue ? 'text-cross-deep font-medium' : 'text-muted'}`}>
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            {editing ? (
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="input !py-1 text-xs" />
            ) : (
              <span>{dueInfo.label}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <Flag className="h-3.5 w-3.5 shrink-0" />
            {editing ? (
              <select value={priority} onChange={(e) => setPriority(e.target.value as Priority | '')} className="input !py-1 text-xs">
                <option value="">Geen</option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            ) : task.priority ? (
              <span className={`chip !py-0 ${PRIORITY_STYLE[task.priority]}`}>{task.priority}</span>
            ) : (
              <span className="text-faint">geen prioriteit</span>
            )}
          </div>
        </div>

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

  function submit() {
    const text = title.trim()
    if (!text) return
    store.addTask({ title: text, due: due || null, time: null, domain, priority, notes: notes.trim() || undefined })
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

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted">Prioriteit</label>
          <div className="grid grid-cols-3 gap-2">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={`btn-ghost !py-2 text-sm justify-center ${priority === p ? '!bg-ink !text-canvas' : ''}`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </form>
    </Overlay>
  )
}

export default function Tasks() {
  const store = useStore()
  const { threads } = store
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [quickInput, setQuickInput] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const matchesFilter = (d: Domain) => (filter === 'all' ? true : filter === 'personal' ? d === 'personal' : WORK_DOMAINS.includes(d))
  const defaultDomain: Domain = filter === 'work' ? 'prjct' : 'personal'

  const scoped = threads.filter((t) => matchesFilter(t.domain))
  const q = query.trim().toLowerCase()
  const visible = q ? scoped.filter((t) => t.title.toLowerCase().includes(q) || (t.notes ?? '').toLowerCase().includes(q)) : scoped

  const open = sortOpen(visible.filter((t) => t.status === 'open'))
  const done = visible.filter((t) => t.status === 'closed')
  const overdueCount = scoped.filter((t) => t.status === 'open' && t.due && daysBetween(TODAY, t.due) < 0).length
  const doneCount = scoped.filter((t) => t.status === 'closed').length

  const openTask = openId ? threads.find((t) => t.id === openId) ?? null : null

  function addQuick() {
    const text = quickInput.trim()
    if (!text) return
    const draft = parseTaskDraft(text)
    if (!matchesFilter(draft.domain)) draft.domain = defaultDomain
    store.addTask(draft)
    setQuickInput('')
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sunken">
          <CheckSquare className="h-5 w-5 text-ink-soft" />
        </span>
        <div>
          <h1 className="text-xl font-medium text-ink">Taken</h1>
          <p className="text-muted text-sm mt-0.5">
            {open.length} open{overdueCount > 0 ? ` · ${overdueCount} te laat` : ''} · {doneCount} afgerond
          </p>
        </div>
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

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-faint absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Zoek in taken…" className="input w-full pl-9" />
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary !px-4 shrink-0">
          <Plus className="h-4 w-4" /> Nieuwe taak
        </button>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); addQuick() }} className="flex gap-2">
        <input
          value={quickInput}
          onChange={(e) => setQuickInput(e.target.value)}
          placeholder="Snel toevoegen… (typ en druk op enter)"
          className="input flex-1"
        />
        <button type="submit" className="btn-ghost !px-4" disabled={!quickInput.trim()}>
          <Plus className="h-4 w-4" />
        </button>
      </form>

      {open.length ? (
        <div className="flex flex-col gap-2.5">
          {open.map((t) => <TaskListItem key={t.id} task={t} onOpen={() => setOpenId(t.id)} />)}
        </div>
      ) : (
        <Empty>{q ? 'Geen taken gevonden.' : 'Geen open taken hier. 🎉'}</Empty>
      )}

      {done.length > 0 && (
        <div className="pt-1">
          <button onClick={() => setShowDone((v) => !v)} className="flex items-center gap-1 text-xs text-faint hover:text-ink">
            {showDone ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Afgerond ({done.length})
          </button>
          {showDone && (
            <div className="flex flex-col gap-2.5 mt-3">
              {done.map((t) => <TaskListItem key={t.id} task={t} onOpen={() => setOpenId(t.id)} />)}
            </div>
          )}
        </div>
      )}

      {creating && <NewTaskModal defaultDomain={defaultDomain} onClose={() => setCreating(false)} />}
      {openTask && <TaskDetailOverlay task={openTask} onClose={() => setOpenId(null)} />}
    </div>
  )
}
