import type { Domain, Sentiment } from '../types'
import { DOMAIN_META, SENTIMENT_META } from '../domains'

export function DomainChip({ domain, small }: { domain: Domain; small?: boolean }) {
  const m = DOMAIN_META[domain]
  return (
    <span className={`chip ${m.soft} ${small ? 'text-[10px] px-2 py-0' : ''}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  )
}

export function SentimentChip({ sentiment }: { sentiment: Sentiment }) {
  const m = SENTIMENT_META[sentiment]
  return <span className={`chip ${m.cls}`}>{m.label}</span>
}

export function KindChip({ kind }: { kind: string }) {
  return <span className="chip bg-line text-ink-soft">{kind}</span>
}

export function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = value >= 0.7 ? 'bg-buurtkaart' : value >= 0.45 ? 'bg-personal' : 'bg-cross'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-full rounded-full bg-line overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted w-9 text-right">{pct}%</span>
    </div>
  )
}

export function SectionTitle({
  children,
  hint,
}: {
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{children}</h2>
      {hint && <p className="text-xs text-faint mt-0.5">{hint}</p>}
    </div>
  )
}

export function Ring({
  value,
  size = 56,
  stroke = 6,
  color = 'stroke-forest-hi',
  label,
  sub,
}: {
  value: number // 0..1
  size?: number
  stroke?: number
  color?: string
  label?: React.ReactNode
  sub?: React.ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, value))
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} className="stroke-line" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className={`${color} transition-all duration-700`}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        {label && <span className="text-xs font-semibold tabular-nums">{label}</span>}
        {sub && <span className="text-[8px] text-faint uppercase tracking-wide">{sub}</span>}
      </div>
    </div>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sm text-faint italic py-6 text-center border border-dashed border-line rounded-xl">
      {children}
    </div>
  )
}
