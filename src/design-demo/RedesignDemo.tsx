import { useState } from 'react'
import {
  Wifi,
  ChevronRight,
  Timer,
  CheckSquare,
  Plus,
  FileText,
  Map as MapIcon,
  AlertTriangle,
  Bell,
  Sparkles,
} from 'lucide-react'
import './redesign.css'

/**
 * Standalone preview of the docs/design.md Part 2 redesign proposal.
 * Not wired into the live app — reachable only at /design-demo, with mock
 * data, so it can be reviewed before any of this touches src/index.css or
 * the real components.
 */
export default function RedesignDemo() {
  const [energy, setEnergy] = useState(3)
  const [mood, setMood] = useState(4)

  return (
    <div className="rd-root">
      <TopBar />

      <div className="max-w-md mx-auto px-4 py-5 flex flex-col gap-6">
        <ReviewBanner />

        <HeroTile />

        <Section label="Daily check-in">
          <div className="rd-card">
            <p className="text-sm font-medium mb-3" style={{ color: 'hsl(var(--r-ink))' }}>
              Energy level today
            </p>
            <ScaleTrack value={energy} onChange={setEnergy} />
            <p className="text-sm font-medium mt-4 mb-3" style={{ color: 'hsl(var(--r-ink))' }}>
              Mood today
            </p>
            <ScaleTrack value={mood} onChange={setMood} />
          </div>
        </Section>

        <Section label="Cockpit stats">
          <div className="grid grid-cols-2 gap-3">
            <KpiTile icon={<Timer className="h-4 w-4" />} label="Focus time" value="3h 45m" />
            <KpiTile icon={<CheckSquare className="h-4 w-4" />} label="Tasks done" value="8 / 12" />
          </div>
        </Section>

        <Section label="Quick actions">
          <button className="rd-btn rd-btn-primary w-full">
            <Plus className="h-4 w-4" />
            Quick braindump note
          </button>
        </Section>

        <Section label="Recent captures">
          <div className="rd-card p-0">
            <CaptureRow
              icon={<FileText className="h-4 w-4" />}
              title="Design system reference doc"
              meta="Captured today at 09:15"
              domain="prjct"
            />
            <CaptureRow
              icon={<MapIcon className="h-4 w-4" />}
              title="Buurtkaart survey PDF"
              meta="Captured yesterday"
              domain="buurtkaart"
            />
          </div>
        </Section>

        <Section label="Priorities">
          <div className="flex flex-col gap-2">
            <NudgeRow tone="urgent" text="Overdue: reply to Kyra's dokterspraktijk email" cta="Memory" />
            <NudgeRow tone="attention" text="Q3 roadmap review needs your input" cta="Projects" />
            <NudgeRow tone="calm" text="Nothing urgent — good time for deep work" />
          </div>
        </Section>

        <Section label="Buttons">
          <div className="flex flex-wrap gap-2.5">
            <button className="rd-btn rd-btn-primary">Primary</button>
            <button className="rd-btn rd-btn-ghost">Ghost</button>
            <button className="rd-btn rd-btn-hero">Hero</button>
          </div>
        </Section>

        <Section label="Domain chips">
          <div className="flex flex-wrap gap-2">
            <span className="rd-chip" data-domain="parkingyou">ParkingYou</span>
            <span className="rd-chip" data-domain="prjct">PRJCT</span>
            <span className="rd-chip" data-domain="buurtkaart">Buurtkaart</span>
            <span className="rd-chip" data-domain="personal">Personal</span>
            <span className="rd-chip" data-domain="cross">Cross</span>
          </div>
        </Section>
      </div>
    </div>
  )
}

function ReviewBanner() {
  return (
    <div
      className="rounded-xl px-3.5 py-2.5 text-xs"
      style={{
        background: 'hsl(var(--r-sunken))',
        color: 'hsl(var(--r-ink-soft))',
        border: '1px solid hsl(var(--r-line))',
      }}
    >
      Design preview only — not wired into the app. See <code>docs/design.md</code>.
    </div>
  )
}

function TopBar() {
  const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return (
    <div className="rd-topbar">
      <div className="flex items-center gap-2">
        <span className="rd-wordmark">OSLIFE</span>
        <span className="rd-status-dot" style={{ background: 'hsl(var(--r-success))' }} />
        <span className="text-[11px]" style={{ color: 'hsl(var(--r-muted))' }}>
          synced
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs" style={{ color: 'hsl(var(--r-ink-soft))' }}>
        <Wifi className="h-3.5 w-3.5" />
        {time}
      </div>
    </div>
  )
}

function HeroTile() {
  return (
    <div className="rd-card-hero">
      <p className="rd-section-label mb-2">Top priority</p>
      <p className="text-lg font-semibold leading-snug mb-4" style={{ color: 'hsl(var(--r-ink))' }}>
        Complete Strategie HQ Q3 roadmap review
      </p>
      <div className="rd-progress-track mb-2">
        <div className="rd-progress-fill" style={{ width: '75%' }} />
      </div>
      <p className="text-xs mb-4" style={{ color: 'hsl(var(--r-ink-soft))' }}>
        75% done
      </p>
      <button className="rd-btn rd-btn-hero w-full">
        Continue focus session
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="rd-section-label">{label}</p>
      {children}
    </div>
  )
}

function ScaleTrack({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="rd-checkin-track">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          className="rd-checkin-block"
          data-active={n === value}
          onClick={() => onChange(n)}
          aria-pressed={n === value}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

function KpiTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rd-kpi">
      <div className="rd-kpi-icon">{icon}</div>
      <div className="mt-2">
        <p className="rd-kpi-label">{label}</p>
        <p className="rd-kpi-value">{value}</p>
      </div>
    </div>
  )
}

function CaptureRow({
  icon,
  title,
  meta,
  domain,
}: {
  icon: React.ReactNode
  title: string
  meta: string
  domain: 'parkingyou' | 'prjct' | 'buurtkaart' | 'personal' | 'cross'
}) {
  return (
    <div className="rd-capture-row">
      <div className="rd-capture-icon">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate" style={{ color: 'hsl(var(--r-ink))' }}>
          {title}
        </p>
        <p className="text-xs" style={{ color: 'hsl(var(--r-muted))' }}>
          {meta}
        </p>
      </div>
      <span className="rd-chip" data-domain={domain}>
        {domain}
      </span>
    </div>
  )
}

const TONE_ICON = { urgent: AlertTriangle, attention: Bell, calm: Sparkles }

function NudgeRow({ tone, text, cta }: { tone: 'urgent' | 'attention' | 'calm'; text: string; cta?: string }) {
  const Icon = TONE_ICON[tone]
  return (
    <div className="rd-nudge" data-tone={tone}>
      <Icon className="h-4 w-4 shrink-0" style={{ color: `hsl(var(--r-${tone === 'urgent' ? 'destructive' : tone === 'attention' ? 'warning' : 'success'}))` }} />
      <p className="text-sm flex-1 min-w-0 line-clamp-2" style={{ color: 'hsl(var(--r-ink))' }}>
        {text}
      </p>
      {cta && (
        <span className="text-xs font-semibold shrink-0" style={{ color: 'hsl(var(--r-ink-soft))' }}>
          {cta}
        </span>
      )}
    </div>
  )
}
