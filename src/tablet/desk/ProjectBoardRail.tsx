import type { Project, ProjectStatus } from '../../types'
import { Pill } from '../../components/ui'
import { deadlineInfo } from '../../components/crm'

const GROUPS: { statuses: ProjectStatus[]; label: string }[] = [
  // Concept first: these are Fiverr intakes waiting on a scope/price review,
  // so they're the ones that need a decision before anything else moves.
  { statuses: ['draft'], label: 'Concept' },
  { statuses: ['active', 'review'], label: 'Bezig' },
  { statuses: ['lead'], label: 'Gepland' },
  { statuses: ['blocked'], label: 'Gepauzeerd' },
]

/** Left rail: all live projects grouped by status (a vertical, read-and-tap
 *  kanban board sized for a narrow column) — tap a card to focus it. */
export function ProjectBoardRail({
  projects, focusedId, onSelect,
}: { projects: Project[]; focusedId: string | null; onSelect: (id: string) => void }) {
  const live = projects.filter((p) => !p.archived && p.status !== 'done')
  const doneCount = projects.filter((p) => !p.archived && p.status === 'done').length

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto pr-1">
      {GROUPS.map((g) => {
        const list = live
          .filter((p) => g.statuses.includes(p.status))
          .sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'))
        if (list.length === 0) return null
        return (
          <div key={g.label}>
            <div className="text-xs font-semibold uppercase tracking-wider text-faint mb-2 px-1">{g.label} · {list.length}</div>
            <div className="space-y-2">
              {list.map((p) => (
                <ProjectChip key={p.id} p={p} focused={p.id === focusedId} onClick={() => onSelect(p.id)} />
              ))}
            </div>
          </div>
        )
      })}
      {live.length === 0 && <p className="text-sm text-faint p-2">Nog geen projecten.</p>}
      {doneCount > 0 && <div className="text-xs text-faint px-1 pt-1 mt-auto">Opgeleverd: {doneCount}</div>}
    </div>
  )
}

function ProjectChip({ p, focused, onClick }: { p: Project; focused: boolean; onClick: () => void }) {
  const dl = deadlineInfo(p.deadline)
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border transition-colors ${
        focused ? 'border-forest bg-forest/8' : 'border-line hover:bg-sunken'
      }`}
    >
      <div className="text-sm md:text-base font-semibold text-ink truncate">{p.name}</div>
      <div className="flex items-center gap-1.5 mt-1">
        {p.client && <span className="text-xs text-faint truncate">{p.client}</span>}
        {dl && (
          <Pill hex={dl.color} solid={dl.urgent} className="text-[10px] font-semibold px-1.5 py-0 rounded ml-auto shrink-0">
            {dl.label}
          </Pill>
        )}
      </div>
    </button>
  )
}
