import { DOMAIN_HEX } from '../../domains'
import { DOMAIN_ICON } from './domainIcons'
import type { DomainLevel } from '../../character'

/**
 * RuneScape's own convention for a skill: an icon with the current level
 * badged onto its corner, not a color swatch and a percentage. Reused
 * everywhere a domain/skill needs to identify itself at a glance — the
 * skill-tree branch header, the attribute-bar section header, the "nearest
 * level-up" nudge in the character header.
 */
export function DomainSkillIcon({ level, size = 40 }: { level: DomainLevel; size?: number }) {
  const hex = DOMAIN_HEX[level.domain]
  const Icon = DOMAIN_ICON[level.domain]
  const badgeSize = Math.round(size * 0.52)
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span
        className="flex items-center justify-center rounded-lg w-full h-full border"
        style={{ borderColor: `${hex}55`, backgroundColor: `${hex}14` }}
      >
        <Icon className="h-1/2 w-1/2" style={{ color: hex }} aria-hidden="true" />
      </span>
      <span
        className={`absolute -bottom-1.5 -right-1.5 flex items-center justify-center rounded-full border-2 bg-canvas font-mono font-bold tabular-nums leading-none ${level.atMaxLevel ? 'shadow-[0_0_6px_var(--tw-shadow-color)]' : ''}`}
        style={{
          width: badgeSize,
          height: badgeSize,
          fontSize: Math.max(9, Math.round(size * 0.24)),
          borderColor: hex,
          color: hex,
          ...(level.atMaxLevel ? ({ '--tw-shadow-color': hex } as React.CSSProperties) : {}),
        }}
      >
        {level.level}
      </span>
    </span>
  )
}
