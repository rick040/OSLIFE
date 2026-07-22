import { useState } from 'react'
import { Video, ChevronRight, Check } from 'lucide-react'
import { Card, DetailCard, Avatar, AssigneeRow } from './components'

const STATE_LABELS = ['Default', 'Hover', 'Pressed', 'Selected', 'Disabled'] as const
const STATE_PREVIEW: Record<(typeof STATE_LABELS)[number], string> = {
  Default: '',
  Hover: 'hover',
  Pressed: 'pressed',
  Selected: 'selected',
  Disabled: 'disabled',
}

/**
 * Interactive card library — every screen's cards are built from these
 * shapes plus what's already in Library.tsx. This page focuses on states
 * (how a card behaves when touched) and the detail/expand pattern that Ref
 * "PrimaVita" introduced (tag pills, assignees with avatars, description,
 * sticky action bar).
 */
export default function Cards() {
  const [selected, setSelected] = useState<number[]>([1])

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <p className="v3-micro-label mb-4">Interactive states</p>
        <p className="v3-body mb-4">
          Every clickable card uses the same four states — hover and pressed are live (try it), selected and
          disabled are explicit props.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {STATE_LABELS.map((label) => (
            <div key={label} className="flex flex-col gap-2">
              <button className="v3-card !p-3 flex flex-col gap-1" data-preview={STATE_PREVIEW[label] || undefined}>
                <span className="text-sm font-medium">ParkingYou</span>
                <span className="text-xs" style={{ color: 'hsl(var(--v3-text-secondary))' }}>
                  22x this month
                </span>
              </button>
              <p className="text-xs text-center" style={{ color: 'hsl(var(--v3-text-secondary))' }}>
                {label}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <p className="v3-micro-label mb-4">Selectable card (live)</p>
        <p className="v3-body mb-4">Click to toggle selection — used for goal picking, filters, multi-select lists.</p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { id: 1, label: 'Vakantie' },
            { id: 2, label: 'Buffer' },
            { id: 3, label: 'Nieuwe auto' },
          ].map((g) => (
            <button
              key={g.id}
              className="v3-card !p-3 flex flex-col items-center gap-2 text-center"
              data-selected={selected.includes(g.id)}
              onClick={() =>
                setSelected((s) => (s.includes(g.id) ? s.filter((x) => x !== g.id) : [...s, g.id]))
              }
            >
              <span
                className="h-8 w-8 rounded-full flex items-center justify-center"
                style={{
                  background: selected.includes(g.id) ? 'hsl(var(--v3-success-text))' : 'hsl(var(--v3-bg-elevated))',
                  color: selected.includes(g.id) ? '#06210f' : 'hsl(var(--v3-text-secondary))',
                }}
              >
                {selected.includes(g.id) && <Check className="h-4 w-4" strokeWidth={3} />}
              </span>
              <span className="text-sm font-medium">{g.label}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <p className="v3-micro-label mb-4">Avatar</p>
        <div className="flex items-center gap-3">
          <Avatar name="Rick" size="sm" />
          <Avatar name="Sara Perkinson" size="md" />
          <Avatar name="You" size="lg" />
        </div>
      </Card>

      <Card>
        <p className="v3-micro-label mb-4">Assignee row</p>
        <div className="flex flex-col gap-3">
          <AssigneeRow name="You" role="Owner" />
          <AssigneeRow name="Sara Perkinson" role="Team lead" />
        </div>
      </Card>

      <div>
        <p className="v3-micro-label mb-2.5 px-1">Detail / event card — expand-for-context pattern</p>
        <DetailCard
          tag="Team meeting"
          tagTone="info"
          flag="Normal priority"
          title="Design review on PrimaVita project"
          meta="10:00 – 10:30 · 30m · repeats weekly"
          due="Due today 10:30"
          assignees={[
            { name: 'You', role: 'Owner' },
            { name: 'Sara Perkinson', role: 'Team lead' },
          ]}
          description="Participants, including key team members and the team lead, will collaborate to assess recent design developments, provide constructive feedback, and make necessary adjustments to enhance project outcomes."
          actionLabel="Join meeting"
          actionMeta="Starts in 28m"
          actionIcon={<Video className="h-3.5 w-3.5" />}
        />
      </div>

      <div>
        <p className="v3-micro-label mb-2.5 px-1">Detail card — task variant (no meeting action)</p>
        <DetailCard
          tag="Buurtkaart"
          tagTone="success"
          flag="High priority"
          title="Reply to survey follow-up requests"
          meta="Overdue since yesterday"
          assignees={[{ name: 'You', role: 'Owner' }]}
          description="Three residents replied to the buurtkaart survey asking for a follow-up call this week — needs a reply before Friday."
          actionLabel="Mark done"
          actionMeta="2 dagen"
          actionIcon={<Check className="h-3.5 w-3.5" />}
        />
      </div>

      <Card as="button" className="flex items-center justify-between">
        <span className="text-sm font-medium">Expand any card for full context</span>
        <ChevronRight className="h-4 w-4" style={{ color: 'hsl(var(--v3-text-secondary))' }} />
      </Card>
    </div>
  )
}
