import { useMemo, useState } from 'react'
import {
  X, FolderKanban, Plus, Check, Clock, Trash2, Pencil, Repeat,
  Flag, Timer, FileText, Sparkles, ListChecks, Info,
} from 'lucide-react'
import type { Project, ProjectTask, ProjectMilestone, Invoice, Recurrence, Priority } from '../types'
import { fmtDate, TODAY, daysBetween } from '../domains'
import { Pill, ConfirmDialog } from '../components/ui'
import { useStore } from '../store'
import ProjectForm from './ProjectForm'
import {
  eur, CRM_STATUS, STATUS_HEX, PRIO_HEX, PRIO_NL,
  SheetShell, Field, TextInput, SelectInput,
} from '../components/crm'
import type { ActivityAnalysis } from '../lib/crm/activityAnalyzer'

const DOMAIN_COLOR: Record<string, string> = {
  parkingyou: '#6E8CA8', prjct: '#9385B0', buurtkaart: '#6FA07C', personal: '#C6A05B', cross: '#C58392',
}
const INVOICE_STATUS: Record<Invoice['status'], { label: string; hex: string }> = {
  draft: { label: 'Concept', hex: '#8C9080' },
  sent: { label: 'Verstuurd', hex: '#6E8CA8' },
  paid: { label: 'Betaald', hex: '#6FA07C' },
  overdue: { label: 'Te laat', hex: '#C58392' },
}
const RECUR_NL: Record<Recurrence, string> = { daily: 'dagelijks', weekly: 'wekelijks', monthly: 'maandelijks' }

function dl(iso: string | null): { label: string; urgent: boolean } | null {
  if (!iso) return null
  const d = daysBetween(TODAY, iso)
  if (d < 0) return { label: `${-d}d te laat`, urgent: true }
  if (d === 0) return { label: 'vandaag', urgent: true }
  if (d <= 7) return { label: `over ${d}d`, urgent: true }
  return { label: fmtDate(iso), urgent: false }
}

type Tab = 'details' | 'taken' | 'mijlpalen' | 'uren' | 'facturen' | 'activiteit'

