import { cn } from '../lib/utils'

export type OrbState = 'idle' | 'thinking' | 'listening'

// Pure CSS — no animation library needed. `idle` is a slow, calm breathe;
// `thinking` is faster and reaches a brighter peak so the orb visibly "comes
// alive" while a brain call is in flight; `listening` recolors the same
// gradient family so it still reads as HEYRA, not an alert.
const STATE_ANIMATION: Record<OrbState, string> = {
  idle: 'animate-orb-breathe',
  thinking: 'animate-orb-think',
  listening: 'animate-pulse-ring',
}

// A soft, diffuse, multi-color haze — no defined sphere edge, meant to sit
// as a background wash directly behind the current question/reply text
// (heavy blur does all the shaping). prjct purple + forest green + a touch
// of amber is HEYRA's own accent blend, not a generic gradient.
const STATE_GRADIENT: Record<OrbState, string> = {
  idle: 'radial-gradient(circle at 40% 35%, rgba(196,181,253,0.55) 0%, rgba(110,231,183,0.4) 45%, transparent 75%)',
  thinking: 'radial-gradient(circle at 40% 35%, rgba(221,214,254,0.65) 0%, rgba(52,211,153,0.5) 45%, transparent 75%)',
  listening: 'radial-gradient(circle at 40% 35%, rgba(253,164,175,0.6) 0%, rgba(251,113,133,0.45) 45%, transparent 75%)',
}

/**
 * HEYRA's ambient presence — a soft colored haze behind the current reply,
 * not a static icon+wordmark. Meant to be dropped into a `relative` wrapper
 * as an absolutely-positioned background layer, with the actual text
 * content in front of it (see Heyra.tsx) — same "glow sits behind the
 * question" treatment as the reference screens this is modeled on.
 */
export default function HeyraOrb({ state = 'idle', className }: { state?: OrbState; className?: string }) {
  const anim = STATE_ANIMATION[state]
  return (
    <div className={cn('pointer-events-none absolute inset-0 flex items-center justify-center', className)} aria-hidden>
      {/* No overflow-hidden here — the heavy blur needs to bleed past its own
          box to fade to nothing, the same soft edgeless glow as the
          reference; clipping it would show a visible rectangular edge. */}
      <div
        className={cn('rounded-full blur-3xl', anim)}
        style={{ width: '60%', maxWidth: 320, aspectRatio: '1 / 1', background: STATE_GRADIENT[state] }}
      />
    </div>
  )
}
