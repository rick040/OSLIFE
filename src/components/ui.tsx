import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { Domain, Sentiment } from '../types'
import { DOMAIN_META, SENTIMENT_META } from '../domains'
import { ArrowRight } from 'lucide-react'
import { cn } from '../lib/utils'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from './ui/alert-dialog'

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

// ── WCAG contrast helpers ────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace('#', '')
  return [parseInt(c.substring(0, 2), 16), parseInt(c.substring(2, 4), 16), parseInt(c.substring(4, 6), 16)]
}

/** WCAG relative luminance (0..1) from sRGB 0-255 channels. */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const [fr, fg, fb] = [f(r), f(g), f(b)]
  return 0.2126 * fr + 0.7152 * fg + 0.0722 * fb
}

/** WCAG contrast ratio (1..21) between two sRGB colors. */
function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

const WHITE: [number, number, number] = [255, 255, 255]
const DARK_TEXT: [number, number, number] = [0x17, 0x17, 0x17]

/**
 * Pick whichever of white/near-black text actually contrasts better against
 * `hex` — never a fixed luminance-threshold guess, which got 3 of OSLIFE's 4
 * status colors wrong (picked white text at ~3:1, under the 4.5:1 AA
 * minimum, because that heuristic's cutoff didn't match how sRGB luminance
 * actually reads once weighted by the eye's green sensitivity). Falls back
 * to progressively darkening the fill itself in the rare case neither
 * candidate clears 4.5:1, so a solid badge can never ship under AA.
 */
function accessibleTextOn(hex: string): { color: string; background: string } {
  const rgb = hexToRgb(hex)
  const whiteRatio = contrastRatio(WHITE, rgb)
  const darkRatio = contrastRatio(DARK_TEXT, rgb)
  const useWhite = whiteRatio >= darkRatio
  const best = useWhite ? whiteRatio : darkRatio
  if (best >= 4.5) return { color: useWhite ? '#ffffff' : '#171717', background: hex }
  // Neither candidate clears AA — darken the fill in steps until white text does.
  let [r, g, b] = rgb
  for (let i = 0; i < 8 && contrastRatio(WHITE, [r, g, b]) < 4.5; i++) {
    r = Math.round(r * 0.85)
    g = Math.round(g * 0.85)
    b = Math.round(b * 0.85)
  }
  return { color: '#ffffff', background: `rgb(${r}, ${g}, ${b})` }
}

/**
 * Hex-tinted badge. Two treatments:
 *  - default (categorical/low-key): text in `hex`, background the same hex at
 *    ~13% coverage (`hex + '22'`) — for identity tags (priority, domain, a
 *    due-date accent) that shouldn't compete for attention.
 *  - `solid` (status/vivid): filled `hex` background with white or dark text
 *    (picked by contrast) — for workflow status that should read as a clear
 *    signal, not a soft tint. Mirrors the categorical-vs-semantic badge split
 *    from Astryx's design system: identity stays pastel, status stays vivid.
 */