export default function ProjectDetail({ project: initial, onClose }: { project: Project; onClose: () => void }) {
  // Always read the live row from the store so edits/realtime reflect instantly.
  const project = useStore((s) => s.projects.find((p) => p.id === initial.id)) ?? initial
  const { clients, deleteProject } = useStore()
  // Select the raw (stable-reference) arrays and filter locally — a selector that
  // allocates a new array every call (e.g. `s.x.filter(...)`) breaks zustand v5's
  // useSyncExternalStore snapshot check and causes an infinite render loop.
  const allTasks = useStore((s) => s.projectTasks)
  const allMilestones = useStore((s) => s.projectMilestones)
  const allHours = useStore((s) => s.projectHours)
  const allInvoices = useStore((s) => s.projectInvoices)
  const tasks = allTasks.filter((t) => t.projectId === project.id)
  const milestones = allMilestones.filter((m) => m.projectId === project.id)
  const hours = allHours.filter((h) => h.projectId === project.id)
  const invoices = allInvoices.filter((i) => i.projectId === project.id)

  const [tab, setTab] = useState<Tab>('details')
  const [editing, setEditing] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  const client = clients.find((c) => c.id === project.clientId)
  const iconColor = DOMAIN_COLOR[project.domain] ?? '#9385B0'
  const crmStatus = CRM_STATUS[project.status]
  const statusColor = STATUS_HEX[crmStatus]

  const doneTasks = tasks.filter((t) => t.done).length
  const taskPct = tasks.length ? doneTasks / tasks.length : 0
  const msPct = milestones.length ? milestones.reduce((a, m) => a + m.progress, 0) / milestones.length : 0
  const computed = tasks.length || milestones.length
    ? (taskPct * tasks.length + msPct * milestones.length) / (tasks.length + milestones.length)
    : project.progress
  const totalHours = hours.reduce((a, h) => a + h.hours, 0)
  const invoiced = invoices.reduce((a, i) => a + i.amount, 0)
  const paid = invoices.filter((i) => i.status === 'paid').reduce((a, i) => a + i.amount, 0)

  const TABS: { id: Tab; label: string; icon: typeof Info; count?: number }[] = [
    { id: 'details', label: 'Details', icon: Info },
    { id: 'taken', label: 'Taken', icon: ListChecks, count: tasks.filter((t) => !t.done).length },
    { id: 'mijlpalen', label: 'Mijlpalen', icon: Flag, count: milestones.filter((m) => !m.done).length },
    { id: 'uren', label: 'Uren', icon: Timer },
    { id: 'facturen', label: 'Facturen', icon: FileText, count: invoices.length },
    { id: 'activiteit', label: 'Activiteit', icon: Sparkles },
  ]

  return (
    <>
      <SheetShell onClose={onClose} panelClassName="md:max-w-xl md:max-h-[92dvh] max-h-[94dvh]">

        {/* Header */}
        <div className="flex items-start gap-3 p-5 pb-3 border-b border-line shrink-0">
          <span className="h-11 w-11 rounded-3xl flex items-center justify-center shrink-0" style={{ background: `${iconColor}28` }}>
            <FolderKanban className="h-5 w-5" style={{ color: iconColor }} />
          </span>
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="font-semibold text-lg leading-tight truncate">{project.name}</div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Pill hex={statusColor} className="text-[11px] font-semibold px-2 py-0.5 rounded-full">{crmStatus}</Pill>
              {(client?.name || project.client) && <span className="text-xs text-faint truncate">{client?.name ?? project.client}</span>}
            </div>
          </div>
          <button onClick={() => setEditing(true)} title="Bewerken" className="h-8 w-8 rounded-full bg-sunken flex items-center justify-center text-muted hover:text-ink shrink-0"><Pencil className="h-4 w-4" /></button>
          <button onClick={() => setConfirmDel(true)} title="Verwijderen" className="h-8 w-8 rounded-full bg-sunken flex items-center justify-center text-muted hover:text-red-500 shrink-0"><Trash2 className="h-4 w-4" /></button>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-sunken flex items-center justify-center text-muted hover:text-ink shrink-0"><X className="h-4 w-4" /></button>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-3 divide-x divide-line border-b border-line shrink-0">
          <Stat label="Prijs" value={eur(project.value)} />
          <Stat label="Uren" value={`${totalHours}u`} />
          <Stat label="Voortgang" value={`${Math.round(computed * 100)}%`} />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-3 py-2 overflow-x-auto border-b border-line shrink-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`chip whitespace-nowrap ${tab === t.id ? 'bg-forest text-white' : 'bg-surface border border-line text-muted'}`}
            >
              <t.icon className="h-3.5 w-3.5" /> {t.label}{t.count ? ` ·${t.count}` : ''}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'details' && <Details project={project} invoiced={invoiced} paid={paid} />}
          {tab === 'taken' && <Tasks projectId={project.id} tasks={tasks} />}
          {tab === 'mijlpalen' && <Milestones projectId={project.id} milestones={milestones} />}
          {tab === 'uren' && <Hours projectId={project.id} />}
          {tab === 'facturen' && <Invoices projectId={project.id} invoices={invoices} />}
          {tab === 'activiteit' && <Activity projectId={project.id} />}
        </div>
      </SheetShell>

      {editing && <ProjectForm project={project} onClose={() => setEditing(false)} />}
      {confirmDel && (
        <ConfirmDialog
          title={`Project “${project.name}” verwijderen?`}
          message="Alle taken, mijlpalen, uren en facturen van dit project worden ook verwijderd."
          onCancel={() => setConfirmDel(false)}
          onConfirm={() => { deleteProject(project.id); onClose() }}
        />
      )}
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2.5 text-center">
      <div className="text-base font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-faint">{label}</div>
    </div>
  )
}

