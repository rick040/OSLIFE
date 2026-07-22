import { useEffect, useState } from 'react'
import { Timer, Square, X } from 'lucide-react'
import { useStore } from '../store'

function elapsedLabel(startedAt: string, now: number): string {
  const secs = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000))
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/**
 * Floating "timer running" pill, mounted once in AppShell so it survives
 * navigating anywhere else in the app while a project's stopwatch runs —
 * the whole point of tracking hours "whilst working on a project" instead of
 * only inside that project's own detail panel.
 */
export default function TimerWidget() {
  const activeTimer = useStore((s) => s.activeTimer)
  const { stopTimer, discardTimer } = useStore()
  const [now, setNow] = useState(() => Date.now())
  const [expanded, setExpanded] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!activeTimer) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [activeTimer])

  if (!activeTimer) return null

  function stop() {
    stopTimer(note)
    setNote('')
    setExpanded(false)
  }

  return (
    <div className="fixed z-40 bottom-20 md:bottom-6 right-4 md:right-6 animate-fade-up">
      {expanded ? (
        <div className="rounded-3xl bg-canvas border border-line shadow-pop p-4 w-72 space-y-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-forest animate-pulse shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{activeTimer.projectName}</div>
              <div className="text-lg font-bold tabular-nums">{elapsedLabel(activeTimer.startedAt, now)}</div>
            </div>
            <button onClick={() => setExpanded(false)} className="h-7 w-7 rounded-full bg-sunken flex items-center justify-center text-muted hover:text-ink shrink-0" aria-label="Inklappen">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Waaraan gewerkt? (optioneel)"
            className="w-full text-sm bg-sunken rounded-xl px-3 py-2 outline-none border border-line focus:border-forest"
          />
          <div className="flex gap-2">
            <button onClick={stop} className="flex-1 py-2 rounded-xl bg-forest text-white text-sm font-semibold flex items-center justify-center gap-1.5">
              <Square className="h-3.5 w-3.5" /> Stop &amp; log
            </button>
            <button onClick={discardTimer} className="px-3 py-2 rounded-xl bg-sunken text-muted text-sm border border-line" title="Annuleren zonder te loggen">
              Annuleer
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-2.5 rounded-full bg-canvas border border-line shadow-pop px-4 py-2.5 hover:bg-sunken transition-colors"
        >
          <span className="h-2 w-2 rounded-full bg-forest animate-pulse shrink-0" />
          <Timer className="h-4 w-4 text-forest shrink-0" />
          <span className="text-sm font-semibold tabular-nums">{elapsedLabel(activeTimer.startedAt, now)}</span>
          <span className="text-xs text-faint truncate max-w-[9rem]">{activeTimer.projectName}</span>
        </button>
      )}
    </div>
  )
}
