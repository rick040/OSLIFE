import { useEffect, useState } from 'react'

/**
 * The gym's 27" portrait wall screen (≈37 × 63 cm) vs. the wall tablet. Both
 * load /tablet/workout; the big screen is recognised by being portrait and
 * very tall (1080×1920 at 100%, 1440×2560 at 150% scaling, 864×1536 at 125% —
 * all clear 1500px, while the tallest iPad in portrait is ~1370px).
 *
 * Force it either way with ?wall=1 / ?wall=0 in the URL (e.g. to preview on a
 * laptop, or if the OS scaling puts the screen under the threshold).
 */
const WALL_QUERY = '(orientation: portrait) and (min-height: 1500px)'

function urlOverride(): boolean | null {
  const v = new URLSearchParams(window.location.search).get('wall')
  if (v === '1' || v === 'true') return true
  if (v === '0' || v === 'false') return false
  return null
}

export function useWallDisplay(): boolean {
  const [matches, setMatches] = useState(() => urlOverride() ?? window.matchMedia(WALL_QUERY).matches)

  useEffect(() => {
    if (urlOverride() != null) return
    const mql = window.matchMedia(WALL_QUERY)
    const onChange = () => setMatches(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  // Scale every rem with the screen width (see html.wall-display in
  // index.css) so the layout is the same physical size at any OS scaling,
  // and keep the screen awake — nobody taps a wall display to wake it.
  useEffect(() => {
    if (!matches) return
    const root = document.documentElement
    root.classList.add('wall-display')

    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const acquire = async () => {
      if (document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return
      try {
        const next = await navigator.wakeLock.request('screen')
        if (cancelled) void next.release()
        else lock = next
      } catch {
        // Not allowed here (insecure origin, battery saver, no user gesture yet) — the screen may dim; harmless.
      }
    }
    // A wake lock is dropped whenever the tab is hidden; take it again on return.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire()
    }
    void acquire()
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      root.classList.remove('wall-display')
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release()
    }
  }, [matches])

  return matches
}