// ── Details ─────────────────────────────────────────────────────────────────
function Details({ project, invoiced, paid }: { project: Project; invoiced: number; paid: number }) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-surface border border-line overflow-hidden">
        <Row label="Type" value={project.type?.length ? project.type.join(' · ') : '–'} />
        <Row label="Startdatum" value={fmtDate(project.startDate ?? null)} />
        <Row label="Deadline" value={fmtDate(project.deadline)} />
        <Row label="Prioriteit" value={project.priority ? PRIO_NL[project.priority] : '–'} />
        <Row label="Prijs" value={eur(project.value)} />
        <Row label="Gefactureerd" value={`${eur(invoiced)} · ${eur(paid)} betaald`} />
      </div>

      {project.scope && (
        <Block title="Scope"><p className="text-sm text-ink-soft whitespace-pre-wrap leading-relaxed">{project.scope}</p></Block>
      )}
      {project.deliverables && project.deliverables.length > 0 && (
        <Block title="Deliverables">
          <ul className="space-y-1.5">
            {project.deliverables.map((d, i) => (
              <li key={i} className="text-sm flex items-start gap-2"><span className="h-1.5 w-1.5 rounded-full bg-forest mt-1.5 shrink-0" />{d}</li>
            ))}
          </ul>
        </Block>
      )}
      {project.notes && (
        <Block title="Notities"><p className="text-sm text-ink-soft whitespace-pre-wrap leading-relaxed">{project.notes}</p></Block>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-line last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  )
}
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface border border-line p-4">
      <div className="text-[11px] font-bold text-faint uppercase tracking-wider mb-2">{title}</div>
      {children}
    </div>
  )
}

// ── Tasks ───────────────────────────────────────────────────────────────────
function Tasks({ projectId, tasks }: { projectId: string; tasks: ProjectTask[] }) {
  const { toggleProjectTask, deleteProjectTask } = useStore()
  const open = tasks.filter((t) => !t.done)
  const done = tasks.filter((t) => t.done)
  const [showDone, setShowDone] = useState(false)

  return (
    <div className="space-y-3">
      <AddTask projectId={projectId} />
      <div className="rounded-2xl bg-surface border border-line overflow-hidden">
        {open.length === 0 && <div className="px-4 py-4 text-sm text-faint">Nog geen open taken.</div>}
        {open.map((t) => <TaskRow key={t.id} t={t} onToggle={() => toggleProjectTask(t.id, true)} onDelete={() => deleteProjectTask(t.id)} />)}
        {done.length > 0 && (
          <>
            <button onClick={() => setShowDone(!showDone)} className="w-full px-4 py-2 bg-sunken border-t border-line text-xs text-faint font-semibold text-left">
              {showDone ? '▾' : '▸'} {done.length} afgerond
            </button>
            {showDone && done.map((t) => <TaskRow key={t.id} t={t} onToggle={() => toggleProjectTask(t.id, false)} onDelete={() => deleteProjectTask(t.id)} />)}
          </>
        )}
      </div>
    </div>
  )
}

function TaskRow({ t, onToggle, onDelete }: { t: ProjectTask; onToggle: () => void; onDelete: () => void }) {
  const d = t.dueDate ? dl(t.dueDate) : null
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-line last:border-0 group">
      <button onClick={onToggle} className="shrink-0 h-5 w-5 rounded-md border flex items-center justify-center" style={{ background: t.done ? '#6FA07C' : 'transparent', borderColor: t.done ? '#6FA07C' : '#C8C8CC' }}>
        {t.done && <Check className="h-3 w-3 text-white" strokeWidth={2.5} />}
      </button>
      <div className="flex-1 min-w-0">
        <div className={`text-sm leading-snug ${t.done ? 'line-through text-faint' : 'text-ink'}`}>{t.name}</div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {t.recurrence && <span className="text-[11px] text-prjct-deep flex items-center gap-1"><Repeat className="h-2.5 w-2.5" /> {RECUR_NL[t.recurrence]}</span>}
          {d && <span className={`text-[11px] flex items-center gap-1 ${d.urgent ? 'text-personal-deep' : 'text-faint'}`}><Clock className="h-2.5 w-2.5" /> {d.label}</span>}
          {t.priority && <span className="text-[11px] font-semibold" style={{ color: PRIO_HEX[t.priority] }}>{PRIO_NL[t.priority]}</span>}
        </div>
      </div>
      <button onClick={onDelete} className="text-faint hover:text-red-400 opacity-0 group-hover:opacity-100 px-1 shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  )
}