export function Pill({
  hex,
  className,
  solid,
  children,
}: {
  hex: string
  className?: string
  solid?: boolean
  children: React.ReactNode
}) {
  return (
    <span className={className} style={solid ? accessibleTextOn(hex) : { color: hex, background: `${hex}22` }}>
      {children}
    </span>
  )
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

// ── lightweight modal overlay ──────────────────────────────────────────────────
// Shared scrim + panel wrapper for the app's lighter (non-Sheet) modals. `tone`
// picks the exact scrim style each caller already used; `className` overrides the
// container's alignment/padding and `panelClassName` styles the panel itself, so
// every existing modal keeps its current look verbatim.
const OVERLAY_TONE = {
  /** plain dark scrim (Money editor, Braindump detail) */
  black: 'bg-black/40',
  /** dark scrim + light blur (Dog entry modal) */
  'black-blur': 'bg-black/40 backdrop-blur-sm',
  /** soft themed scrim + light blur (Settings, LoopExplainer) */
  'scrim-blur': 'bg-scrim/40 backdrop-blur-sm',
} as const

/**
 * Built on @radix-ui/react-dialog directly (not shadcn's pre-styled
 * DialogContent, which hardcodes a centered max-w-lg layout) so every existing
 * caller's `className`/`panelClassName` — several of which are a mobile-
 * bottom-sheet/desktop-centered responsive layout — keeps working unchanged.
 * `open` is always true: this component only ever exists in the tree while
 * its caller wants it shown, so Escape/outside-click/close just need to
 * reach `onClose` — the caller unmounts it for real.
 */
export function Overlay({
  onClose,
  tone = 'black',
  className = 'flex items-end sm:items-center justify-center p-4',
  panelClassName = '',
  children,
}: {
  onClose: () => void
  tone?: keyof typeof OVERLAY_TONE
  /** container layout (alignment/padding/animation) — replaces the default */
  className?: string
  /** panel styling (background, radius, sizing, scrolling) */
  panelClassName?: string
  children: React.ReactNode
}) {
  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            OVERLAY_TONE[tone],
          )}
        />
        <div className={cn('fixed inset-0 z-50', className)}>
          <DialogPrimitive.Content
            className={cn(
              'relative data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
              panelClassName,
            )}
          >
            {children}
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// ── in-app confirm dialog ──────────────────────────────────────────────────────
// Styled replacement for window.confirm(): title + optional message + cancel/
// confirm buttons. `danger` renders the confirm button red (destructive actions).
// Built on shadcn's AlertDialog (real focus trap + Escape-to-close) — same
// always-open trick as Overlay above. Unlike the old raw-div version, this does
// NOT close on backdrop click (AlertDialog's deliberate behavior, to avoid an
// accidental miss-click silently dismissing a destructive confirmation) — only
// Escape, Cancel, or Confirm dismiss it now.
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Verwijderen',
  cancelLabel = 'Annuleer',
  danger = true,
  onCancel,
  onConfirm,
}: {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <AlertDialog open onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent className="max-w-sm rounded-3xl border-line shadow-pop p-5">
        <AlertDialogHeader className="text-left space-y-1.5">
          <AlertDialogTitle className="text-base font-semibold">{title}</AlertDialogTitle>
          {message && <AlertDialogDescription className="text-sm text-muted">{message}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row gap-2 sm:justify-stretch sm:space-x-0 mt-2">
          <AlertDialogCancel className="flex-1 mt-0 rounded-xl bg-sunken text-muted text-sm font-semibold border-line">
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={cn(
              'flex-1 rounded-xl text-white text-sm font-semibold',
              danger ? 'bg-red-500 hover:bg-red-600' : 'bg-forest hover:bg-forest-hi',
            )}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sm text-faint italic py-6 text-center border border-dashed border-line rounded-xl">
      {children}
    </div>
  )
}

/**
 * Empty state with a concrete "here's the fastest way to set this up" suggestion
 * and an optional call-to-action. Shown when a domain has no data yet, so the
 * homescreen tells you how to wire it up instead of rendering a blank card.
 */
export function SetupHint({
  icon: Icon,
  title,
  children,
  cta,
  onCta,
}: {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  children?: React.ReactNode
  cta?: string
  onCta?: () => void
}) {
  return (
    <div className="rounded-xl border border-dashed border-line p-4 text-center">
      {Icon && (
        <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-sunken">
          <Icon className="h-4 w-4 text-muted" />
        </div>
      )}
      <div className="text-sm font-medium text-ink">{title}</div>
      {children && <p className="text-xs text-faint mt-1 leading-relaxed">{children}</p>}
      {cta && onCta && (
        <button
          onClick={onCta}
          className="btn-ghost mx-auto mt-3 !py-1.5 text-xs"
        >
          {cta} <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

/**
 * Block-segmented progress — `total` discrete pills, `done` of them filled.
 * Reads as tangible, countable progress (today's 3rd of 5 habits, session
 * 4/12) rather than an abstract percentage bar; small, frequent completion
 * feedback like this is a well-established ADHD-friendly pattern (visible,
 * chunked progress beats one big number). Caps rendered segments at 12 —
 * beyond that a bar communicates better than a wall of dots — and always
 * exposes the raw fraction via `aria-label` for screen readers.
 */
export function SegmentedProgress({
  done,
  total,
  color = 'bg-forest',
}: {
  done: number
  total: number
  color?: string
}) {
  if (total <= 0) return null
  const segments = Math.min(total, 12)
  const filledSegments = Math.round((done / total) * segments)
  return (
    <div
      className="flex items-center gap-1"
      role="img"
      aria-label={`${done} van ${total} voltooid`}
    >
      {Array.from({ length: segments }).map((_, i) => (
        <span
          key={i}
          aria-hidden
          className={`h-1.5 flex-1 rounded-full ${i < filledSegments ? color : 'bg-line'}`}
        />
      ))}
    </div>
  )
}

/**
 * Minimal inline trend line — no axes, no tooltip, just "is this going up or
 * down". For a stat tile's corner, not for analysis (Vitals/Signalen's real
 * charts cover that). `values` in chronological order; renders nothing
 * below 2 points.
 */
export function Sparkline({
  values,
  className = 'text-forest',
  height = 28,
  width = 72,
}: {
  values: number[]
  className?: string
  height?: number
  width?: number
}) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const step = width / (values.length - 1)
  const points = values
    .map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`)
    .join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
