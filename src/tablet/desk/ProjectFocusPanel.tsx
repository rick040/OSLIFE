import type { ComponentType } from 'react'
import { Check, Clock, Flag, ListChecks, Package } from 'lucide-react'
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
      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">{children}</div>
    </div>
  )
}

function Empty({ children }: { children: string }) {
  return <p className="text-sm text-faint py-2">{children}</p>
}

/** The focused project's full at-a-glance workspace: header, Pomodoro timer,
 *  milestones, remaining tasks, and deliverables. This is the "what am I
 *  working on right now" panel the tablet exists for. */
export function ProjectFocusPanel({ project, onClientClick }: { project: Project; onClientClick: (clientId: string) => void }) {
  const projectMilestones = useStore((s) => s.projectMilestones)
  const projectTasks = useStore((s) => s.projectTasks)
  const updateMilestone = useStore((s) => s.updateMilestone)
  const toggleProjectTask = useStore((s) => s.toggleProjectTask)

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
          <StatusBadge status={project.status} />
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
          {milestones.length === 0 ? (
            <Empty>Nog geen mijlpalen.</Empty>
          ) : (
            milestones.map((m) => {
              const mdl = deadlineInfo(m.dueDate)
              return (
                <button
                  key={m.id}
                  onClick={() => updateMilestone(m.id, { done: !m.done })}
                  className="w-full flex items-start gap-2.5 text-left py-1.5 px-1.5 rounded-lg hover:bg-sunken transition-colors"
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
              )
            })
          )}
        </Panel>

        <Panel title="Openstaande taken" icon={ListChecks} count={openTasks.length}>
          {tasks.length === 0 ? (
            <Empty>Nog geen taken.</Empty>
          ) : openTasks.length === 0 ? (
            <Empty>Alle taken afgerond 🎉</Empty>
          ) : (
            openTasks.map((t) => {
              const tdl = deadlineInfo(t.dueDate ?? null)
              return (
                <button
                  key={t.id}
                  onClick={() => toggleProjectTask(t.id, true)}
                  className="w-full flex items-start gap-2.5 text-left py-1.5 px-1.5 rounded-lg hover:bg-sunken transition-colors"
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
