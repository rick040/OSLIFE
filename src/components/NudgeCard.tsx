import { AlertTriangle, Bell, Sparkles, ChevronRight, type LucideIcon } from 'lucide-react'
import type { Domain, Nudge } from '../types'

export type NudgeTone = 'urgent' | 'attention' | 'calm'

export interface DashNudge {
  text: string
  domain: Domain
  /** short "why this surfaced" line, shown as a subtle source tag */
  reason: string
  tone: NudgeTone
  /** optional jump to the screen where you can act on it */
  cta?: { label: string; view: string }
}

const TONE: Record<NudgeTone, { hex: string; icon: LucideIcon }> = {
  urgent: { hex: '#C58392', icon: AlertTriangle },
  attention: { hex: '#C6A05B', icon: Bell },
  calm: { hex: '#6FA07C', icon: Sparkles },
}

/**
 * Adapt a stored (Reflect-authored) Nudge into the structured shape the card
 * renders: it derives the tone from the nudge id and maps it to a screen to act
 * on. Shared by the Dashboard and Today headers so they stay in sync.
 */
export function storeNudgeToDash(nudge: Nudge): DashNudge {
  const tone: NudgeTone =
    nudge.id === 'nudge-overdue' || nudge.id === 'nudge-blocked'
      ? 'urgent'
      : nudge.id === 'nudge-calm'
        ? 'calm'
        : 'attention'
  const ctaMap: Record<string, { label: string; view: string } | undefined> = {
    'nudge-overdue': { label: 'Naar Geheugen', view: 'memory' },
    'nudge-blocked': { label: 'Naar Projecten', view: 'projects' },
    'nudge-corr': { label: 'Naar Reflectie', view: 'reflect' },
    'nudge-next': { label: 'Naar Geheugen', view: 'memory' },
    'nudge-calm': { label: 'Naar Noordster', view: 'northstar' },
  }
  return {
    text: nudge.text,
    domain: nudge.domain,
    reason: nudge.reason || 'gekozen uit je geheugen',
    tone,
    cta: ctaMap[nudge.id],
  }
}

/**
 * One ranked row: tone-colored icon, the nudge text, an optional one-tap
 * jump. Shared by the single-nudge banner and the multi-item Prioriteiten
 * list so both stay visually identical.
 */
function NudgeRow({ nudge, onNav }: { nudge: DashNudge; onNav: (v: string) => void }) {
  const tone = TONE[nudge.tone]
  const Icon = tone.icon

  return (
    <div
      className="flex items-start gap-2.5 py-2.5 px-3.5"
      style={{ borderLeft: `3px solid ${tone.hex}` }}
      title={nudge.reason}
    >
      <Icon className="h-4 w-4 shrink-0 mt-0.5" style={{ color: tone.hex }} aria-hidden />
      {/* line-clamp-2, not a single-line truncate: real nudge text (an overdue
          loop's title, a correlation's detail) is often longer than one line
          and used to get chopped into an unreadable fragment like
          "Leverage …" — two lines keeps it compact but still legible. */}
      <p className="text-sm text-ink line-clamp-2 flex-1 min-w-0">{nudge.text}</p>
      {nudge.cta && (
        <button
          onClick={() => onNav(nudge.cta!.view)}
          className="shrink-0 inline-flex items-center gap-0.5 text-xs font-semibold rounded-lg px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 hover:bg-sunken transition-colors"
          style={{ color: tone.hex }}
        >
          {nudge.cta.label}
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

/**
 * The daily nudge — genuinely a nudge now, not a headline: one line, a tone-
 * colored icon, an optional one-tap jump. It used to be a full card with
 * three badge rows, a 15px paragraph and a separate source line, which read
 * as a headline event rather than a passing prompt. Kept to a single ~44px
 * row on purpose so it can never dominate the screen it sits on top of.
 */
export default function NudgeCard({ nudge, onNav }: { nudge: DashNudge; onNav: (v: string) => void }) {
  return <NudgeRow nudge={nudge} onNav={onNav} />
}

/**
 * Ranked "Prioriteiten" list — up to a handful of real, currently-true
 * things that need attention today, most urgent first, instead of a single
 * nudge that can only ever surface one of them at a time.
 */
export function PriorityList({ items, onNav }: { items: DashNudge[]; onNav: (v: string) => void }) {
  return (
    <div className="divide-y divide-line">
      {items.map((item, i) => (
        <NudgeRow key={`${item.domain}-${i}`} nudge={item} onNav={onNav} />
      ))}
    </div>
  )
}
