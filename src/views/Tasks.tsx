import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { TODAY, DOMAIN_META, daysBetween } from '../domains'
import { dueLabel } from '../lib/dates'
import { DomainChip, Empty } from '../components/ui'
import { parseTaskDraft } from '../heyra/skills'
import type { Domain, Thread } from '../types'
import {
  CheckSquare, Plus, CheckCircle2, RotateCcw, Trash2, Pencil, Check, ChevronDown, ChevronRight,
} from 'lucide-react'

const WORK_DOMAINS: Domain[] = ['parkingyou', 'prjct', 'buurtkaart', 'cross']
const ALL_DOMAINS: Domain[] = ['parkingyou', 'prjct', 'buurtkaart', 'personal', 'cross']

interface Column {
  key: 'personal' | 'work'
  label: string
  hint: string
  defaultDomain: Domain
  match: (d: Domain) => boolean
}

const COLUMNS: Column[] = [
  { key: 'personal', label: 'Persoonlijk', hint: 'Alles wat bij jouw leven hoort, niet bij het werk.', defaultDomain: 'personal', match: (d) => d === 'personal' },
  { key: 'work', label: 'Werk', hint: 'ParkingYou, PRJCT, Buurtkaart en cross-business taken.', defaultDomain: 'prjct', match: (d) => WORK_DOMAINS.includes(d) },
]

function TaskRow({ task }: { task: Thread }) {
  const store = useStore()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [due, setDue] = useState(task.due ?? '')
  const [domain, setDomain] = useState<Domain>(task.domain)
  const dueInfo = dueLabel(task.due, { prefix: 'deadline ', active: task.status === 'open' })

  function save() {
    store.updateThread(task.id, { title: title.trim() || task.title, due: due || null, domain })
    setEditing(false)
  }

  return (
    <div className="card p-4">
      {editing ? (
        <div className="flex flex-col gap-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="input w-full" placeholder="Taak" />
          <div className="grid grid-cols-2 gap-2.5">
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="input" />
            <select value={domain} onChange={(e) => setDomain(e.target.value as Domain)} className="input">
              {ALL_DOMAINS.map((d) => (
                <option key={d} value={d}>{DOMAIN_META[d].label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary !py-1.5 text-xs" onClick={save}>
              <Check className="h-3.5 w-3.5" /> Opslaan
            </button>
            <button className="btn-ghost !py-1.5 text-xs" onClick={() => setEditing(false)}>Annuleren</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <DomainChip domain={task.domain} small />
              <span className={`text-[11px] ${dueInfo.overdue ? 'text-cross font-medium' : 'text-faint'}`}>
                {dueInfo.label}
              </span>
            </div>
            <p className={`text-sm mt-1 truncate ${task.status === 'closed' ? 'text-faint line-through' : 'text-ink'}`}>{task.title}</p>
            <p className="text-[11px] text-faint mt-0.5">→ {task.owedTo}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {task.status === 'open' ? (
              <>
                <button className="text-faint hover:text-ink p-2 rounded-lg hover:bg-sunken" onClick={() => setEditing(true)} aria-label="Bewerken">
                  <Pencil className="h-4 w-4" />
                </button>
                <button className="text-faint hover:text-buurtkaart-deep p-2 rounded-lg hover:bg-sunken" onClick={() => store.closeThread(task.id)} aria-label="Afronden">
                  <CheckCircle2 className="h-4 w-4" />
                </button>
              </>
            ) : (
              <button className="text-faint hover:text-ink p-2 rounded-lg hover:bg-sunken" onClick={() => store.reopenThread(task.id)} aria-label="Heropenen">
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
            <button className="text-faint hover:text-cross-deep p-2 rounded-lg hover:bg-sunken" onClick={() => store.deleteThread(task.id)} aria-label="Verwijderen">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function TaskColumn({ column }: { column: Column }) {
  const store = useStore()
  const [input, setInput] = useState('')
  const [showDone, setShowDone] = useState(false)

  const all = store.threads.filter((t) => column.match(t.domain))
  const open = all
    .filter((t) => t.status === 'open')
    .sort((a, b) => (a.due ? daysBetween(TODAY, a.due) : 999) - (b.due ? daysBetween(TODAY, b.due) : 999))
  const done = all.filter((t) => t.status === 'closed')

  function addQuick() {
    const text = input.trim()
    if (!text) return
    const draft = parseTaskDraft(text)
    // keep the quick-add in this column unless the parser clearly picked a
    // domain that already belongs here (e.g. typing "parkingyou" in Werk).
    if (!column.match(draft.domain)) draft.domain = column.defaultDomain
    store.addTask(draft)
    setInput('')
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{column.label} · {open.length} open</p>
        <p className="text-xs text-faint mt-0.5">{column.hint}</p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); addQuick() }} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Nieuwe taak…"
          className="input flex-1"
        />
        <button type="submit" className="btn-primary !px-4" disabled={!input.trim()}>
          <Plus className="h-4 w-4" />
        </button>
      </form>

      {open.length ? (
        <div className="flex flex-col gap-2.5">
          {open.map((t) => <TaskRow key={t.id} task={t} />)}
        </div>
      ) : (
        <Empty>Geen open taken hier. 🎉</Empty>
      )}

      {done.length > 0 && (
        <div className="pt-1">
          <button
            onClick={() => setShowDone((v) => !v)}
            className="flex items-center gap-1 text-xs text-faint hover:text-ink"
          >
            {showDone ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Afgerond ({done.length})
          </button>
          {showDone && (
            <div className="flex flex-col gap-2.5 mt-3">
              {done.map((t) => <TaskRow key={t.id} task={t} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Tasks() {
  const { threads } = useStore()
  const open = threads.filter((t) => t.status === 'open')

  const stats = useMemo(() => {
    const personal = open.filter((t) => t.domain === 'personal').length
    const work = open.filter((t) => WORK_DOMAINS.includes(t.domain)).length
    return { personal, work }
  }, [open])

  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sunken">
          <CheckSquare className="h-5 w-5 text-ink-soft" />
        </span>
        <div>
          <h1 className="text-xl font-medium text-ink">Taken</h1>
          <p className="text-muted text-sm mt-0.5">{stats.personal} persoonlijk · {stats.work} werk</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {COLUMNS.map((c) => (
          <TaskColumn key={c.key} column={c} />
        ))}
      </div>
    </div>
  )
}
