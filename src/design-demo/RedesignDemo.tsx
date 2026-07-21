import { useState } from 'react'
import {
  Cloud,
  Settings,
  ArrowRight,
  Plus,
  Home,
  Activity,
  Users,
  Gauge,
  CheckSquare,
  Cake,
  Video,
  Droplet,
  FolderKanban,
  Map as MapIcon,
} from 'lucide-react'
import './redesign.css'

const DAYS = [
  { d: 'M', n: 21 },
  { d: 'T', n: 22 },
  { d: 'W', n: 23 },
  { d: 'T', n: 24, today: true },
  { d: 'F', n: 25 },
  { d: 'S', n: 26 },
  { d: 'S', n: 27 },
]

const DOMAIN_HEX: Record<string, string> = {
  parkingyou: '#60A5FA',
  prjct: '#A78BFA',
  buurtkaart: '#34D399',
  personal: '#FBBF24',
  cross: '#F87171',
}

/**
 * Redesign demo v2 — "Tactile Organic Materialism". Standalone preview at
 * /design-demo, not wired into the app. See docs/design.md and the v2
 * proposal it was built from: atmospheric aurora glows, editorial narrative
 * headers, and 48px+ tactile controls instead of flat SaaS-dashboard cards.
 */
export default function RedesignDemo() {
  const [energy, setEnergy] = useState(3)
  const [mood, setMood] = useState<'Great' | 'Typical' | 'Good'>('Good')

  return (
    <div className="rd-root">
      <div className="rd-phone">
        <div className="rd-phone-notch" />
        <div className="rd-phone-body">
          <ReviewBanner />
          <Header />
          <HeroTile />
          <CheckinBlock energy={energy} setEnergy={setEnergy} mood={mood} setMood={setMood} />
          <VitalsSection />
          <SuggestedSection />
          <RemindersSection />
          <CapturesSection />
        </div>
        <BottomNav />
      </div>
    </div>
  )
}

function ReviewBanner() {
  return (
    <p
      className="text-[11px] rounded-xl px-3 py-2"
      style={{ background: 'hsl(var(--r-surface-raised))', color: 'hsl(var(--r-ink-muted))' }}
    >
      Design preview v2 — not wired into the app. See <code>docs/design.md</code>.
    </p>
  )
}

function Header() {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <div className="rd-avatar" style={{ background: '#FBBF24' }}>
          R
        </div>
        <div className="rd-date-strip flex-1 mx-3">
          {DAYS.map((day) => (
            <div key={day.n} className="rd-date-cell" data-today={day.today}>
              <span>{day.d}</span>
              <b>{day.n}</b>
            </div>
          ))}
        </div>
        <button className="rd-nudge-chevron">
          <Settings className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-1.5 text-xs" style={{ color: 'hsl(var(--r-ink-muted))' }}>
        <Cloud className="h-3.5 w-3.5" />
        6° &middot; Amsterdam
      </div>

      <p className="rd-greeting">
        Good morning. You have <span className="rd-count rd-count-azure">2 events</span>,{' '}
        <span className="rd-count rd-count-azure">2 meetings</span> and{' '}
        <span className="rd-count rd-count-emerald">3 tasks</span> today.
      </p>
    </div>
  )
}

function CheckinBlock({
  energy,
  setEnergy,
  mood,
  setMood,
}: {
  energy: number
  setEnergy: (n: number) => void
  mood: 'Great' | 'Typical' | 'Good'
  setMood: (m: 'Great' | 'Typical' | 'Good') => void
}) {
  return (
    <div className="rd-card flex flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Daily vitals</h3>
          <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--r-ink-secondary))' }}>
            How is your energy right now?
          </p>
        </div>
        <span className="text-xs font-bold tabular-nums" style={{ color: 'hsl(var(--r-accent-emerald))' }}>
          {energy} / 5
        </span>
      </div>

      <div className="rd-checkin-track">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} className="rd-checkin-block" data-active={n === energy} onClick={() => setEnergy(n)}>
            {n}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        {(['Great', 'Typical', 'Good'] as const).map((m) => (
          <button key={m} className="rd-pill-toggle" data-active={m === mood} onClick={() => setMood(m)}>
            {m}
          </button>
        ))}
      </div>
    </div>
  )
}

function HeroTile() {
  return (
    <div className="rd-card-hero">
      <p className="rd-section-label mb-2">Current focus</p>
      <p className="text-lg font-semibold leading-snug mb-4">Complete Q3 Strategie HQ roadmap review</p>
      <div className="rd-progress-track mb-2">
        <div className="rd-progress-fill" style={{ width: '65%' }} />
      </div>
      <p className="text-xs mb-4" style={{ color: 'hsl(var(--r-ink-secondary))' }}>
        65% done
      </p>
      <button className="rd-btn rd-btn-primary w-full">
        Start focus session
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  )
}