function AddTask({ projectId }: { projectId: string }) {
  const { addProjectTask } = useStore()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [due, setDue] = useState('')
  const [priority, setPriority] = useState<Priority | ''>('')
  const [recurrence, setRecurrence] = useState<Recurrence | ''>('')

  function submit() {
    if (!name.trim()) return
    addProjectTask(projectId, {
      name: name.trim(), done: false, dueDate: due || null,
      priority: (priority || null) as Priority | null,
      recurrence: (recurrence || null) as Recurrence | null,
      recurEvery: 1,
    })
    setName(''); setDue(''); setPriority(''); setRecurrence('')
  }

  if (!open) return (
    <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-sm text-forest font-medium"><Plus className="h-4 w-4" /> Taak toevoegen</button>
  )
  return (
    <div className="rounded-2xl bg-surface border border-line p-3 space-y-2">
      <TextInput value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="Taaknaam…" autoFocus />
      <div className="grid grid-cols-3 gap-2">
        <TextInput type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        <SelectInput value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
          <option value="">Prio</option><option value="High">Hoog</option><option value="Medium">Gem.</option><option value="Low">Laag</option>
        </SelectInput>
        <SelectInput value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
          <option value="">Eenmalig</option><option value="daily">Dagelijks</option><option value="weekly">Wekelijks</option><option value="monthly">Maandelijks</option>
        </SelectInput>
      </div>
      <div className="flex gap-2">
        <button onClick={submit} disabled={!name.trim()} className="flex-1 py-1.5 rounded-lg bg-forest text-white text-sm font-semibold disabled:opacity-40">Toevoegen</button>
        <button onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-lg bg-sunken text-muted text-sm border border-line">Klaar</button>
      </div>
    </div>
  )
}

