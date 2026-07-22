import { useState } from 'react'
import { Video, Calendar, ChevronRight } from 'lucide-react'
import {
  Pill,
  DeltaBadge,
  TagPill,
  UrgencyDot,
  SegmentedSwitcher,
  Card,
  HeroStat,
  DuoCompare,
  MetricCard,
  ListRow,
  GoalRow,
  ScheduleCard,
  PriorityBar,
  Checkbox,
  TaskRow,
  Sparkline,
  Donut,
  SegmentedBar,
  GreetingHeader,
} from './components'

function Swatch({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="v3-micro-label">{label}</p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

/** Phase 2 — every badge/toggle/card/viz variant, labeled, in one gallery. */
export default function Library() {
  const [tab, setTab] = useState<'Day' | 'Week' | 'Month'>('Week')
  const [checked, setChecked] = useState<Record<number, boolean>>({ 1: true })

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <p className="v3-micro-label mb-4">Badges</p>
        <div className="flex flex-col gap-4">
          <Swatch label="Status pill">
            <Pill tone="success">Active</Pill>
            <Pill tone="warning">Pending</Pill>
            <Pill tone="danger">Blocked</Pill>
            <Pill>Neutral</Pill>
            <Pill tone="inverse">Inverse</Pill>
          </Swatch>
          <Swatch label="Delta / percent pill">
            <DeltaBadge value={15} />
            <DeltaBadge value={-8} />
            <DeltaBadge value={0} />
          </Swatch>
          <Swatch label="Tag pill">
            <TagPill label="boodschappen" tone="success" />
            <TagPill label="prjct" tone="info" />
            <TagPill label="personal" tone="warning" />
          </Swatch>
          <Swatch label="Countdown / time pill">
            <Pill>12:30</Pill>
            <Pill tone="danger">Over 20 min</Pill>
          </Swatch>
          <Swatch label="3-segment priority bar">
            <PriorityBar level="high" />
            <PriorityBar level="medium" />
            <PriorityBar level="low" />
          </Swatch>
          <Swatch label="Urgency dot + label">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: 'hsl(var(--v3-danger-text))' }}>
              <UrgencyDot tone="danger" />
              OVER 20 MINUTEN
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: 'hsl(var(--v3-success-text))' }}>
              <UrgencyDot tone="success" />5 UUR
            </span>
          </Swatch>
        </div>
      </Card>

      <Card>
        <p className="v3-micro-label mb-4">Toggles</p>
        <div className="flex flex-col gap-4">
          <Swatch label="Pill segmented switcher">
            <SegmentedSwitcher options={['Day', 'Week', 'Month'] as const} active={tab} onChange={setTab} />
          </Swatch>
          <Swatch label="Checkbox → check morph">
            <Checkbox checked={!!checked[1]} onChange={() => setChecked((c) => ({ ...c, 1: !c[1] }))} />
            <Checkbox checked={!!checked[2]} onChange={() => setChecked((c) => ({ ...c, 2: !c[2] }))} />
          </Swatch>
        </div>
      </Card>

      <Card>
        <p className="v3-micro-label mb-4">Cards — hero &amp; comparison</p>
        <div className="flex flex-col gap-3">
          <HeroStat label="Meest bezocht" value="24" suffix="x" textured />
          <DuoCompare leftLabel="Inkomsten" leftValue="€3291" rightLabel="Uitgaven" rightValue="€2474" />
        </div>
      </Card>

      <Card>
        <p className="v3-micro-label mb-4">3-up metric grid</p>
        <div className="v3-metric-grid">
          <MetricCard label="ParkingYou" value="€2114" />
          <MetricCard label="PRJCT Agency" value="€1149" delta={15} />
          <MetricCard label="Fiverr" value="€163" delta={-4} />
        </div>
      </Card>

      <Card>
        <p className="v3-micro-label mb-4">List row (title + tag + trailing metric)</p>
        <div>
          <ListRow title="ParkingYou" trailing="22x" />
          <ListRow title="Toermalijn" trailing="22x" />
          <ListRow title="Albert Heijn" tag="boodschappen" tagTone="success" trailing="22x" />
        </div>
      </Card>

      <Card>
        <p className="v3-micro-label mb-4">Goal / segmented progress row</p>
        <div className="flex flex-col gap-2">
          <GoalRow label="Vakantie" current={3291} target={3291} />
          <GoalRow label="Buffer" current={1200} target={3000} />
          <GoalRow label="Nieuwe auto" current={450} target={8000} />
        </div>
      </Card>

      <Card>
        <p className="v3-micro-label mb-4">Schedule carousel card</p>
        <div className="v3-schedule-scroll">
          <ScheduleCard
            urgencyTone="danger"
            urgencyLabel="Over 20 minuten"
            time="12:30"
            title="Discovery call"
            person="SYNCK"
            icon={<Video className="h-4 w-4" />}
          />
          <ScheduleCard
            urgencyTone="warning"
            urgencyLabel="3 uur"
            time="15:30"
            title="Discovery call"
            person="SYNCK"
            icon={<Video className="h-4 w-4" />}
          />
          <ScheduleCard
            urgencyTone="success"
            urgencyLabel="5 uur"
            time="18:00"
            title="Team sync"
            person="OSLIFE"
            icon={<Calendar className="h-4 w-4" />}
          />
        </div>
      </Card>

      <Card>
        <p className="v3-micro-label mb-4">Task row</p>
        <div className="flex flex-col gap-2">
          <TaskRow
            title="Garage bellen voor APK"
            reminder="2 dagen"
            priority="high"
            checked={!!checked[3]}
            onToggle={() => setChecked((c) => ({ ...c, 3: !c[3] }))}
          />
          <TaskRow
            title="Order protein"
            priority="medium"
            checked={!!checked[4]}
            onToggle={() => setChecked((c) => ({ ...c, 4: !c[4] }))}
          />
          <TaskRow
            title="Find a holiday trip"
            priority="low"
            checked={!!checked[5]}
            onToggle={() => setChecked((c) => ({ ...c, 5: !c[5] }))}
          />
        </div>
      </Card>

      <Card>
        <p className="v3-micro-label mb-4">Data viz primitives</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 items-center">
          <div>
            <p className="text-xs mb-2" style={{ color: 'hsl(var(--v3-text-secondary))' }}>
              Sparkline
            </p>
            <Sparkline points={[62, 64, 61, 66, 70, 68, 74]} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs" style={{ color: 'hsl(var(--v3-text-secondary))' }}>
              Ring / donut
            </p>
            <Donut pct={0.68} label="68%" />
          </div>
          <div>
            <p className="text-xs mb-2" style={{ color: 'hsl(var(--v3-text-secondary))' }}>
              Segmented bar
            </p>
            <SegmentedBar segments={10} filled={7} />
          </div>
          <div className="flex items-end gap-1 h-10">
            {[5, 8, 4, 9, 6, 10, 7].map((v, i) => (
              <div
                key={i}
                className="w-2 rounded-full"
                style={{ height: `${v * 10}%`, background: 'hsl(var(--v3-success-text))' }}
              />
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <p className="v3-micro-label mb-4">AI-greeting header (sentence lives here only)</p>
        <GreetingHeader
          eyebrow="Goedemorgen,"
          name="Rick"
          sentence={
            <>
              Je hebt vandaag een rustige dag met <b>3 afspraken</b>, waarvan de eerste begint over{' '}
              <b>25 minuten</b>.
            </>
          }
        />
      </Card>

      <Card>
        <p className="v3-micro-label mb-4">Overlay pattern (expand-for-detail)</p>
        <p className="v3-body mb-3">
          Any card can expand into a slide-up (mobile) / centered modal (desktop) that reuses the greeting-header
          pattern at its top, then continues in the same card language at full size.
        </p>
        <button className="v3-card-elevated p-3 flex items-center justify-between w-full text-sm font-semibold">
          Expand "ParkingYou" for full context
          <ChevronRight className="h-4 w-4" style={{ color: 'hsl(var(--v3-text-secondary))' }} />
        </button>
      </Card>
    </div>
  )
}
