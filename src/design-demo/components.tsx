import { Check } from 'lucide-react'

/**
 * RICK-OS v3 component library — every card/badge/toggle primitive the
 * screens are built from. No screen may invent a one-off style outside
 * these; that constraint is what keeps 12 screens feeling like one system.
 */

export type Tone = 'neutral' | 'success' | 'danger' | 'warning' | 'info' | 'inverse'

export function Pill({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className="v3-pill" data-tone={tone === 'neutral' ? undefined : tone}>
      {children}
    </span>
  )
}

export function DeltaBadge({ value }: { value: number }) {
  const tone: Tone = value > 0 ? 'success' : value < 0 ? 'danger' : 'neutral'
  return (
    <Pill tone={tone}>
      {value > 0 ? '+' : ''}
      {value}%
    </Pill>
  )
}

export function TagPill({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  return <Pill tone={tone}>{label}</Pill>
}

export function UrgencyDot({ tone }: { tone: 'danger' | 'warning' | 'success' }) {
  const color =
    tone === 'danger' ? 'hsl(var(--v3-danger-text))' : tone === 'warning' ? 'hsl(var(--v3-warning-text))' : 'hsl(var(--v3-success-text))'
  return <span className="v3-dot" style={{ color }} />
}

export function SegmentedSwitcher<T extends string>({
  options,
  active,
  onChange,
}: {
  options: readonly T[]
  active: T
  onChange: (v: T) => void
}) {
  return (
    <div className="v3-tabbar">
      {options.map((o) => (
        <button key={o} className="v3-tab" data-active={o === active} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  )
}

export function Card({
  children,
  as: As = 'div',
  className = '',
  ...rest
}: {
  children: React.ReactNode
  as?: 'div' | 'button'
  className?: string
  [key: string]: any
}) {
  return (
    <As className={`v3-card ${className}`} {...rest}>
      {children}
    </As>
  )
}

export function HeroStat({
  label,
  value,
  suffix,
  textured,
}: {
  label: string
  value: string
  suffix?: string
  textured?: boolean
}) {
  return (
    <div className="v3-hero-stat" data-textured={textured}>
      <p className="v3-micro-label mb-3">{label}</p>
      <p className="v3-display v3-hero-number">
        {value}
        {suffix && <sub>{suffix}</sub>}
      </p>
    </div>
  )
}

export function DuoCompare({
  leftLabel,
  leftValue,
  rightLabel,
  rightValue,
}: {
  leftLabel: string
  leftValue: string
  rightLabel: string
  rightValue: string
}) {
  return (
    <div className="v3-duo">
      <div className="v3-duo-cell" data-tone="success">
        <p className="v3-micro-label mb-1" style={{ color: 'hsl(var(--v3-success-text) / 0.7)' }}>
          {leftLabel}
        </p>
        <p className="v3-display v3-duo-value">{leftValue}</p>
      </div>
      <div className="v3-duo-cell" data-tone="danger">
        <p className="v3-micro-label mb-1" style={{ color: 'hsl(var(--v3-danger-text) / 0.7)' }}>
          {rightLabel}
        </p>
        <p className="v3-display v3-duo-value">{rightValue}</p>
      </div>
    </div>
  )
}

export function MetricCard({ label, value, delta }: { label: string; value: string; delta?: number }) {
  return (
    <div className="v3-metric-card">
      <p className="v3-micro-label">{label}</p>
      <p className="v3-metric-value">
        <span className="v3-display">{value}</span>
        {delta !== undefined && <DeltaBadge value={delta} />}
      </p>
    </div>
  )
}

export function ListRow({
  title,
  tag,
  tagTone,
  trailing,
}: {
  title: string
  tag?: string
  tagTone?: Tone
  trailing: string
}) {
  return (
    <div className="v3-list-row">
      <p className="text-sm font-semibold flex-1 min-w-0 truncate">{title}</p>
      {tag && <TagPill label={tag} tone={tagTone} />}
      <span className="text-sm font-semibold tabular-nums" style={{ color: 'hsl(var(--v3-text-primary))' }}>
        {trailing}
      </span>
    </div>
  )
}

export function GoalRow({
  label,
  current,
  target,
  segments = 10,
}: {
  label: string
  current: number
  target: number
  segments?: number
}) {
  const pct = target > 0 ? current / target : 0
  const filled = Math.round(pct * segments)
  return (
    <div className="v3-goal-row">
      <span className="v3-goal-check" />
      <span className="text-sm font-semibold w-28 shrink-0 truncate">{label}</span>
      <div className="v3-segments">
        {Array.from({ length: segments }).map((_, i) => (
          <span key={i} className="v3-segment" data-filled={i < filled} />
        ))}
      </div>
      <span className="v3-goal-fraction">
        €{current} / €{target}
      </span>
    </div>
  )
}

export function ScheduleCard({
  urgencyTone,
  urgencyLabel,
  time,
  title,
  person,
  icon,
}: {
  urgencyTone: 'danger' | 'warning' | 'success'
  urgencyLabel: string
  time: string
  title: string
  person: string
  icon: React.ReactNode
}) {
  const color =
    urgencyTone === 'danger'
      ? 'hsl(var(--v3-danger-text))'
      : urgencyTone === 'warning'
        ? 'hsl(var(--v3-warning-text))'
        : 'hsl(var(--v3-success-text))'
  return (
    <div className="v3-schedule-card">
      <div className="v3-schedule-top">
        <span className="v3-schedule-urgency" style={{ color }}>
          <UrgencyDot tone={urgencyTone} />
          {urgencyLabel}
        </span>
        <Pill>{time}</Pill>
      </div>
      <p className="v3-heading leading-tight">{title}</p>
      <div className="v3-schedule-bottom">
        <span className="v3-micro-label">{person}</span>
        <button className="v3-icon-circle">{icon}</button>
      </div>
    </div>
  )
}

export function PriorityBar({ level }: { level: 'high' | 'medium' | 'low' }) {
  return (
    <span className="v3-priority-bar" data-level={level}>
      <span />
      <span />
      <span />
    </span>
  )
}

export function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button className="v3-checkbox" data-checked={checked} onClick={onChange}>
      {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
    </button>
  )
}

export function TaskRow({
  title,
  reminder,
  priority,
  checked,
  onToggle,
}: {
  title: string
  reminder?: string
  priority: 'high' | 'medium' | 'low'
  checked: boolean
  onToggle: () => void
}) {
  return (
    <div className="v3-task-row">
      <Checkbox checked={checked} onChange={onToggle} />
      <p className={`text-sm font-medium flex-1 min-w-0 truncate ${checked ? 'line-through opacity-40' : ''}`}>
        {title}
      </p>
      {reminder && <Pill>{reminder}</Pill>}
      <PriorityBar level={priority} />
    </div>
  )
}

export function Sparkline({ points, color = 'hsl(var(--v3-success-text))' }: { points: number[]; color?: string }) {
  const max = Math.max(...points)
  const min = Math.min(...points)
  const range = max - min || 1
  const w = 100
  const h = 32
  const step = w / (points.length - 1)
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${h - ((p - min) / range) * h}`)
    .join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8" preserveAspectRatio="none">
      <path d={d} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Donut({
  pct,
  color = 'hsl(var(--v3-success-text))',
  size = 72,
  label,
}: {
  pct: number
  color?: string
  size?: number
  label?: string
}) {
  const stroke = size * 0.14
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ height: size, width: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="hsl(var(--v3-bg-elevated))" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      {label && (
        <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums">
          {label}
        </span>
      )}
    </div>
  )
}

export function SegmentedBar({ segments, filled, color = 'hsl(var(--v3-success-text))' }: { segments: number; filled: number; color?: string }) {
  return (
    <div className="v3-segments">
      {Array.from({ length: segments }).map((_, i) => (
        <span
          key={i}
          className="v3-segment"
          style={i < filled ? { background: color } : undefined}
          data-filled={i < filled}
        />
      ))}
    </div>
  )
}

export function GreetingHeader({
  eyebrow,
  name,
  sentence,
}: {
  eyebrow: string
  name: string
  sentence: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="v3-greeting-eyebrow">{eyebrow}</p>
        <p className="v3-greeting-name">{name}</p>
      </div>
      <p className="v3-greeting-sentence">{sentence}</p>
    </div>
  )
}

const AVATAR_PALETTE = ['#60A5FA', '#A78BFA', '#34D399', '#FBBF24', '#F87171', '#38BDF8']

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
}

function colorForName(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}

export function Avatar({ name, size = 'md', color }: { name: string; size?: 'sm' | 'md' | 'lg'; color?: string }) {
  return (
    <span className="v3-avatar" data-size={size} style={{ background: color ?? colorForName(name) }}>
      {initials(name)}
    </span>
  )
}

export function AssigneeRow({ name, role, color }: { name: string; role: string; color?: string }) {
  return (
    <div className="v3-assignee-row">
      <Avatar name={name} color={color} />
      <div className="min-w-0">
        <p className="v3-assignee-name truncate">{name}</p>
        <p className="v3-assignee-role truncate">{role}</p>
      </div>
    </div>
  )
}

export interface DetailCardAssignee {
  name: string
  role: string
  color?: string
}

/**
 * Detail / event card — the "expand for full context" pattern: tag + flag
 * pills, title, meta/due lines, assignees, a clamped description, and a
 * sticky action bar. Same shape whether it's a meeting, a task, or a CRM
 * client record — only the fields change.
 */
export function DetailCard({
  tag,
  tagTone = 'info',
  flag,
  title,
  meta,
  due,
  assignees,
  description,
  actionLabel,
  actionMeta,
  actionIcon,
}: {
  tag?: string
  tagTone?: Tone
  flag?: string
  title: string
  meta?: string
  due?: string
  assignees?: DetailCardAssignee[]
  description?: string
  actionLabel?: string
  actionMeta?: string
  actionIcon?: React.ReactNode
}) {
  return (
    <div className="v3-detail-card">
      <div className="v3-detail-body">
        {(tag || flag) && (
          <div className="v3-detail-tags">
            {tag ? <TagPill label={tag} tone={tagTone} /> : <span />}
            {flag && <Pill>{flag}</Pill>}
          </div>
        )}
        <p className="v3-detail-title">{title}</p>
        {(meta || due) && (
          <p className="v3-detail-meta">
            {meta}
            {meta && due && ' · '}
            {due}
          </p>
        )}
        {assignees && assignees.length > 0 && (
          <div className="flex flex-col gap-2.5">
            {assignees.map((a) => (
              <AssigneeRow key={a.name} {...a} />
            ))}
          </div>
        )}
        {description && <p className="v3-detail-description">{description}</p>}
      </div>
      {actionLabel && (
        <div className="v3-detail-actionbar">
          <button className="v3-btn v3-btn-primary !h-9 !px-4 text-xs">
            {actionIcon}
            {actionLabel}
          </button>
          {actionMeta && <span className="v3-detail-actionbar-meta">{actionMeta}</span>}
        </div>
      )}
    </div>
  )
}

export function IconRail({
  icons,
  active,
}: {
  icons: { key: string; icon: React.ReactNode }[]
  active: string
}) {
  return (
    <div className="v3-rail">
      {icons.map((i) => (
        <div key={i.key} className="v3-rail-icon" data-active={i.key === active}>
          {i.icon}
        </div>
      ))}
    </div>
  )
}
