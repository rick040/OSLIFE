import { useState } from 'react'
import { Video, ChevronRight, Check, Bell, Wallet, CheckSquare, Users, Dog } from 'lucide-react'
import {
  Card,
  DetailCard,
  Avatar,
  AssigneeRow,
  SuggestionCard,
  KnowledgeCard,
  AddCard,
  NotificationCenter,
  WeekBarChart,
  AreaSparkline,
  DonutLegend,
  DeltaBadge,
} from './components'

const STATE_LABELS = ['Default', 'Hover', 'Pressed', 'Selected', 'Disabled'] as const
const STATE_PREVIEW: Record<(typeof STATE_LABELS)[number], string> = {
  Default: '',
  Hover: 'hover',
  Pressed: 'pressed',
  Selected: 'selected',
  Disabled: 'disabled',
}

const NOTIF_GROUPS = [
  {
    label: 'Today',
    items: [
      { icon: <Wallet className="h-4 w-4" />, text: 'PRJCT Agency invoice paid — €1,149', time: '10 min ago', unread: true },
      { icon: <CheckSquare className="h-4 w-4" />, text: '3 tasks auto-rescheduled from yesterday', time: '2h ago', unread: true },
      { icon: <Users className="h-4 w-4" />, text: 'Sara commented on Design review', time: '3h ago' },
    ],
  },
  {
    label: 'Yesterday',
    items: [
      { icon: <Dog className="h-4 w-4" />, text: 'Milo’s vet appointment reminder', time: 'Yesterday, 18:00' },
      { icon: <Bell className="h-4 w-4" />, text: 'Weekly reflect is ready', time: 'Yesterday, 21:00' },
    ],
  },
]

/**
 * Interactive card library — every screen's cards are built from these
 * shapes plus what's already in Library.tsx. Covers touch states, the
 * detail/expand pattern, AI-facing cards (suggestion, knowledge), quick-add
 * slots, a full-screen notification center, and richer graph cards.
 */
export default function Cards() {
  const [selected, setSelected] = useState<number[]>([1])
  const [notifOpen, setNotifOpen] = useState(false)

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

      <div>
        <p className="v3-micro-label mb-2.5 px-1">AI suggestion card</p>
        <Card>
          <div className="flex flex-col gap-3">
            <SuggestionCard
              title="Move 'Order protein' to tomorrow morning — you're usually low-energy on Tuesday afternoons"
              subtitle="Based on 6 weeks of check-in history"
            />
            <SuggestionCard title="Batch the 3 ParkingYou invoices due this week into one payment run" />
          </div>
        </Card>
      </div>

      <div>
        <p className="v3-micro-label mb-2.5 px-1">Knowledge card (memory / notes)</p>
        <div className="grid grid-cols-2 gap-3">
          <KnowledgeCard
            title="Buurtkaart onboarding flow"
            snippet="Residents drop off at step 3 (address verification) — worth simplifying before the next survey round."
            tags={[{ label: 'buurtkaart', tone: 'success' }]}
            backlinks={4}
            updated="Updated 2d ago"
          />
          <KnowledgeCard
            title="PrimaVita pricing notes"
            snippet="Sara suggested a tiered structure — €99/€249/€499 — aligned with the discovery call feedback."
            tags={[{ label: 'prjct', tone: 'info' }]}
            backlinks={2}
            updated="Updated 5d ago"
          />
        </div>
      </div>

      <div>
        <p className="v3-micro-label mb-2.5 px-1">Add / quick-action card</p>
        <div className="grid grid-cols-3 gap-3">
          <AddCard label="Add task" />
          <AddCard label="Add expense" />
          <AddCard label="Connect account" />
        </div>
      </div>

      <div>
        <p className="v3-micro-label mb-2.5 px-1">Notification / log center — full-screen overlay</p>
        <Card as="button" className="flex items-center justify-between" onClick={() => setNotifOpen(true)}>
          <span className="inline-flex items-center gap-2 text-sm font-medium">
            <Bell className="h-4 w-4" />
            Open notification center
          </span>
          <span
            className="text-xs font-medium rounded-full px-2 py-0.5"
            style={{ background: 'hsl(var(--v3-danger-fill))', color: 'hsl(var(--v3-danger-text))' }}
          >
            2 new
          </span>
        </Card>
        <NotificationCenter open={notifOpen} onClose={() => setNotifOpen(false)} groups={NOTIF_GROUPS} />
      </div>

      <div className="flex flex-col gap-3">
        <p className="v3-micro-label px-1">Detailed graph cards</p>
        <Card>
          <p className="v3-micro-label mb-3">Sleep — last 7 days</p>
          <WeekBarChart
            data={[
              { label: 'M', value: 6.5 },
              { label: 'T', value: 7.2 },
              { label: 'W', value: 5.8 },
              { label: 'T', value: 7.8, today: true },
              { label: 'F', value: 6.9 },
              { label: 'S', value: 8.1 },
              { label: 'S', value: 7.4 },
            ]}
          />
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-1">
            <p className="v3-micro-label">Visitors — last 6 months</p>
            <DeltaBadge value={2} />
          </div>
          <AreaSparkline points={[320, 410, 380, 460, 520, 610]} />
        </Card>

        <Card>
          <p className="v3-micro-label mb-4">Browser share — Jan–Jun 2026</p>
          <DonutLegend
            centerLabel="935"
            items={[
              { label: 'Chrome', value: 48, color: 'hsl(var(--v3-info-text))' },
              { label: 'Firefox', value: 31, color: 'hsl(var(--v3-success-text))' },
              { label: 'Edge', value: 14, color: 'hsl(var(--v3-warning-text))' },
              { label: 'Safari', value: 7, color: 'hsl(var(--v3-text-secondary))' },
            ]}
          />
        </Card>
      </div>

      <Card as="button" className="flex items-center justify-between">
        <span className="text-sm font-medium">Expand any card for full context</span>
        <ChevronRight className="h-4 w-4" style={{ color: 'hsl(var(--v3-text-secondary))' }} />
      </Card>
    </div>
  )
}
