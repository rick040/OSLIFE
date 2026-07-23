import {
  CheckSquare,
  Wallet,
  HeartPulse,
  Users,
  Dog,
  Brain,
  Bell,
  Calendar,
  Video,
} from 'lucide-react'
import { Card, GreetingHeader, Donut, MetricCard, Pill, ListRow, ScheduleCard } from './components'

const MODULES = [
  { key: 'tasks', label: 'Tasks', icon: CheckSquare },
  { key: 'finance', label: 'Finance', icon: Wallet },
  { key: 'health', label: 'Health', icon: HeartPulse },
  { key: 'crm', label: 'CRM', icon: Users },
  { key: 'dog', label: 'Dog', icon: Dog },
  { key: 'memory', label: 'Memory', icon: Brain },
]

/** Screen 1/12 — Homepage: greeting + today snapshot + module quick-access grid. */
export default function Homepage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <GreetingHeader
          eyebrow="Goedemorgen,"
          name="Rick"
          sentence={
            <>
              Je hebt vandaag <b>3 afspraken</b>, <b>4 taken</b> en je conditiescore staat op <b>68</b>.
            </>
          }
        />
        <button className="v3-icon-circle-ghost">
          <Bell className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="items-center flex flex-col gap-2 !py-4">
          <Donut pct={0.68} label="68" size={56} />
          <p className="v3-micro-label">Exo score</p>
        </Card>
        <MetricCard label="Tasks due" value="4" />
        <MetricCard label="Balance" value="€1302" delta={6} />
        <MetricCard label="Meetings" value="3" />
      </div>

      <div className="flex flex-col gap-2.5">
        <p className="v3-micro-label px-1">Schedule</p>
        <div className="v3-schedule-scroll">
          <ScheduleCard
            urgencyTone="danger"
            urgencyLabel="Over 20 min"
            time="12:30"
            title="Discovery call"
            person="SYNCK"
            icon={<Video className="h-4 w-4" />}
          />
          <ScheduleCard
            urgencyTone="warning"
            urgencyLabel="3 uur"
            time="15:30"
            title="Roadmap review"
            person="STRATEGIE HQ"
            icon={<Calendar className="h-4 w-4" />}
          />
        </div>
      </div>

      <Card>
        <p className="v3-micro-label mb-1">Recent</p>
        <div>
          <ListRow title="ParkingYou — 22 bezoeken" trailing="Vandaag" />
          <ListRow title="Buurtkaart survey" tag="buurtkaart" tagTone="success" trailing="Gisteren" />
        </div>
      </Card>

      <div>
        <p className="v3-micro-label mb-2.5 px-1">Modules</p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {MODULES.map((m) => (
            <button key={m.key} className="v3-card flex flex-col items-center gap-2 !py-4">
              <m.icon className="h-5 w-5" />
              <span className="text-xs font-medium">{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      <Pill tone="neutral">
        Design preview v3 — not wired into the app. See docs/design.md.
      </Pill>
    </div>
  )
}
