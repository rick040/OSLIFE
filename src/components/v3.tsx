import { Check, Video } from 'lucide-react'
import type { Domain } from '../types'
import { DOMAIN_META } from '../domains'
import { DomainChip } from './ui'
import { MarkdownInline } from './Markdown'

/**
 * RICK-OS shared component set — the actual production versions of the
 * patterns explored in src/design-demo (Framework/Library/Cards). Built on
 * the app's real design tokens (bg-canvas/surface/sunken, text-ink/muted/
 * faint — already the v3 dark palette, see src/index.css) rather than a
 * parallel --v3-* namespace, so these compose with every existing .card/
 * .chip/.btn utility instead of duplicating them.
 *
 * Core law (docs/design.md): number/icon/color first, label second,
 * sentence only in the greeting header. Icons stay neutral — color marks
 * an actual signal (a positive amount, an overdue date), never a category.
 */

export type Tone = 'neutral' | 'success' | 'danger' | 'warning'

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-muted',
  success: 'text-buurtkaart-deep',
  danger: 'text-cross-deep',
  warning: 'text-personal-deep',
}
const TONE_BG: Record<Tone, string> = {
  neutral: 'bg-sunken',
  success: 'bg-buurtkaart/15',
  danger: 'bg-cross/15',
  warning: 'bg-personal/15',
}

/** The one place a full sentence is allowed — an AI-style narrative greeting. */
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
    <div className="flex flex-col gap-2 animate-fade-up">
      <div>
        <p className="text-sm text-muted">{eyebrow}</p>
        <p className="text-2xl font-medium tracking-tight text-ink">{name}</p>
      </div>
      <p className="text-base text-ink-soft leading-snug [&_b]:text-ink [&_b]:font-medium">{sentence}</p>
    </div>
  )
}

/** Giant-number hero — the single focal point on a screen (docs/design.md §8). */
export function HeroStat({
  label,
  value,
  suffix,
  children,
}: {
  label: string
  value: React.ReactNode
  suffix?: string
  children?: React.ReactNode
}) {
  return (
    <div className="card-hero p-5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted mb-2">{label}</p>
      <p className="text-[2.75rem] font-medium tabular-nums leading-none text-ink">
        {value}
        {suffix && <span className="text-lg ml-1 text-ink-soft">{suffix}</span>}
      </p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}

/** Neutral stat tile — icon badge never carries category color, only the value/label do. */
export function MetricTile({
  icon: Icon,
  value,
  label,
  onClick,
  corner,
  footer,
}: {
  icon: React.ComponentType<{ className?: string }>
  value: React.ReactNode
  label: string
  onClick?: () => void
  corner?: React.ReactNode
  /** Tiny sub-line under the label — e.g. a real "bijgewerkt Xu geleden". */
  footer?: React.ReactNode
}) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp onClick={onClick} className={`card relative flex items-center gap-2.5 p-3 text-left ${onClick ? 'outline-none' : ''}`}>
      {corner && <span className="absolute right-3 top-3 hidden sm:inline-flex">{corner}</span>}
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sunken">
        <Icon className="h-4 w-4 text-ink-soft" />
      </span>
      <div className={`min-w-0 flex-1 ${corner ? 'sm:pr-11' : ''}`}>
        <div className="text-lg font-medium tabular-nums truncate leading-tight text-ink">{value}</div>
        <div className="text-xs text-faint truncate">{label}</div>
        {footer && <div className="text-[10px] text-faint/70 truncate mt-0.5">{footer}</div>}
      </div>
    </Comp>
  )
}

/** Two-tone income/expense split — the one place a full card gets a semantic fill. */
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
    <div className="grid grid-cols-2 gap-2.5">
      <div className="rounded-3xl p-4 bg-buurtkaart/12">
        <p className="text-[11px] font-medium uppercase tracking-wider text-buurtkaart-deep/80 mb-1">{leftLabel}</p>
        <p className="text-xl font-medium tabular-nums text-buurtkaart-deep">{leftValue}</p>
      </div>
      <div className="rounded-3xl p-4 bg-cross/12">
        <p className="text-[11px] font-medium uppercase tracking-wider text-cross-deep/80 mb-1">{rightLabel}</p>
        <p className="text-xl font-medium tabular-nums text-cross-deep">{rightValue}</p>
      </div>
    </div>
  )
}

