import { AlertTriangle, Bell, Sparkles, ArrowRight, type LucideIcon } from 'lucide-react'
import type { Domain, Nudge } from '../types'
import { DOMAIN_META, DOMAIN_HEX } from '../domains'

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

const TONE: Record<NudgeTone, { hex: string; label: string; icon: LucideIcon }> = {
  urgent: { hex: '#C58392', label: 'Urgent', icon: AlertTriangle },
  attention: { hex: '#C6A05B', label: 'Aandacht', icon: Bell },
  calm: { hex: '#6FA07C', label: 'Rustig', icon: Sparkles },
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
 * The daily nudge, redesigned from a plain paragraph into a scannable, actionable
 * card: a tone-colored accent + icon, a "why this surfaced" source tag, the
 * message itself, and a one-tap jump to the screen where you can act on it.
 */
export default function NudgeCard({ nudge, onNav }: { nudge: DashNudge; onNav: (v: string) => void }) {
  const tone = TONE[nudge.tone]
  const Icon = tone.icon
  const domain = DOMAIN_META[nudge.domain]
  const domainHex = DOMAIN_HEX[nudge.domain]

  return (
    <div
      className="card relative overflow-hidden p-4 sm:p-5 animate-fade-up"
      style={{
        animationDelay: '40ms',
        borderColor: `${tone.hex}55`,
        background: `linear-gradient(135deg, ${tone.hex}14, ${tone.hex}05 55%, transparent)`,
      }}
    >
      {/* left accent bar */}
      <div aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: tone.hex }} />

      <div className="flex items-start gap-3 sm:gap-4 pl-1.5">
        {/* icon tile */}
        <div
          className={`shrink-0 rounded-xl p-2.5 ${nudge.tone === 'urgent' ? 'animate-pulse-ring' : ''}`}
          style={{ background: `${tone.hex}22`, color: tone.hex }}
        >
          <Icon className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          {/* label row */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: tone.hex }}>
              Nudge van vandaag
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: `${tone.hex}22`, color: tone.hex }}
            >
              {tone.label}
            </span>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ background: `${domainHex}1f`, color: domainHex }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: domainHex }} />
              {domain.label}
            </span>
          </div>

          {/* message */}
          <p className="text-[15px] leading-relaxed text-ink mt-2 font-medium">{nudge.text}</p>

          {/* source + action */}
          <div className="flex flex-wrap items-center justify-between gap-2 mt-2.5">
            <span className="text-xs text-faint italic">{nudge.reason}</span>
            {nudge.cta && (
              <button
                onClick={() => onNav(nudge.cta!.view)}
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors hover:brightness-95"
                style={{ background: `${tone.hex}22`, color: tone.hex }}
              >
                {nudge.cta.label}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