// ── Milestones ──────────────────────────────────────────────────────────────
function Milestones({ projectId, milestones }: { projectId: string; milestones: ProjectMilestone[] }) {
  const { addMilestone, updateMilestone, deleteMilestone } = useStore()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')

  const sorted = [...milestones].sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))

  function add() {
    if (!title.trim()) return
    addMilestone(projectId, { title: title.trim(), dueDate: due || null, progress: 0, done: false })
    setTitle(''); setDue(''); setOpen(false)
  }

  return (
    <div className="space-y-3">
      {!open ? (
        <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-sm text-forest font-medium"><Plus className="h-4 w-4" /> Mijlpaal toevoegen</button>
      ) : (
        <div className="rounded-2xl bg-surface border border-line p-3 space-y-2">
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Mijlpaal…" autoFocus />
          <div className="flex gap-2">
            <TextInput type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            <button onClick={add} disabled={!title.trim()} className="px-3 py-1.5 rounded-lg bg-forest text-white text-sm font-semibold disabled:opacity-40">Toevoegen</button>
            <button onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-lg bg-sunken text-muted text-sm border border-line">×</button>
          </div>
        </div>
      )}

      {sorted.length === 0 && <div className="rounded-2xl bg-surface border border-line px-4 py-4 text-sm text-faint">Nog geen mijlpalen.</div>}
      {sorted.map((m) => {
        const d = m.dueDate ? dl(m.dueDate) : null
        const pct = Math.round(m.progress * 100)
        return (
          <div key={m.id} className="rounded-2xl bg-surface border border-line p-3.5 group">
            <div className="flex items-start gap-2">
              <button onClick={() => updateMilestone(m.id, { done: !m.done })} className="mt-0.5 shrink-0 h-5 w-5 rounded-md border flex items-center justify-center" style={{ background: m.done ? '#6FA07C' : 'transparent', borderColor: m.done ? '#6FA07C' : '#C8C8CC' }}>
                {m.done && <Check className="h-3 w-3 text-white" strokeWidth={2.5} />}
              </button>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium ${m.done ? 'line-through text-faint' : ''}`}>{m.title}</div>
                {d && <span className={`text-[11px] flex items-center gap-1 mt-0.5 ${d.urgent && !m.done ? 'text-personal-deep' : 'text-faint'}`}><Clock className="h-2.5 w-2.5" /> {d.label}</span>}
              </div>
              <span className="text-xs tabular-nums text-muted shrink-0">{pct}%</span>
              <button onClick={() => deleteMilestone(m.id)} className="text-faint hover:text-red-400 opacity-0 group-hover:opacity-100 shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            <input
              type="range" min={0} max={100} value={pct}
              onChange={(e) => updateMilestone(m.id, { progress: parseInt(e.target.value, 10) / 100 })}
              className="w-full mt-2.5 accent-forest"
            />
          </div>
        )
      })}
    </div>
  )
}

// ── Hours ───────────────────────────────────────────────────────────────────
function Hours({ projectId }: { projectId: string }) {
  const hours = useStore((s) => s.projectHours).filter((h) => h.projectId === projectId)
  const { addHours, deleteHours } = useStore()
  const [date, setDate] = useState(TODAY)
  const [val, setVal] = useState('')
  const [note, setNote] = useState('')
  const [billable, setBillable] = useState(true)

  const total = hours.reduce((a, h) => a + h.hours, 0)
  const billableTotal = hours.filter((h) => h.billable).reduce((a, h) => a + h.hours, 0)

  function add() {
    const h = parseFloat(val)
    if (!h || h <= 0) return
    addHours(projectId, { date, hours: h, note: note.trim() || null, billable })
    setVal(''); setNote('')
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 divide-x divide-line rounded-2xl bg-surface border border-line">
        <Stat label="Totaal" value={`${total}u`} />
        <Stat label="Declarabel" value={`${billableTotal}u`} />
      </div>

      <div className="rounded-2xl bg-surface border border-line p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <TextInput type="number" step="0.25" value={val} onChange={(e) => setVal(e.target.value)} placeholder="uren" />
        </div>
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Waaraan gewerkt? (optioneel)" />
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted flex-1">
            <input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} className="accent-forest" /> Declarabel
          </label>
          <button onClick={add} disabled={!val} className="px-4 py-1.5 rounded-lg bg-forest text-white text-sm font-semibold disabled:opacity-40">Log uren</button>
        </div>
      </div>

      <div className="rounded-2xl bg-surface border border-line overflow-hidden">
        {hours.length === 0 && <div className="px-4 py-4 text-sm text-faint">Nog geen uren gelogd.</div>}
        {hours.map((h) => (
          <div key={h.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-line last:border-0 group">
            <span className="text-sm font-semibold tabular-nums w-12 shrink-0">{h.hours}u</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{h.note || <span className="text-faint">—</span>}</div>
              <div className="text-[11px] text-faint">{fmtDate(h.date)}{!h.billable && ' · niet-declarabel'}</div>
            </div>
            <button onClick={() => deleteHours(h.id)} className="text-faint hover:text-red-400 opacity-0 group-hover:opacity-100 shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Invoices ────────────────────────────────────────────────────────────────
function Invoices({ projectId, invoices }: { projectId: string; invoices: Invoice[] }) {
  const { addInvoice, updateInvoice, deleteInvoice } = useStore()
  const [open, setOpen] = useState(false)
  const [number, setNumber] = useState('')
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState<Invoice['status']>('draft')
  const [issued, setIssued] = useState(TODAY)
  const [due, setDue] = useState('')

  function add() {
    const a = parseFloat(amount)
    if (!a) return
    addInvoice(projectId, { number: number.trim(), amount: a, status, issuedOn: issued || null, dueOn: due || null, paidOn: status === 'paid' ? TODAY : null })
    setNumber(''); setAmount(''); setStatus('draft'); setDue(''); setOpen(false)
  }

  return (
    <div className="space-y-3">
      {!open ? (
        <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-sm text-forest font-medium"><Plus className="h-4 w-4" /> Factuur toevoegen</button>
      ) : (
        <div className="rounded-2xl bg-surface border border-line p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <TextInput value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Factuurnr." />
            <TextInput type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="bedrag €" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <SelectInput value={status} onChange={(e) => setStatus(e.target.value as Invoice['status'])}>
              {Object.entries(INVOICE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </SelectInput>
            <TextInput type="date" value={issued} onChange={(e) => setIssued(e.target.value)} />
            <TextInput type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button onClick={add} disabled={!amount} className="flex-1 py-1.5 rounded-lg bg-forest text-white text-sm font-semibold disabled:opacity-40">Toevoegen</button>
            <button onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-lg bg-sunken text-muted text-sm border border-line">×</button>
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-surface border border-line overflow-hidden">
        {invoices.length === 0 && <div className="px-4 py-4 text-sm text-faint">Nog geen facturen.</div>}
        {invoices.map((inv) => {
          const meta = INVOICE_STATUS[inv.status]
          return (
            <div key={inv.id} className="flex items-center gap-3 px-4 py-3 border-b border-line last:border-0 group">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{inv.number || 'Factuur'} · {eur(inv.amount)}</div>
                <div className="text-[11px] text-faint">{fmtDate(inv.issuedOn ?? null)}{inv.dueOn && ` → ${fmtDate(inv.dueOn)}`}</div>
              </div>
              <select
                value={inv.status}
                onChange={(e) => updateInvoice(inv.id, { status: e.target.value as Invoice['status'], paidOn: e.target.value === 'paid' ? TODAY : null })}
                className="text-[11px] font-semibold rounded-md px-1.5 py-0.5 border-0 outline-none shrink-0"
                style={{ color: meta.hex, background: `${meta.hex}22` }}
              >
                {Object.entries(INVOICE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <button onClick={() => deleteInvoice(inv.id)} className="text-faint hover:text-red-400 opacity-0 group-hover:opacity-100 shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Activity logger ───────────────────────────────────────────────────────────
function Activity({ projectId }: { projectId: string }) {
  const entries = useStore((s) => s.projectActivity).filter((a) => a.projectId === projectId)
  const { logActivity, deleteActivity } = useStore()
  const [text, setText] = useState('')
  const [lastResult, setLastResult] = useState<ActivityAnalysis | null>(null)

  function submit() {
    if (!text.trim()) return
    const result = logActivity(projectId, text.trim())
    setLastResult(result)
    setText('')
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-surface border border-line p-3 space-y-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="bv. ‘Logo afgerond en gemaild naar klant’ — ik koppel het aan de juiste taak/mijlpaal"
          className="w-full text-sm bg-sunken rounded-xl px-3 py-2 outline-none border border-line focus:border-forest resize-none"
        />
        <button onClick={submit} disabled={!text.trim()} className="w-full py-1.5 rounded-lg bg-forest text-white text-sm font-semibold disabled:opacity-40">Loggen &amp; analyseren</button>
        {lastResult && (
          <div className="text-xs rounded-lg px-3 py-2 flex items-start gap-2" style={{ background: lastResult.match ? '#6FA07C18' : '#8C908018' }}>
            <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0 text-forest" />
            <span className="text-ink-soft">{lastResult.reason}{lastResult.match ? ` · ${Math.round(lastResult.confidence * 100)}% zeker` : ''}</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {entries.length === 0 && <div className="rounded-2xl bg-surface border border-line px-4 py-4 text-sm text-faint">Nog geen activiteit.</div>}
        {entries.map((a) => (
          <div key={a.id} className="rounded-2xl bg-surface border border-line p-3 group">
            <p className="text-sm text-ink-soft whitespace-pre-wrap leading-snug">{a.body}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[11px] text-faint">{fmtDate(a.createdAt.slice(0, 10))}</span>
              {a.action && (
                <Pill hex="#6FA07C" className="text-[10px] font-semibold px-1.5 py-0.5 rounded">
                  {a.action === 'completed' ? 'taak afgevinkt' : a.action === 'progress' ? 'voortgang bijgewerkt' : 'gekoppeld'}
                </Pill>
              )}
              <button onClick={() => deleteActivity(a.id)} className="ml-auto text-faint hover:text-red-400 opacity-0 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
