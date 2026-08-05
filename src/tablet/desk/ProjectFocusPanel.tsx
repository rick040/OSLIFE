import { useState, type ComponentType } from 'react'
import { Check, Clock, Flag, ListChecks, Package, Pencil, Plus, Trash2 } from 'lucide-react'
import { useStore } from '../../store'
import type { Project } from '../../types'
import { DomainChip, Pill } from '../../components/ui'
import { StatusBadge, deadlineInfo, PRIO_HEX, PRIO_NL, eur } from '../../components/crm'
import { PomodoroTimer } from './PomodoroTimer'

function Panel({
  title, icon: Icon, count, children,
}: { title: string; icon: ComponentType<{ className?: string }>; count?: number; children: React.ReactNode }) {
  return (
    <div className="card p-4 md:p-5 flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <Icon className="h-4 w-4 md:h-5 md:w-5 text-ink-soft" />
        <span className="text-sm md:text-base font-semibold text-ink">{title}</span>
        {count != null && <span className="text-xs md:text-sm text-faint ml-auto tabular-nums">{count}</span>}
      </div>
      <div className="flex-1 overflow-y-auto space-y-1 pr-1">{children}</div>
    </div>
  )
}

function Empty({ children }: { children: string }) {
  return <p className="text-sm text-faint py-2">{children}</p>
}

/** Single-line "type and hit enter" capture row — the desktop Bureau's stand-in
 *  for the full add-forms in ProjectDetail (name only; due date/priority/etc.
 *  stay one click away via the "open full project" button). */
function QuickAdd({ placeholder, onAdd }: { placeholder: string; onAdd: (value: string) => void }) {
  const [value, setValue] = useState('')
  function submit() {
    if (!value.trim()) return
    onAdd(value.trim())
    setValue('')
  }
  return (
    <div className="flex items-center gap-2 px-1.5 py-1 mb-1 rounded-lg border border-dashed border-line focus-within:border-forest transition-colors">
      <Plus className="h-3.5 w-3.5 text-faint shrink-0" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder={placeholder}
        className="flex-1 min-w-0 bg-transparent text-sm outline-none py-1"
      />
    </div>
  )
}

/** The focused project's full at-a-glance workspace: header, Pomodoro timer,
 *  milestones, remaining tasks, and deliverables. This is the "what am I
 *  working on right now" panel the tablet and desktop Bureau share.
 *
 *  `editable` turns on quick-add/delete for tasks &amp; milestones and an
 *  "open full project" button — on by default for the desktop Bureau layout,
 *  left off for the tablet kiosk, which stays a glance-and-tap surface. */
