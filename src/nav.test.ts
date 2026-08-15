import { describe, it, expect } from 'vitest'
import { SCREENS, NAV_SCREENS, ARCHIVED_SCREENS, GROUP_ORDER } from './nav'

// The registry is the single source of truth for routing, the sidebar, the app
// grid, the command menu and the bottom bar. Before this test those surfaces
// had quietly drifted apart from it — `primary` was set on seven screens while
// the bottom bar rendered a different hardcoded five, so three `primary`
// screens never appeared and one bar item wasn't `primary` at all. These are
// the invariants that keep the flag honest.

describe('nav registry', () => {
  it('has no duplicate screen ids', () => {
    const ids = SCREENS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('places every screen in a known group', () => {
    for (const s of SCREENS) expect(GROUP_ORDER).toContain(s.group)
  })

  it('splits cleanly into live and archived — nothing lost, nothing counted twice', () => {
    expect(NAV_SCREENS.length + ARCHIVED_SCREENS.length).toBe(SCREENS.length)
    const live = new Set(NAV_SCREENS.map((s) => s.id))
    for (const s of ARCHIVED_SCREENS) expect(live.has(s.id)).toBe(false)
  })

  it('never offers an archived screen in navigation', () => {
    for (const s of NAV_SCREENS) expect(s.archived).toBeFalsy()
  })

  it('keeps the Archief index itself reachable', () => {
    // Archiving is reversible only if there's a way back in. If the index
    // itself were archived, the parked screens would be reachable by URL alone.
    const archief = NAV_SCREENS.find((s) => s.id === 'archief')
    expect(archief).toBeDefined()
    expect(ARCHIVED_SCREENS.some((s) => s.id === 'archief')).toBe(false)
  })

  it('never marks an archived screen primary', () => {
    // A parked screen holding a bottom-bar slot is the exact failure this
    // redesign started from (Schoonmaak held one for 16 dead days).
    for (const s of ARCHIVED_SCREENS) expect(s.primary).toBeFalsy()
  })

  it('fits the bottom bar: at most 4 primary screens', () => {
    // mobile-bottom-nav renders 4 + "Meer". A fifth primary screen doesn't
    // error — it silently falls off the bar, which is worse.
    expect(NAV_SCREENS.filter((s) => s.primary).length).toBeLessThanOrEqual(4)
  })
})
