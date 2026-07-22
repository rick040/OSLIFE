import { useMemo, useState } from 'react'
import {
  X, FolderKanban, Plus, Check, Clock, Trash2, Pencil, Repeat,
  Flag, Timer, FileText, Sparkles, ListChecks, Info, Mic, Loader2, Square,
} from 'lucide-react'
import type { Project, ProjectTask, ProjectMilestone, Invoice, Recurrence, Priority } from '../types'
import { fmtDate, TODAY } from '../domains'
import { deadlineInfo } from '../lib/dates'
import { Pill, ConfirmDialog } from '../components/ui'
import { useStore } from '../store'
import { useIsMobile } from '../hooks/use-mobile'
import ProjectForm from './ProjectForm'
import {
  eur, CRM_STATUS, STATUS_HEX, PRIO_HEX, PRIO_NL,
  SheetShell, Field, TextInput, TextArea, SelectInput, RingProgress,
} from '../components/crm'
import type { ActivityAnalysis } from '../lib/crm/activityAnalyzer'
import { unbilledBillableHours, sumHours, invoiceAmountFromHours } from '../lib/crm/invoicing'
import { runTranscriptAnalysis } from '../lib/crm/transcriptAgent'

const DOMAIN_COLOR: Record<string, string> = {
  parkingyou: '#60A5FA', prjct: '#A78BFA', buurtkaart: '#34D399', personal: '#FBBF24', cross: '#F87171',
}
const INVOICE_STATUS: Record<Invoice['status'], { label: string; hex: string }> = {
  draft: { label: 'Concept', hex: '#a3a3a3' },
  sent: { label: 'Verstuurd', hex: '#60A5FA' },
  paid: { label: 'Betaald', hex: '#34D399' },
  overdue: { label: 'Te laat', hex: '#F87171' },
}
const RECUR_NL: Record<Recurrence, string> = { daily: 'dagelijks', weekly: 'wekelijks', monthly: 'maandelijks' }

type Tab = 'overzicht' | 'taken' | 'mijlpalen' | 'uren' | 'facturen' | 'gesprek' | 'activiteit'