function VitalsSection() {
  return (
    <Section label="Cockpit vitals">
      <div className="grid grid-cols-2 gap-3">
        <div className="rd-kpi">
          <div className="rd-kpi-icon">
            <Droplet className="h-4 w-4" style={{ color: 'hsl(var(--r-accent-azure))' }} />
          </div>
          <div>
            <p className="rd-kpi-label">Hydration</p>
            <p className="rd-kpi-value">3 / 5 glasses</p>
          </div>
        </div>
        <div className="rd-kpi">
          <div className="rd-kpi-icon">
            <CheckSquare className="h-4 w-4" style={{ color: 'hsl(var(--r-accent-emerald))' }} />
          </div>
          <div>
            <p className="rd-kpi-label">Habits done</p>
            <p className="rd-kpi-value">4 of 6</p>
          </div>
        </div>
      </div>
    </Section>
  )
}

function SuggestedSection() {
  return (
    <Section label="Suggested">
      <div className="rd-card p-1.5">
        <NudgeRow
          tone="calm"
          icon={<Activity className="h-4 w-4" style={{ color: 'hsl(var(--r-accent-emerald))' }} />}
          title="Outdoor run"
          subtitle="Alertness rise in 45m"
        />
        <NudgeRow
          tone="attention"
          icon={<FolderKanban className="h-4 w-4" style={{ color: 'hsl(var(--r-accent-amber))' }} />}
          title="Apply to YC"
          subtitle="2:30 – 3:30 PM"
        />
        <NudgeRow
          tone="urgent"
          icon={<Gauge className="h-4 w-4" style={{ color: 'hsl(var(--r-accent-coral))' }} />}
          title="Overdue: reply to Kyra's dokterspraktijk email"
          subtitle="Rescheduled from yesterday"
        />
      </div>
    </Section>
  )
}

function RemindersSection() {
  return (
    <Section label="Reminders">
      <div className="rd-card p-1.5">
        <ReminderRow color="#FBBF24" icon={<Cake className="h-4 w-4" />} title="Farrel's birthday" trailing="Today" />
        <ReminderRow
          color="#60A5FA"
          icon={<Video className="h-4 w-4" />}
          title="Meeting with a client"
          trailing="30 min"
        />
      </div>
    </Section>
  )
}

function CapturesSection() {
  return (
    <Section label="Today's captures">
      <div className="rd-card p-1.5">
        <CaptureRow
          icon={<FolderKanban className="h-4 w-4" />}
          title="Design inspiration bookmark"
          domain="prjct"
        />
        <CaptureRow icon={<MapIcon className="h-4 w-4" />} title="Buurtkaart survey PDF" domain="buurtkaart" />
      </div>
    </Section>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="rd-section-label px-1">{label}</p>
      {children}
    </div>
  )
}

function NudgeRow({
  tone,
  icon,
  title,
  subtitle,
}: {
  tone: 'urgent' | 'attention' | 'calm'
  icon: React.ReactNode
  title: string
  subtitle: string
}) {
  return (
    <div className="rd-nudge" data-tone={tone}>
      <div className="rd-nudge-icon">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight line-clamp-2">{title}</p>
        <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--r-ink-secondary))' }}>
          {subtitle}
        </p>
      </div>
      <button className="rd-nudge-chevron">
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  )
}

function ReminderRow({
  color,
  icon,
  title,
  trailing,
}: {
  color: string
  icon: React.ReactNode
  title: string
  trailing: string
}) {
  return (
    <div className="rd-nudge" style={{ borderLeftColor: color }}>
      <div className="rd-nudge-icon" style={{ color }}>
        {icon}
      </div>
      <p className="text-sm font-semibold flex-1 min-w-0 truncate">{title}</p>
      <span className="rd-chip">{trailing}</span>
    </div>
  )
}

function CaptureRow({ icon, title, domain }: { icon: React.ReactNode; title: string; domain: string }) {
  return (
    <div className="rd-nudge">
      <div className="rd-nudge-icon" style={{ color: DOMAIN_HEX[domain] }}>
        {icon}
      </div>
      <p className="text-sm font-semibold flex-1 min-w-0 truncate">{title}</p>
      <span className="rd-chip" data-domain={domain}>
        <span className="rd-chip-dot" />
        {domain}
      </span>
    </div>
  )
}

function BottomNav() {
  return (
    <div className="rd-bottom-nav">
      <div className="rd-nav-icon" data-active="true">
        <Home className="h-5 w-5" />
      </div>
      <div className="rd-nav-icon">
        <Activity className="h-5 w-5" />
      </div>
      <div className="rd-fab">
        <Plus className="h-6 w-6" />
      </div>
      <div className="rd-nav-icon">
        <Droplet className="h-5 w-5" />
      </div>
      <div className="rd-nav-icon">
        <Users className="h-5 w-5" />
      </div>
    </div>
  )
}