/** Segmented progress + fraction — countable progress, not an abstract percentage. */
export function GoalRow({
  label,
  current,
  target,
  format = (n: number) => n.toLocaleString('nl-NL'),
  segments = 10,
  onClick,
}: {
  label: string
  current: number
  target: number
  format?: (n: number) => string
  segments?: number
  onClick?: () => void
}) {
  const pct = target > 0 ? Math.min(1, current / target) : 0
  const filled = Math.round(pct * segments)
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp onClick={onClick} className={`flex items-center gap-3 rounded-full bg-sunken px-4 py-2.5 ${onClick ? 'text-left w-full' : ''}`}>
      <span className="text-sm font-medium text-ink shrink-0 truncate max-w-[40%]">{label}</span>
      <span className="flex-1 flex gap-[3px] min-w-0">
        {Array.from({ length: segments }).map((_, i) => (
          <span key={i} className={`h-2 flex-1 rounded-full ${i < filled ? 'bg-forest' : 'bg-line'}`} />
        ))}
      </span>
      <span className="text-xs text-muted tabular-nums whitespace-nowrap">
        {format(current)} / {format(target)}
      </span>
    </Comp>
  )
}

/**
 * Detail card — the expand-for-context pattern: domain tag, title, meta
 * line, an optional progress bar, and a sticky action bar. Used for
 * anything that's "the one thing to look at first" and has a real action
 * attached to it (a focus block, an overdue payment, a blocked project).
 */
