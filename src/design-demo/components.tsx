import { Check, X, Sparkles, Link2, Plus, Bell } from 'lucide-react'

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
      <p className="text-sm font-medium flex-1 min-w-0 truncate">{title}</p>
      {tag && <TagPill label={tag} tone={tagTone} />}
      <span className="text-sm font-medium tabular-nums" style={{ color: 'hsl(var(--v3-text-primary))' }}>
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
      <span className="text-sm font-medium w-28 shrink-0 truncate">{label}</span>
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
        <span className="absolute inset-0 flex items-center justify-center text-sm font-medium tabular-nums">
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

/** AI suggestion card — a proposal the user can accept or dismiss with one tap. */
export function SuggestionCard({
  title,
  subtitle,
  onAccept,
  onDismiss,
}: {
  title: string
  subtitle?: string
  onAccept?: () => void
  onDismiss?: () => void
}) {
  return (
    <div className="v3-suggestion-card">
      <span className="v3-icon-badge">
        <Sparkles className="h-4 w-4" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="v3-micro-label mb-1">AI suggestion</p>
        <p className="text-sm font-medium leading-snug">{title}</p>
        {subtitle && (
          <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--v3-text-secondary))' }}>
            {subtitle}
          </p>
        )}
      </div>
      <div className="v3-suggestion-actions">
        <button className="v3-suggestion-btn" data-tone="accept" onClick={onAccept} aria-label="Accept">
          <Check className="h-3.5 w-3.5" />
        </button>
        <button className="v3-suggestion-btn" data-tone="dismiss" onClick={onDismiss} aria-label="Dismiss">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

/** Knowledge / memory card — a note preview with tags and a backlink count. */
export function KnowledgeCard({
  title,
  snippet,
  tags,
  backlinks,
  updated,
}: {
  title: string
  snippet: string
  tags: { label: string; tone?: Tone }[]
  backlinks: number
  updated: string
}) {
  return (
    <button className="v3-card flex flex-col gap-2 !p-4">
      <p className="text-sm font-medium">{title}</p>
      <p className="v3-knowledge-snippet">{snippet}</p>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {tags.map((t) => (
          <TagPill key={t.label} label={t.label} tone={t.tone} />
        ))}
      </div>
      <div className="v3-knowledge-footer">
        <span className="text-xs" style={{ color: 'hsl(var(--v3-text-secondary))' }}>
          {updated}
        </span>
        <span className="inline-flex items-center gap-1 text-xs" style={{ color: 'hsl(var(--v3-text-secondary))' }}>
          <Link2 className="h-3 w-3" />
          {backlinks}
        </span>
      </div>
    </button>
  )
}

/** Dashed "add" card — quick-create slot (add task, add goal, connect an account). */
export function AddCard({ label, icon, onClick }: { label: string; icon?: React.ReactNode; onClick?: () => void }) {
  return (
    <button className="v3-add-card" onClick={onClick}>
      <span className="v3-add-card-icon">{icon ?? <Plus className="h-4 w-4" />}</span>
      <span className="text-sm font-medium">{label}</span>
    </button>
  )
}

export interface NotificationItem {
  icon: React.ReactNode
  text: string
  time: string
  unread?: boolean
}

export interface NotificationGroup {
  label: string
  items: NotificationItem[]
}

/** Full-screen notification / log center overlay — grouped list + mark-all-read. */
export function NotificationCenter({
  open,
  onClose,
  groups,
}: {
  open: boolean
  onClose: () => void
  groups: NotificationGroup[]
}) {
  if (!open) return null
  return (
    <div className="v3-notif-overlay" onClick={onClose}>
      <div className="v3-notif-panel" onClick={(e) => e.stopPropagation()}>
        <div className="v3-notif-header">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <p className="v3-heading">Notifications</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="v3-btn v3-btn-ghost !h-8 !px-3 text-xs">Mark all read</button>
            <button className="v3-notif-close" onClick={onClose} aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="v3-notif-list">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="v3-notif-group-label">{g.label}</p>
              {g.items.map((item, i) => (
                <div key={i} className="v3-notif-row" data-unread={item.unread}>
                  <span className="v3-icon-badge">{item.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug">{item.text}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--v3-text-secondary))' }}>
                      {item.time}
                    </p>
                  </div>
                  <span className="v3-notif-dot" data-visible={!!item.unread} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Weekly bar chart — 7 day columns, e.g. sleep hours or workout load. */
export function WeekBarChart({
  data,
}: {
  data: { label: string; value: number; today?: boolean }[]
}) {
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <div className="v3-weekbar-row">
      {data.map((d) => (
        <div key={d.label} className="v3-weekbar-col">
          <div className="v3-weekbar-track">
            <div className="v3-weekbar-bar" data-today={d.today} style={{ height: `${(d.value / max) * 100}%` }} />
          </div>
          <span className="v3-weekbar-label">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

/** Area sparkline — a filled variant of Sparkline for "detailed graph" cards. */
export function AreaSparkline({ points, color = 'hsl(var(--v3-info-text))' }: { points: number[]; color?: string }) {
  const max = Math.max(...points)
  const min = Math.min(...points)
  const range = max - min || 1
  const w = 100
  const h = 40
  const step = w / (points.length - 1)
  const line = points.map((p, i) => [i * step, h - ((p - min) / range) * h])
  const linePath = line.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ')
  const areaPath = `${linePath} L ${w} ${h} L 0 ${h} Z`
  const gradId = 'v3-area-grad'
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-16" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />
      <path d={linePath} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Donut + legend — ring on the left, breakdown rows on the right (e.g. browser share). */
export function DonutLegend({
  items,
  centerLabel,
}: {
  items: { label: string; value: number; color: string }[]
  centerLabel?: string
}) {
  const total = items.reduce((s, i) => s + i.value, 0)
  let offset = 0
  const size = 120
  const stroke = 14
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ height: size, width: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          {items.map((item) => {
            const pct = total > 0 ? item.value / total : 0
            const dash = `${pct * c} ${c - pct * c}`
            const dashoffset = -offset * c
            offset += pct
            return (
              <circle
                key={item.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke={item.color}
                strokeWidth={stroke}
                fill="none"
                strokeDasharray={dash}
                strokeDashoffset={dashoffset}
              />
            )
          })}
        </svg>
        {centerLabel && (
          <span className="absolute inset-0 flex items-center justify-center text-lg font-medium tabular-nums">
            {centerLabel}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {items.map((item) => (
          <div key={item.label} className="v3-legend-row">
            <span className="v3-legend-key">
              <span className="v3-legend-dot" style={{ background: item.color }} />
              {item.label}
            </span>
            <span className="v3-legend-value">{total > 0 ? Math.round((item.value / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