export function ProjectFocusPanel({
  project, onClientClick, editable = false, onEdit,
}: { project: Project; onClientClick: (clientId: string) => void; editable?: boolean; onEdit?: () => void }) {
  const projectMilestones = useStore((s) => s.projectMilestones)
  const projectTasks = useStore((s) => s.projectTasks)
  const updateMilestone = useStore((s) => s.updateMilestone)
  const deleteMilestone = useStore((s) => s.deleteMilestone)
  const addMilestone = useStore((s) => s.addMilestone)
  const toggleProjectTask = useStore((s) => s.toggleProjectTask)
  const deleteProjectTask = useStore((s) => s.deleteProjectTask)
  const addProjectTask = useStore((s) => s.addProjectTask)

  const milestones = projectMilestones
    .filter((m) => m.projectId === project.id)
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
  const openMilestones = milestones.filter((m) => !m.done)

  const tasks = projectTasks.filter((t) => t.projectId === project.id)
  const openTasks = tasks
    .filter((t) => !t.done)
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))

  const dl = deadlineInfo(project.deadline)
  const pct = Math.round(project.progress * 100)

  return (
    <div className="flex flex-col gap-4 md:gap-5 h-full min-h-0">
      <div className="card p-5 md:p-6 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-2xl md:text-3xl font-bold leading-tight truncate">{project.name}</div>
            {project.client && (
              <button
                onClick={() => project.clientId && onClientClick(project.clientId)}
                className="text-sm md:text-base text-faint hover:text-forest hover:underline underline-offset-2 mt-0.5 disabled:no-underline disabled:hover:text-faint"
                disabled={!project.clientId}
              >
                {project.client}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {editable && onEdit && (
              <button onClick={onEdit} title="Volledig project openen" className="h-8 w-8 rounded-full bg-sunken flex items-center justify-center text-muted hover:text-ink shrink-0">
                <Pencil className="h-4 w-4" />
              </button>
            )}
            <StatusBadge status={project.status} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <DomainChip domain={project.domain} />
          {project.priority && (
            <Pill hex={PRIO_HEX[project.priority]} className="text-xs md:text-sm font-semibold px-2 py-0.5 rounded-md">
              {PRIO_NL[project.priority] ?? project.priority}
            </Pill>
          )}
          {dl && (
            <Pill hex={dl.color} solid={dl.urgent} className="text-xs md:text-sm font-semibold px-2 py-0.5 rounded-md inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> {dl.label}
            </Pill>
          )}
          <span className="text-sm md:text-base font-semibold tabular-nums ml-auto">{eur(project.value)}</span>
        </div>
        <div className="h-2 w-full rounded-full bg-line overflow-hidden mt-3">
          <div className="h-full rounded-full bg-forest transition-[width] duration-700" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="shrink-0">
        <PomodoroTimer projectId={project.id} projectName={project.name} />
      </div>

      <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
        <Panel title="Mijlpalen" icon={Flag} count={openMilestones.length}>
          {editable && (
            <QuickAdd
              placeholder="Mijlpaal toevoegen…"
              onAdd={(title) => addMilestone(project.id, { title, dueDate: null, progress: 0, done: false })}
            />
          )}
          {milestones.length === 0 ? (
            <Empty>Nog geen mijlpalen.</Empty>
          ) : (
            milestones.map((m) => {
              const mdl = deadlineInfo(m.dueDate)
              return (
                <div key={m.id} className="group flex items-center gap-1 rounded-lg hover:bg-sunken transition-colors">
                  <button
                    onClick={() => updateMilestone(m.id, { done: !m.done })}
                    className="flex-1 min-w-0 flex items-start gap-2.5 text-left py-1.5 px-1.5"
                  >
                    <span
                      className="mt-0.5 shrink-0 h-5 w-5 rounded-md border flex items-center justify-center"
                      style={{ background: m.done ? '#34D399' : 'transparent', borderColor: m.done ? '#34D399' : '#C8C8CC' }}
                    >
                      {m.done && <Check className="h-3 w-3 text-white" strokeWidth={2.5} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm md:text-base font-medium ${m.done ? 'line-through text-faint' : 'text-ink'}`}>{m.title}</span>
                      {mdl && !m.done && (
                        <span className="text-xs md:text-sm text-faint" style={{ color: mdl.urgent ? mdl.color : undefined }}>{mdl.label}</span>
                      )}
                    </span>
                  </button>
                  {editable && (
                    <button
                      onClick={() => deleteMilestone(m.id)}
                      className="shrink-0 px-1.5 py-1.5 text-faint hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )
            })
          )}
        </Panel>

        <Panel title="Openstaande taken" icon={ListChecks} count={openTasks.length}>
          {editable && (
            <QuickAdd
              placeholder="Taak toevoegen…"
              onAdd={(name) => addProjectTask(project.id, { name, done: false })}
            />
          )}
          {tasks.length === 0 ? (
            <Empty>Nog geen taken.</Empty>
          ) : openTasks.length === 0 ? (
            <Empty>Alle taken afgerond 🎉</Empty>
          ) : (
            openTasks.map((t) => {
              const tdl = deadlineInfo(t.dueDate ?? null)
              return (
                <div key={t.id} className="group flex items-center gap-1 rounded-lg hover:bg-sunken transition-colors">
                  <button
                    onClick={() => toggleProjectTask(t.id, true)}
                    className="flex-1 min-w-0 flex items-start gap-2.5 text-left py-1.5 px-1.5"
                  >
                    <span className="mt-0.5 shrink-0 h-5 w-5 rounded-md border border-line" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm md:text-base font-medium text-ink">{t.name}</span>
                      <span className="flex items-center gap-1.5 mt-0.5">
                        {tdl && <span className="text-xs md:text-sm text-faint" style={{ color: tdl.urgent ? tdl.color : undefined }}>{tdl.label}</span>}
                        {t.priority && <span className="text-xs md:text-sm text-faint">{PRIO_NL[t.priority] ?? t.priority}</span>}
                      </span>
                    </span>
                  </button>
                  {editable && (
                    <button
                      onClick={() => deleteProjectTask(t.id)}
                      className="shrink-0 px-1.5 py-1.5 text-faint hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )
            })
          )}
        </Panel>
      </div>

      {project.deliverables && project.deliverables.length > 0 && (
        <div className="card p-4 md:p-5 shrink-0">
          <div className="flex items-center gap-2 mb-2.5">
            <Package className="h-4 w-4 md:h-5 md:w-5 text-ink-soft" />
            <span className="text-sm md:text-base font-semibold text-ink">Deliverables</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {project.deliverables.map((d) => (
              <span key={d} className="chip bg-sunken text-ink-soft text-sm">{d}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