export function DetailCard({
  domain,
  flag,
  title,
  meta,
  progress,
  actions,
}: {
  domain?: Domain
  flag?: { label: string; tone: Tone }
  title: React.ReactNode
  meta?: React.ReactNode
  /** 0..1 */
  progress?: number
  actions?: React.ReactNode
}) {
  return (
    <div className="card p-0 overflow-hidden">
      <div className="p-4 flex flex-col gap-2.5">
        {(domain || flag) && (
          <div className="flex items-center justify-between">
            {domain ? <DomainTag domain={domain} /> : <span />}
            {flag && (
              <span className={`chip ${TONE_BG[flag.tone]} ${TONE_TEXT[flag.tone]}`}>{flag.label}</span>
            )}
          </div>
        )}
        <p className="text-base font-medium leading-snug text-ink">{title}</p>
        {meta && <p className="text-xs text-muted">{meta}</p>}
        {progress !== undefined && (
          <div className="h-1.5 w-full rounded-full bg-line overflow-hidden">
            <div className="h-full rounded-full bg-forest transition-all duration-700" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 px-4 py-3 bg-sunken">{actions}</div>}
    </div>
  )
}

function DomainTag({ domain }: { domain: Domain }) {
  const m = DOMAIN_META[domain]
  return (
    <span className={`chip ${m.soft}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  )
}

/** Horizontal-scroll priority/schedule card — urgency + title + one-tap action. */
export function ScheduleCard({
  tone,
  urgencyLabel,
  title,
  meta,
  badge,
  onAction,
  actionLabel = 'Bekijk',
}: {
  tone: Tone
  urgencyLabel: string
  title: string
  meta?: string
  /** corner chip — a real count tied to the nudge, e.g. "3d te laat" */
  badge?: React.ReactNode
  onAction?: () => void
  actionLabel?: string
}) {
  return (
    <div className="card p-4 w-[260px] shrink-0 flex flex-col justify-between gap-6 min-h-[152px]">
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide ${TONE_TEXT[tone]}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${TONE_BG[tone].replace('/15', '')}`} />
            {urgencyLabel}
          </span>
          {badge && <span className="chip bg-sunken text-muted shrink-0 !py-0.5">{badge}</span>}
        </div>
        <p className="text-sm font-medium leading-snug mt-2 text-ink">
          <MarkdownInline text={title} />
        </p>
        {meta && <p className="text-xs text-faint mt-1">{meta}</p>}
      </div>
      {onAction && (
        <button onClick={onAction} className="btn-ghost !py-1.5 text-xs self-start">
          {actionLabel}
        </button>
      )}
    </div>
  )
}

/**
 * Horizontal-scroll agenda card — one of today's schedule blocks: how-soon
 * urgency (color + label), the clock time, the title, its domain tag, and a
 * single one-tap action (complete). Mirrors ScheduleCard's shape so the
 * "Prioriteiten" and "Vandaag" rows read as the same family of card.
 */
export function AgendaCard({
  domain,
  title,
  start,
  status,
  tone,
  urgencyLabel,
  isCall,
  onComplete,
}: {
  domain: Domain
  title: string
  start: string
  status: 'planned' | 'done' | 'skipped'
  tone: Tone
  urgencyLabel: string
  /** swaps the action glyph for a video icon — a call/meeting, not a task */
  isCall?: boolean
  onComplete?: () => void
}) {
  const done = status === 'done'
  return (
    <div className="card p-4 w-[220px] shrink-0 flex flex-col justify-between gap-8 min-h-[176px]">
      <div className="flex items-start justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide ${done ? 'text-faint' : TONE_TEXT[tone]}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${done ? 'bg-line' : TONE_BG[tone].replace('/15', '')}`} />
          {done ? 'klaar' : urgencyLabel}
        </span>
        <span className="chip bg-sunken text-ink-soft shrink-0 tabular-nums">{start}</span>
      </div>
      <p className={`text-lg leading-snug ${done ? 'line-through text-faint' : 'text-ink font-medium'}`}>{title}</p>
      <div className="flex items-center justify-between gap-2">
        <DomainChip domain={domain} small />
        {done ? (
          <span className="shrink-0 h-9 w-9 rounded-full bg-buurtkaart/15 text-buurtkaart-deep flex items-center justify-center">
            <Check className="h-4 w-4" strokeWidth={2.5} />
          </span>
        ) : (
          onComplete && (
            <button
              onClick={onComplete}
              aria-label="Afronden"
              className="shrink-0 h-9 w-9 rounded-full bg-ink text-canvas flex items-center justify-center outline-none transition-[background-color,transform] duration-150 hover:bg-ink/85 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              {isCall ? <Video className="h-4 w-4" /> : <Check className="h-4 w-4" strokeWidth={2.5} />}
            </button>
          )
        )}
      </div>
    </div>
  )
}

/** 3-segment priority indicator — replaces a "high/medium/low" word with shape. */
export function PriorityBar({ level }: { level: 'high' | 'medium' | 'low' }) {
  const active = level === 'high' ? 3 : level === 'medium' ? 2 : 1
  const color = level === 'high' ? 'bg-cross' : level === 'medium' ? 'bg-personal' : 'bg-buurtkaart'
  return (
    <span className="inline-flex items-end gap-[2px] h-3.5 shrink-0" aria-label={`prioriteit: ${level}`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`w-[3px] rounded-full ${i < active ? color : 'bg-line'}`}
          style={{ height: `${40 + i * 30}%` }}
        />
      ))}
    </span>
  )
}

export function TaskRow({
  title,
  meta,
  priority,
  checked,
  onToggle,
}: {
  title: string
  meta?: React.ReactNode
  priority: 'high' | 'medium' | 'low'
  checked: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-sunken px-4 py-3">
      <button
        onClick={onToggle}
        aria-label={`${title} afvinken`}
        className={`shrink-0 mt-0.5 h-6 w-6 rounded-lg border flex items-center justify-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
          checked ? 'bg-forest border-forest text-white' : 'border-line-strong text-transparent hover:border-forest hover:text-forest'
        }`}
      >
        <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>
      <div className="min-w-0 flex-1 flex flex-col gap-1.5">
        <p className={`text-sm leading-snug ${checked ? 'line-through text-faint' : 'text-ink'}`}>{title}</p>
        <div className="flex items-center gap-2">
          {meta && <span className="chip bg-canvas text-muted shrink-0">{meta}</span>}
          <PriorityBar level={priority} />
        </div>
      </div>
    </div>
  )
}
