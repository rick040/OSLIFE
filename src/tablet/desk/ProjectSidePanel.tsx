import { useMemo, useState } from 'react'
import { Globe, Mail } from 'lucide-react'
import { useStore } from '../../store'
import type { Project } from '../../types'
import { MiniCalendar } from '../../finance/MiniCalendar'
import { FollowUpDot, PersonAvatar } from '../../components/crm'

/** Right rail: an at-a-glance deadline calendar (projects + open milestones)
 *  plus the focused project's client contact card — so a phone call or quick
 *  "who am I dealing with" check never needs the phone. */
export function ProjectSidePanel({
  project, projects, onClientClick,
}: { project: Project | null; projects: Project[]; onClientClick: (clientId: string) => void }) {
  const clients = useStore((s) => s.clients)
  const people = useStore((s) => s.people)
  const projectMilestones = useStore((s) => s.projectMilestones)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const client = project?.clientId ? clients.find((c) => c.id === project.clientId) ?? null : null
  const contactPeople = client ? people.filter((p) => p.clientId === client.id) : []

  const markedDates = useMemo(() => {
    const set = new Set<string>()
    projects.forEach((p) => { if (!p.archived && p.status !== 'done' && p.deadline) set.add(p.deadline) })
    projectMilestones.forEach((m) => { if (!m.done && m.dueDate) set.add(m.dueDate) })
    return set
  }, [projects, projectMilestones])

  const itemsOnSelected = selectedDate
    ? [
        ...projects.filter((p) => p.deadline === selectedDate).map((p) => ({ label: p.name, sub: 'Project deadline' })),
        ...projectMilestones.filter((m) => m.dueDate === selectedDate).map((m) => ({ label: m.title, sub: 'Mijlpaal' })),
      ]
    : []

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto pr-1">
      <MiniCalendar markedDates={markedDates} selected={selectedDate} onSelect={setSelectedDate} />

      {selectedDate && (
        <div className="card p-3.5 -mt-1">
          {itemsOnSelected.length === 0 ? (
            <p className="text-xs text-faint">Niets gepland op deze dag.</p>
          ) : (
            <div className="space-y-1.5">
              {itemsOnSelected.map((it, i) => (
                <div key={i} className="text-sm">
                  <span className="font-medium text-ink">{it.label}</span>
                  <span className="text-faint text-xs block">{it.sub}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {client && (
        <div className="card p-4">
          <button onClick={() => onClientClick(client.id)} className="flex items-center justify-between gap-2 mb-2 w-full text-left hover:opacity-80">
            <span className="text-sm md:text-base font-semibold truncate">{client.name}</span>
            <FollowUpDot client={client} />
          </button>
          <div className="space-y-1.5 text-sm text-faint">
            {client.email && (
              <div className="flex items-center gap-1.5 truncate"><Mail className="h-3.5 w-3.5 shrink-0" />{client.email}</div>
            )}
            {client.website && (
              <div className="flex items-center gap-1.5 truncate"><Globe className="h-3.5 w-3.5 shrink-0" />{client.website}</div>
            )}
            {!client.email && !client.website && <span className="text-xs">Geen contactgegevens.</span>}
          </div>
          {contactPeople.length > 0 && (
            <div className="mt-3 space-y-2.5 border-t border-line pt-3">
              {contactPeople.map((p) => (
                <div key={p.id} className="flex items-center gap-2.5">
                  <PersonAvatar person={p} className="h-8 w-8 text-xs" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.displayName}{p.jobTitle ? ` · ${p.jobTitle}` : ''}</div>
                    <div className="text-xs text-faint truncate">{[...p.emails, ...p.phones].join(' · ') || 'Geen contactgegevens'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