export default function ProjectDetail({ project: initial, onClose }: { project: Project; onClose: () => void }) {
  // Always read the live row from the store so edits/realtime reflect instantly.
  const project = useStore((s) => s.projects.find((p) => p.id === initial.id)) ?? initial
  const { clients, deleteProject } = useStore()
  const isMobile = useIsMobile()
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

  const [tab, setTab] = useState<Tab>('taken')
  const [editing, setEditing] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  const client = clients.find((c) => c.id === project.clientId)
  const iconColor = DOMAIN_COLOR[project.domain] ?? '#A78BFA'
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

  const ALL_TABS: { id: Tab; label: string; icon: typeof Info; count?: number; mobileOnly?: boolean }[] = [
    { id: 'overzicht', label: 'Overzicht', icon: Info, mobileOnly: true },
    { id: 'taken', label: 'Taken', icon: ListChecks, count: tasks.filter((t) => !t.done).length },
    { id: 'mijlpalen', label: 'Mijlpalen', icon: Flag, count: milestones.filter((m) => !m.done).length },
    { id: 'uren', label: 'Uren', icon: Timer },
    { id: 'facturen', label: 'Facturen', icon: FileText, count: invoices.length },
    { id: 'gesprek', label: 'Gesprek', icon: Mic },
    { id: 'activiteit', label: 'Activiteit', icon: Sparkles },
  ]
  // Desktop keeps the overview permanently visible in the left column instead
  // of as a tab — a Notion-style "properties panel" that never disappears
  // while you flip between tasks/hours/invoices.
  const TABS = isMobile ? ALL_TABS : ALL_TABS.filter((t) => !t.mobileOnly)

  return (
    <>
      <SheetShell
        onClose={onClose}
        panelClassName="md:max-w-3xl md:max-h-[92dvh] max-h-[94dvh]"
        fullScreenMobile
      >
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

        {/* Desktop: permanent properties sidebar + tabbed content, side by side.
            Mobile: single column, "Overzicht" is just another tab. */}
        <div className="flex-1 overflow-hidden flex flex-col md:grid md:grid-cols-[280px_1fr] md:divide-x md:divide-line min-h-0">
          <aside className="hidden md:flex md:flex-col md:overflow-y-auto p-4">
            <ProjectOverview project={project} invoiced={invoiced} paid={paid} tasks={tasks} milestones={milestones} />
          </aside>

          <div className="flex-1 flex flex-col overflow-hidden min-w-0 min-h-0">
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

            <div className="flex-1 overflow-y-auto p-4">
              {tab === 'overzicht' && <ProjectOverview project={project} invoiced={invoiced} paid={paid} tasks={tasks} milestones={milestones} />}
              {tab === 'taken' && <Tasks projectId={project.id} tasks={tasks} />}
              {tab === 'mijlpalen' && <Milestones projectId={project.id} milestones={milestones} />}
              {tab === 'uren' && <Hours projectId={project.id} />}
              {tab === 'facturen' && <Invoices projectId={project.id} invoices={invoices} />}
              {tab === 'gesprek' && <Transcript project={project} tasks={tasks} />}
              {tab === 'activiteit' && <Activity projectId={project.id} />}
            </div>
          </div>
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

// ── Overview: visual scope/timeline/deliverables + the project's timer ──────
function ProjectOverview({
  project, invoiced, paid, tasks, milestones,
}: { project: Project; invoiced: number; paid: number; tasks: ProjectTask[]; milestones: ProjectMilestone[] }) {
  const activeTimer = useStore((s) => s.activeTimer)
  const { startTimer, stopTimer } = useStore()
  const isTimerForThis = activeTimer?.projectId === project.id
  const doneTasks = tasks.filter((t) => t.done).length
  const taskPct = tasks.length ? doneTasks / tasks.length : 0
  const budgetPct = project.value > 0 ? invoiced / project.value : 0

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <RingProgress pct={taskPct} color="#6FA07C" />
        <div className="min-w-0">
          <div className="text-sm font-semibold">{doneTasks}/{tasks.length} taken afgerond</div>
          <div className="text-xs text-faint mt-0.5">{eur(invoiced)} gefactureerd van {eur(project.value)}</div>
        </div>
      </div>
      {project.value > 0 && (
        <div className="h-1.5 w-full rounded-full bg-line overflow-hidden">
          <div className="h-full rounded-full bg-parkingyou-deep transition-all" style={{ width: `${Math.min(100, Math.max(2, budgetPct * 100))}%` }} />
        </div>
      )}

      <button
        onClick={() => (isTimerForThis ? stopTimer() : startTimer(project.id, project.name))}
        className={`w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${isTimerForThis ? 'bg-cross/15 text-cross-deep' : 'bg-forest text-white'}`}
      >
        {isTimerForThis ? <><Square className="h-4 w-4" /> Timer stoppen</> : <><Timer className="h-4 w-4" /> Timer starten</>}
      </button>
      {activeTimer && !isTimerForThis && (
        <p className="text-[11px] text-faint text-center -mt-1">Loopt nu voor “{activeTimer.projectName}” — starten hier stopt en logt die eerst.</p>
      )}

      {(project.startDate || project.deadline || milestones.length > 0) && (
        <Block title="Tijdlijn"><ProjectTimelineBar project={project} milestones={milestones} /></Block>
      )}

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

/** Horizontal start→deadline bar with milestone dots + a "today" marker; falls back to a plain list when there's no start/deadline to plot against. */
function ProjectTimelineBar({ project, milestones }: { project: Project; milestones: ProjectMilestone[] }) {
  const start = project.startDate ? new Date(`${project.startDate}T00:00:00`) : null
  const end = project.deadline ? new Date(`${project.deadline}T00:00:00`) : null

  if (!start || !end || end.getTime() <= start.getTime()) {
    if (!milestones.length) return null
    const sorted = [...milestones].sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
    return (
      <div className="space-y-1.5">
        {sorted.map((m) => (
          <div key={m.id} className="flex items-center gap-2 text-xs">
            <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: m.done ? '#6FA07C' : '#C8C8CC' }} />
            <span className="flex-1 truncate">{m.title}</span>
            <span className="text-faint shrink-0">{fmtDate(m.dueDate ?? null)}</span>
          </div>
        ))}
      </div>
    )
  }

  const span = end.getTime() - start.getTime()
  const today = new Date(`${TODAY}T00:00:00`)
  const todayPct = Math.min(1, Math.max(0, (today.getTime() - start.getTime()) / span))

  return (
    <div>
      <div className="relative h-2 rounded-full bg-line mt-1">
        <div className="absolute inset-y-0 left-0 rounded-full bg-forest/40" style={{ width: `${todayPct * 100}%` }} />
        {milestones.map((m) => {
          if (!m.dueDate) return null
          const d = new Date(`${m.dueDate}T00:00:00`)
          const pct = Math.min(1, Math.max(0, (d.getTime() - start.getTime()) / span))
          return (
            <span
              key={m.id}
              title={m.title}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full border-2 border-canvas"
              style={{ left: `${pct * 100}%`, background: m.done ? '#6FA07C' : '#C6A05B' }}
            />
          )
        })}
        <span
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-4 w-1 rounded-full bg-ink"
          style={{ left: `${todayPct * 100}%` }}
          title="Vandaag"
        />
      </div>
      <div className="flex justify-between text-[11px] text-faint mt-1.5">
        <span>{fmtDate(project.startDate ?? null)}</span>
        <span>{fmtDate(project.deadline)}</span>
      </div>
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
  const d = deadlineInfo(t.dueDate ?? null)
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-line last:border-0 group">
      <button onClick={onToggle} className="shrink-0 h-5 w-5 rounded-md border flex items-center justify-center" style={{ background: t.done ? '#34D399' : 'transparent', borderColor: t.done ? '#34D399' : '#C8C8CC' }}>
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
        const d = deadlineInfo(m.dueDate ?? null)
        const pct = Math.round(m.progress * 100)
        return (
          <div key={m.id} className="rounded-2xl bg-surface border border-line p-3.5 group">
            <div className="flex items-start gap-2">
              <button onClick={() => updateMilestone(m.id, { done: !m.done })} className="mt-0.5 shrink-0 h-5 w-5 rounded-md border flex items-center justify-center" style={{ background: m.done ? '#34D399' : 'transparent', borderColor: m.done ? '#34D399' : '#C8C8CC' }}>
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
  const { addHours, deleteHours, generateInvoiceFromHours, settings } = useStore()
  const [date, setDate] = useState(TODAY)
  const [val, setVal] = useState('')
  const [note, setNote] = useState('')
  const [billable, setBillable] = useState(true)

  const total = hours.reduce((a, h) => a + h.hours, 0)
  const billableTotal = hours.filter((h) => h.billable).reduce((a, h) => a + h.hours, 0)
  const unbilled = unbilledBillableHours(hours)
  const unbilledHours = sumHours(unbilled)
  const rate = settings.hourlyRate
  const invoicePreview = invoiceAmountFromHours(unbilled, rate)

  function add() {
    const h = parseFloat(val)
    if (!h || h <= 0) return
    addHours(projectId, { date, hours: h, note: note.trim() || null, billable, billed: false })
    setVal(''); setNote('')
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 divide-x divide-line rounded-2xl bg-surface border border-line">
        <Stat label="Totaal" value={`${total}u`} />
        <Stat label="Declarabel" value={`${billableTotal}u`} />
      </div>

      {unbilledHours > 0 && (
        <button
          onClick={() => generateInvoiceFromHours(projectId)}
          disabled={rate <= 0}
          className="w-full py-2.5 rounded-xl bg-forest text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-1.5"
        >
          <FileText className="h-4 w-4" />
          {rate > 0
            ? `Genereer factuur · ${unbilledHours}u → ${eur(invoicePreview)}`
            : 'Stel eerst een uurtarief in (Instellingen)'}
        </button>
      )}

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
              <div className="text-[11px] text-faint">{fmtDate(h.date)}{!h.billable && ' · niet-declarabel'}{h.billed && ' · gefactureerd'}</div>
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

// ── Meeting transcript ────────────────────────────────────────────────────────
function Transcript({ project, tasks }: { project: Project; tasks: ProjectTask[] }) {
  const { addProjectTask, updateProject, logActivity } = useStore()
  const [raw, setRaw] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [summary, setSummary] = useState('')
  const [newTasks, setNewTasks] = useState<string[]>([])
  const [notesToAdd, setNotesToAdd] = useState('')
  const [fromBrain, setFromBrain] = useState(true)
  const [applied, setApplied] = useState(false)

  const openTasks = useMemo(() => tasks.filter((t) => !t.done), [tasks])

  async function analyze() {
    if (!raw.trim()) return
    setAnalyzing(true)
    setApplied(false)
    try {
      const result = await runTranscriptAnalysis(raw.trim(), project, openTasks)
      setSummary(result.summary)
      setNewTasks(result.newTasks)
      setNotesToAdd(result.notesToAdd)
      setFromBrain(result.fromBrain)
    } finally {
      setAnalyzing(false)
    }
  }

  function apply() {
    newTasks.forEach((name) => {
      if (name.trim()) addProjectTask(project.id, { name: name.trim(), done: false })
    })
    if (notesToAdd.trim()) {
      const heading = `--- Gesprek ${fmtDate(TODAY)} ---\n${notesToAdd.trim()}`
      updateProject(project.id, { notes: project.notes ? `${project.notes}\n\n${heading}` : heading })
    }
    if (summary.trim()) logActivity(project.id, `📞 Gespreksverslag (${fmtDate(TODAY)}): ${summary.trim()}`)
    setApplied(true)
  }

  function reset() {
    setRaw(''); setSummary(''); setNewTasks([]); setNotesToAdd(''); setApplied(false)
  }

  return (
    <div className="space-y-4">
      <Field label="Transcript" hint="plak de tekst van een call- of videomeeting-transcript">
        <TextArea value={raw} onChange={(e) => setRaw(e.target.value)} rows={8} placeholder="Plak hier het transcript…" className="text-sm" />
      </Field>
      <button
        onClick={analyze}
        disabled={!raw.trim() || analyzing}
        className="w-full py-2.5 rounded-xl bg-forest text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {analyzing ? 'Analyseren…' : 'Analyseren met AI'}
      </button>

      {(summary || newTasks.length > 0 || notesToAdd) && (
        <div className="rounded-2xl bg-surface border border-line p-4 space-y-3">
          {!fromBrain && <p className="text-[11px] text-faint">Zonder brein beschikbaar — samenvatting is een ruwe weergave, check en vul aan.</p>}
          <Field label="Samenvatting">
            <TextArea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} className="text-sm" />
          </Field>
          <Field label="Nieuwe taken" hint="één per regel">
            <TextArea
              value={newTasks.join('\n')}
              onChange={(e) => setNewTasks(e.target.value.split('\n').map((t) => t.trim()).filter(Boolean))}
              rows={4}
              className="text-sm"
            />
          </Field>
          <Field label="Toevoegen aan notities">
            <TextArea value={notesToAdd} onChange={(e) => setNotesToAdd(e.target.value)} rows={4} className="text-sm" />
          </Field>

          {applied ? (
            <div className="flex items-center gap-2">
              <span className="btn bg-buurtkaart/15 text-buurtkaart-deep cursor-default flex-1 justify-center"><Check className="h-4 w-4" /> Toegepast</span>
              <button onClick={reset} className="btn-ghost">Nieuw gesprek</button>
            </div>
          ) : (
            <button onClick={apply} className="w-full py-2.5 rounded-xl bg-forest text-white text-sm font-semibold">
              Toepassen op project
            </button>
          )}
        </div>
      )}
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
          <div className="text-xs rounded-lg px-3 py-2 flex items-start gap-2" style={{ background: lastResult.match ? '#34D39918' : '#8c8c8c18' }}>
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
                <Pill hex="#34D399" className="text-[10px] font-semibold px-1.5 py-0.5 rounded">
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
