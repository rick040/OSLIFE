import { useEffect, useState } from 'react'
import { Music, Pause, Play, SkipBack, SkipForward } from 'lucide-react'

/**
 * "Now playing" on the gym screen. The data comes from the gym launcher app
 * (/gym-launcher): it reads Android's media sessions (Spotify etc.) and hands
 * them to the page through `window.OSLifeGym`. In a normal browser there is no
 * bridge, so everything here renders nothing.
 */

export interface NowPlaying {
  playing: boolean
  title: string
  artist: string
  album?: string
  app?: string
  /** data: URL of the album art, when the player provides one */
  art?: string | null
  positionMs?: number
  durationMs?: number
  /** Date.now() at the moment positionMs was measured */
  updatedAt?: number
}

interface GymBridge {
  isAvailable?: () => boolean
  nowPlaying?: () => string
  playPause?: () => void
  next?: () => void
  previous?: () => void
}

/** The launcher's bridge, or null outside the gym launcher. */
export function gymBridge(): GymBridge | null {
  const b = (window as unknown as { OSLifeGym?: GymBridge }).OSLifeGym
  try {
    return b && b.isAvailable?.() ? b : null
  } catch {
    return null
  }
}

function parse(raw: unknown): NowPlaying | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.available !== true || typeof r.title !== 'string' || !r.title) return null
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
  return {
    playing: r.playing === true,
    title: r.title,
    artist: typeof r.artist === 'string' ? r.artist : '',
    album: typeof r.album === 'string' ? r.album : undefined,
    app: typeof r.app === 'string' ? r.app : undefined,
    art: typeof r.art === 'string' && r.art.startsWith('data:image/') ? r.art : null,
    positionMs: num(r.positionMs),
    durationMs: num(r.durationMs),
    updatedAt: num(r.updatedAt),
  }
}

/** Live now-playing state pushed by the launcher (event) plus an initial pull. */
export function useNowPlaying(): NowPlaying | null {
  const [np, setNp] = useState<NowPlaying | null>(null)
  useEffect(() => {
    const bridge = gymBridge()
    if (!bridge?.nowPlaying) return
    try {
      setNp(parse(JSON.parse(bridge.nowPlaying())))
    } catch {
      // bridge answered something unexpected; wait for the next push
    }
    const onPush = (e: Event) => setNp(parse((e as CustomEvent).detail))
    window.addEventListener('oslifegym:nowplaying', onPush)
    return () => window.removeEventListener('oslifegym:nowplaying', onPush)
  }, [])
  return np
}

/** Extrapolated playback position, ticking once a second while playing. */
function usePosition(np: NowPlaying | null): number | null {
  const [now, setNow] = useState(() => Date.now())
  const playing = !!np?.playing
  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [playing])
  if (!np || np.positionMs == null || !np.durationMs) return null
  const elapsed = np.playing && np.updatedAt ? Math.max(0, now - np.updatedAt) : 0
  return Math.min(np.durationMs, np.positionMs + elapsed)
}

function Art({ np, className }: { np: NowPlaying; className: string }) {
  return np.art ? (
    <img src={np.art} alt="" className={`${className} object-cover`} />
  ) : (
    <span className={`${className} bg-sunken flex items-center justify-center`}>
      <Music className="h-1/2 w-1/2 text-faint" />
    </span>
  )
}

/** Full bar with art, title, progress and controls, pinned to the bottom of the dashboard. */
export function NowPlayingBar({ np }: { np: NowPlaying | null }) {
  const position = usePosition(np)
  if (!np) return null
  const bridge = gymBridge()
  const pct = position != null && np.durationMs ? (position / np.durationMs) * 100 : null
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 px-4 md:px-10 pb-4 md:pb-6">
      <div className="mx-auto max-w-5xl rounded-3xl bg-surface/90 backdrop-blur border border-white/5 overflow-hidden">
        <div className="flex items-center gap-4 md:gap-6 p-3 md:p-4">
          <Art np={np} className="h-14 w-14 md:h-20 md:w-20 rounded-2xl shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-base md:text-2xl font-medium text-ink truncate">{np.title}</div>
            <div className="text-sm md:text-lg text-muted truncate">
              {np.artist}
              {np.app ? <span className="text-faint"> · {np.app}</span> : null}
            </div>
          </div>
          {bridge && (
            <div className="flex items-center gap-1 md:gap-2 shrink-0">
              <button onClick={() => bridge.previous?.()} className="h-11 w-11 md:h-14 md:w-14 rounded-full flex items-center justify-center text-ink-soft active:scale-90 transition-transform" aria-label="Vorig nummer">
                <SkipBack className="h-5 w-5 md:h-7 md:w-7" />
              </button>
              <button onClick={() => bridge.playPause?.()} className="h-12 w-12 md:h-16 md:w-16 rounded-full bg-ink text-canvas flex items-center justify-center active:scale-90 transition-transform" aria-label={np.playing ? 'Pauzeren' : 'Afspelen'}>
                {np.playing ? <Pause className="h-5 w-5 md:h-7 md:w-7" /> : <Play className="h-5 w-5 md:h-7 md:w-7" />}
              </button>
              <button onClick={() => bridge.next?.()} className="h-11 w-11 md:h-14 md:w-14 rounded-full flex items-center justify-center text-ink-soft active:scale-90 transition-transform" aria-label="Volgend nummer">
                <SkipForward className="h-5 w-5 md:h-7 md:w-7" />
              </button>
            </div>
          )}
        </div>
        {pct != null && (
          <div className="h-1 bg-sunken">
            <div className="h-full bg-forest transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </div>
  )
}

/** One-line version for the workout screen, where every pixel goes to the exercise. */
export function NowPlayingPill({ np }: { np: NowPlaying | null }) {
  if (!np) return null
  return (
    <span className="inline-flex items-center gap-2 max-w-full min-w-0 align-middle">
      <Art np={np} className="h-5 w-5 md:h-7 md:w-7 rounded-md shrink-0" />
      <span className="truncate">
        <span className="text-ink-soft">{np.title}</span>
        {np.artist ? <span> · {np.artist}</span> : null}
      </span>
      {!np.playing && <Pause className="h-3 w-3 md:h-4 md:w-4 shrink-0" aria-label="Gepauzeerd" />}
    </span>
  )
}
