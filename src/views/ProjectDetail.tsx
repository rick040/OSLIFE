import { useEffect, useRef, useState, useCallback } from 'react'
import { X, FolderKanban, Plus, Check, Clock } from 'lucide-react'
import type { Project, ProjectStatus, Task } from '../types'
import { fmtDate, TODAY } from '../domains'
import { useStore } from '../store'

// ── helpers ───────────────────────────────────────────────────────────────────

const eur = (n: number | null) => {
  if (n == null) return '–'
  if (Math.abs(n) >= 1000) return `€${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return `€${n.toLocaleString('nl-NL')}`
}

const CRM_STATUS: Record<ProjectStatus, string> = {
  active: 'In uitvoering',
  review: 'In uitvoering',
  lead: 'Gepland',
  blocked: 'Gepauzeerd',
  done: 'Opgeleverd',
}

const STATUS_OPTIONS: ProjectStatus[] = ['lead', 'active', 'review', 'blocked', 'done']
const STATUS_LABEL: Record<ProjectStatus, string> = {
  lead: 'Gepland (lead)',
  active: 'In uitvoering',
  review: 'In review',
  blocked: 'Gepauzeerd',
  done: 'Opgeleverd',
}

const STATUS_HEX: Record<string, string> = {
  'In uitvoering': '#6FA07C',
  Gepland: '#6E8CA8',
  Gepauzeerd: '#C6A05B',
  Opgeleverd: '#9385B0',
}

const PRIO_HEX: Record<string, string> = { High: '#C58392', Medium: '#C6A05B', Low: '#8C9080' }
const PRIO_NL: Record<string, string> = { High: 'Hoog', Medium: 'Gemiddeld', Low: 'Laag' }

const DOMAIN_COLOR: Record<string, string> = {
  parkingyou: '#6E8CA8',
  prjct: '#9385B0',
  buurtkaart: '#6FA07C',
  personal: '#C6A05B',
  cross: '#C58392',
}

function deadlineLabel(iso: string | null): { label: string; urgent: boolean } | null {
  if (!iso) return null
  const days = Math.ceil((new Date(iso).getTime() - new Date(TODAY).getTime()) / 86400000)
  if (days < 0) return { label: `${-days}d te laat`, urgent: true }
  if (days === 0) return { label: 'Vandaag', urgent: true }
  if (days <= 7) return { label: `over ${days}d`, urgent: true }
  return { label: fmtDate(iso), urgent: false }
}

// ── TaskItem ──────────────────────────────────────────────────────────────────

function TaskItem({
  task,
  projectId,
}: {
  task: Task
  projectId: string
}) {
  const { toggleProjectTask, deleteProjectTask } = useStore()
  const [hovering, setHovering] = useState(false)

  const dl = task.dueDate ? deadlineLabel(task.dueDate) : null

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className="flex items-center gap-2.5 px-3 py-2.5 border-b border-line last:border-0 hover:bg-sunken transition-colors"
    >
      <button
        onClick={() => toggleProjectTask(projectId, task.id, !task.done)}
        className="shrink-0 h-5 w-5 rounded-md border flex items-center justify-center transition-colors"
        style={{
          background: task.done ? '#6FA07C' : 'transparent',
          borderColor: task.done ? '#6FA07C' : '#C8C8CC',
        }}
      >
        {task.done && <Check className="h-3 w-3 text-white" strokeWidth={2.5} />}
      </button>

      <div className="flex-1 min-w-0">
        <div className={`text-sm leading-snug ${task.done ? 'line-through text-faint' : 'text-ink'}`}>
          {task.name}
        </div>
        {(dl || task.priority) && (
          <div className="flex items-center gap-2 mt-0.5">
            {dl && (
              <span className={`text-[11px] flex items-center gap-1 ${dl.urgent ? 'text-personal-deep' : 'text-faint'}`}>
                <Clock className="h-2.5 w-2.5" /> {dl.label}
              </span>
            )}
            {task.priority && (
              <span className="text-[11px] font-semibold" style={{ color: PRIO_HEX[task.priority] ?? '#8C9080' }}>
                {PRIO_NL[task.priority] ?? task.priority}
              </span>
            )}
          </div>
        )}
      </div>

      {hovering && (
        <button
          onClick={() => deleteProjectTask(projectId, task.id)}
          className="text-faint hover:text-red-400 text-base leading-none px-1 shrink-0 transition-colors"
          title="Verwijder taak"
        >
          ×
        </button>
      )}
    </div>
  )
}

// ── AddTaskRow ────────────────────────────────────────────────────────────────

function AddTaskRow({ projectId }: { projectId: string }) {
  const { addProjectTask } = useStore()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [due, setDue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function submit() {
    if (!name.trim()) return
    addProjectTask(projectId, { name: name.trim(), done: false, dueDate: due || null })
    setName('')
    setDue('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 40) }}
        className="flex items-center gap-1.5 w-full px-3 py-2.5 text-sm text-faint hover:text-muted transition-colors"
      >
        <Plus className="h-4 w-4" /> Taak toevoegen
      </button>
    )
  }

  return (
    <div className="px-3 py-2.5 border-t border-line space-y-2">
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false) }}
        placeholder="Taaknaam…"
        className="w-full text-sm bg-sunken rounded-lg px-3 py-2 outline-none border border-line focus:border-forest transition-colors"
      />
      <div className="flex gap-2">
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="flex-1 text-sm bg-sunken rounded-lg px-3 py-1.5 outline-none border border-line focus:border-forest transition-colors"
        />
        <button
          onClick={submit}
          disabled={!name.trim()}
          className="px-3 py-1.5 rounded-lg bg-forest text-white text-sm font-semibold disabled:opacity-40 transition-opacity"
        >
          Toevoegen
        </button>
        <button
          onClick={() => setOpen(false)}
          className="px-3 py-1.5 rounded-lg bg-sunken text-muted text-sm border border-line"
        >
          Annuleer
        </button>
      </div>
    </div>
  )
}

// ── DoneTasks collapsible ─────────────────────────────────────────────────────

function DoneTasks({ tasks, projectId }: { tasks: Task[]; projectId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full px-3 py-2 bg-sunken border-t border-line text-xs text-faint font-semibold"
      >
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
        >
          <path d="M3 2L7 5L3 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {tasks.length} afgerond
      </button>
      {open && tasks.map((t) => <TaskItem key={t.id} task={t} projectId={projectId} />)}
    </>
  )
}

// ── InfoRow ───────────────────────────────────────────────────────────────────

function InfoRow({ label, children, divider }: { label: string; children: React.ReactNode; divider?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-4 py-3.5 ${divider ? 'border-t border-line' : ''}`}>
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ProjectDetail({
  project,
  onClose,
}: {
  project: Project
  onClose: () => void
}) {
  const { clients, updateProject } = useStore()
  const client = clients.find((c) => c.id === project.clientId) ?? null
  const iconColor = DOMAIN_COLOR[project.domain] ?? '#9385B0'

  // Editable local state
  const [status, setStatus] = useState<ProjectStatus>(project.status)
  const [priority, setPriority] = useState(project.priority ?? '')
  const [deadline, setDeadline] = useState(project.deadline?.slice(0, 10) ?? '')
  const [value, setValue] = useState(project.value != null ? String(project.value) : '')
  const [saved, setSaved] = useState(false)

  const tasks = project.tasks ?? []
  const openTasks = tasks.filter((t) => !t.done)
  const doneTasks = tasks.filter((t) => t.done)
  const progress = tasks.length > 0 ? Math.round((doneTasks.length / tasks.length) * 100) : null

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const save = useCallback(() => {
    updateProject(project.id, {
      status,
      priority: (priority as Project['priority']) || undefined,
      deadline: deadline || null,
      value: value ? parseFloat(value) : project.value,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }, [project.id, status, priority, deadline, value, updateProject, project.value])

  const crmStatus = CRM_STATUS[status]
  const statusColor = STATUS_HEX[crmStatus]

  return (
    <div className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center">
      <div className="absolute inset-0 bg-scrim/55 backdrop-blur-md" onClick={onClose} />
      <div className="relative mt-auto md:mt-0 w-full md:max-w-lg md:max-h-[90dvh] flex flex-col bg-canvas md:rounded-4xl rounded-t-4xl border border-line shadow-pop overflow-y-auto">

        {/* Header */}
        <div className="flex items-start gap-3 p-5 pb-4 sticky top-0 bg-canvas z-10 border-b border-line">
          <span
            className="h-12 w-12 rounded-3xl flex items-center justify-center shrink-0"
            style={{ background: `${iconColor}28` }}
          >
            <FolderKanban className="h-6 w-6" style={{ color: iconColor }} />
          </span>
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="font-semibold text-lg leading-tight">{project.name}</div>
            {project.type && project.type.length > 0 && (
              <div className="text-sm text-faint mt-0.5">{project.type.join(' · ')}</div>
            )}
            <div className="flex items-center gap-2 mt-1.5">
              <span
                className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{ color: statusColor, background: `${statusColor}22` }}
              >
                {crmStatus}
              </span>
              {priority && (
                <span className="text-[11px] font-semibold" style={{ color: PRIO_HEX[priority] }}>
                  · {PRIO_NL[priority] ?? priority}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full bg-sunken flex items-center justify-center text-muted hover:text-ink shrink-0 mt-0.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Task progress bar */}
        {tasks.length > 0 && (
          <div className="mx-4 mt-4">
            <div className="flex justify-between text-xs text-faint mb-1">
              <span>Voortgang</span>
              <span className="tabular-nums">{doneTasks.length}/{tasks.length} ({progress}%)</span>
            </div>
            <div className="h-2 w-full rounded-full bg-line overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.max(2, progress ?? 0)}%`,
                  background: progress === 100 ? '#6FA07C' : statusColor,
                }}
              />
            </div>
          </div>
        )}

        {/* Edit fields */}
        <div className="mx-4 mt-4 rounded-2xl bg-surface border border-line overflow-hidden">
          <div className="px-4 pt-3 pb-1 text-[11px] font-bold text-faint uppercase tracking-wider">Details</div>

          <InfoRow label="Status" divider>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ProjectStatus)}
              className="text-sm bg-sunken border border-line rounded-lg px-2 py-1 outline-none focus:border-forest"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </InfoRow>

          <InfoRow label="Klant" divider>
            <span className="font-semibold">{client?.name ?? project.client}</span>
          </InfoRow>

          <InfoRow label="Prioriteit" divider>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="text-sm bg-sunken border border-line rounded-lg px-2 py-1 outline-none focus:border-forest"
            >
              <option value="">—</option>
              <option value="High">Hoog</option>
              <option value="Medium">Gemiddeld</option>
              <option value="Low">Laag</option>
            </select>
          </InfoRow>

          <InfoRow label="Deadline" divider>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="text-sm bg-sunken border border-line rounded-lg px-2 py-1 outline-none focus:border-forest"
            />
          </InfoRow>

          <InfoRow label="Waarde (€)" divider>
            <input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0"
              className="text-sm bg-sunken border border-line rounded-lg px-2 py-1 outline-none focus:border-forest w-28 text-right"
            />
          </InfoRow>

          <div className="px-4 py-3 border-t border-line">
            <button
              onClick={save}
              className="w-full py-2 rounded-xl bg-forest text-white text-sm font-semibold transition-opacity"
            >
              {saved ? '✓ Opgeslagen' : 'Wijzigingen opslaan'}
            </button>
          </div>
        </div>

        {/* Tasks */}
        <div className="mx-4 mt-3 mb-6">
          <div className="flex items-baseline justify-between mb-2">
            <div className="font-semibold text-sm">Taken</div>
            {tasks.length > 0 && <span className="text-xs text-faint">{tasks.length}</span>}
          </div>
          <div className="rounded-2xl bg-surface border border-line overflow-hidden">
            {tasks.length === 0 && openTasks.length === 0 && (
              <div className="px-3 py-3 text-sm text-faint">Nog geen taken.</div>
            )}
            {openTasks.map((t) => <TaskItem key={t.id} task={t} projectId={project.id} />)}
            {doneTasks.length > 0 && <DoneTasks tasks={doneTasks} projectId={project.id} />}
            <AddTaskRow projectId={project.id} />
          </div>
        </div>

      </div>
    </div>
  )
}
