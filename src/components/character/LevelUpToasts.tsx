import { useEffect, useState, useRef } from 'react'
import { Trophy } from 'lucide-react'
import { domainMeta, DOMAIN_HEX } from '../../domains'
import type { DomainLevel } from '../../character'

const STORAGE_KEY = 'oslife.character.lastSeenLevels'

interface SeenLevels {
  total: number
  domains: Record<string, number>
}

function readSeen(): SeenLevels | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SeenLevels) : null
  } catch {
    return null
  }
}

function writeSeen(seen: SeenLevels) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seen))
  } catch {
    // best-effort — blocked/full localStorage just means no level-up toasts, not a crash
  }
}

interface Toast {
  id: string
  text: string
  hex: string
}

/**
 * RuneScape's iconic "Congratulations, you've levelled up!" moment — detected
 * client-side by comparing today's domain levels (src/character.ts
 * computeDomainLevels, itself derived from real goals/milestones) against
 * the last levels this browser saw, cached in localStorage. The very first
 * time this runs it only seeds the cache — a returning user with existing
 * progress shouldn't get fireworks for work already done, only for what
 * changes from here on.
 */
export function LevelUpToasts({ totalLevel, levels }: { totalLevel: number; levels: DomainLevel[] }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const levelsKey = levels.map((l) => `${l.domain}:${l.level}`).join(',')
  const levelsRef = useRef(levels)
  levelsRef.current = levels

  useEffect(() => {
    const current = levelsRef.current
    const seen = readSeen()
    const nextSeen: SeenLevels = { total: totalLevel, domains: Object.fromEntries(current.map((l) => [l.domain, l.level])) }

    if (!seen) {
      writeSeen(nextSeen)
      return
    }

    const newToasts: Toast[] = []
    for (const l of current) {
      const prev = seen.domains[l.domain]
      if (prev !== undefined && l.level > prev) {
        const meta = domainMeta(l.domain)
        newToasts.push({ id: `${l.domain}-${l.level}`, text: `${meta.label} → level ${l.level}!`, hex: DOMAIN_HEX[l.domain] })
      }
    }

    if (nextSeen.total !== seen.total || newToasts.length) writeSeen(nextSeen)
    if (newToasts.length) setToasts((t) => [...t, ...newToasts])
  }, [levelsKey, totalLevel])

  useEffect(() => {
    if (!toasts.length) return
    const timer = setTimeout(() => setToasts((t) => t.slice(1)), 5000)
    return () => clearTimeout(timer)
  }, [toasts])

  if (!toasts.length) return null

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center gap-2 rounded-xl border-2 bg-surface px-4 py-2.5 shadow-pop animate-fade-up"
          style={{ borderColor: t.hex }}
        >
          <Trophy className="h-4 w-4 shrink-0" style={{ color: t.hex }} aria-hidden="true" />
          <span className="text-sm font-semibold text-ink">{t.text}</span>
        </div>
      ))}
    </div>
  )
}
