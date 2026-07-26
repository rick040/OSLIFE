import { useEffect, useRef, useState } from 'react'
import { Play, Square } from 'lucide-react'
import { useStore } from '../../store'
import { today } from '../../domains'

const FOCUS_MIN = 25
const BREAK_MIN = 5
const POMODORO_NOTE = 'Pomodoro sessie'

function fmtClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Pomodoro-style focus/break pacing for the focused project. The countdown is
 * purely a local pacing overlay — actually logging hours goes through the same
 * store timer (startTimer/stopTimer) the phone's ProjectDetail uses, so a
 * session started here shows up there too, and vice versa (phase is derived
 * from `activeTimer` on mount so a kiosk reload mid-session resumes correctly).
 */
export function PomodoroTimer({ projectId, projectName }: { projectId: string; projectName: string }) {
  const activeTimer = useStore((s) => s.activeTimer)
  const startTimer = useStore((s) => s.startTimer)
  const stopTimer = useStore((s) => s.stopTimer)
  const projectHours = useStore((s) => s.projectHours)

  const isRunningHere = activeTimer?.projectId === projectId
  const [phase, setPhase] = useState<'idle' | 'focus' | 'break'>('idle')
  const [phaseEndAt, setPhaseEndAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const audioCtxRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    if (isRunningHere && phase === 'idle') {
      const startedMs = new Date(activeTimer!.startedAt).getTime()
      setPhase('focus')
      setPhaseEndAt(startedMs + FOCUS_MIN * 60_000)
    }
    if (!isRunningHere && phase !== 'idle') {
      setPhase('idle')
      setPhaseEndAt(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunningHere, projectId])

  useEffect(() => {
    if (phase === 'idle') return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [phase])

  const beep = () => {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = audioCtxRef.current ?? new Ctx()
      audioCtxRef.current = ctx
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = 660
      gain.gain.value = 0.08
      osc.connect(gain).connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.35)
    } catch {
      // no audio available — silent fallback is fine, the visual state still changes
    }
  }

  useEffect(() => {
    if (phase === 'idle' || phaseEndAt === null || now < phaseEndAt) return
    if (phase === 'focus') {
      stopTimer(POMODORO_NOTE)
      beep()
      setPhase('break')
      setPhaseEndAt(Date.now() + BREAK_MIN * 60_000)
    } else {
      beep()
      setPhase('idle')
      setPhaseEndAt(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, phase, phaseEndAt])

  const start = () => {
    audioCtxRef.current?.resume?.()
    startTimer(projectId, projectName)
    setPhase('focus')
    setPhaseEndAt(Date.now() + FOCUS_MIN * 60_000)
  }
  const stop = () => {
    if (isRunningHere) stopTimer(POMODORO_NOTE)
    setPhase('idle')
    setPhaseEndAt(null)
  }

  const todayIso = today()
  const todayEntries = projectHours.filter((h) => h.projectId === projectId && h.date === todayIso)
  const todayHours = todayEntries.reduce((sum, h) => sum + h.hours, 0)
  const sessionsToday = todayEntries.filter((h) => h.note === POMODORO_NOTE).length

  const remainingMs = phase === 'idle' ? FOCUS_MIN * 60_000 : Math.max(0, phaseEndAt! - now)
  const totalMs = (phase === 'break' ? BREAK_MIN : FOCUS_MIN) * 60_000
  const pct = phase === 'idle' ? 0 : Math.min(1, 1 - remainingMs / totalMs)
  const isBreak = phase === 'break'

  return (
    <div className="card p-5 md:p-6 flex items-center gap-5 md:gap-7">
      <div className="flex-1">
        <div className="text-xs md:text-sm font-semibold uppercase tracking-wider text-faint">
          {phase === 'idle' ? 'Pomodoro' : isBreak ? 'Pauze' : 'Focus'}
        </div>
        <div className={`text-4xl md:text-6xl font-bold tabular-nums leading-tight ${isBreak ? 'text-personal-deep' : 'text-ink'}`}>
          {fmtClock(remainingMs)}
        </div>
        <div className="h-1.5 w-full max-w-xs rounded-full bg-line overflow-hidden mt-2">
          <div
            className={`h-full rounded-full transition-[width] duration-1000 ${isBreak ? 'bg-personal' : 'bg-forest'}`}
            style={{ width: `${pct * 100}%` }}
          />
        </div>
        <div className="text-xs md:text-sm text-faint mt-2">
          Vandaag: {todayHours.toFixed(1)}u · {sessionsToday} pomodoro{sessionsToday === 1 ? '' : "'s"}
        </div>
      </div>
      {phase === 'idle' ? (
        <button onClick={start} className="btn-primary !py-4 md:!py-6 !px-6 md:!px-9 text-base md:text-xl shrink-0">
          <Play className="h-5 w-5 md:h-6 md:w-6" /> Start
        </button>
      ) : (
        <button
          onClick={stop}
          className="rounded-2xl bg-cross/15 text-cross-deep font-semibold py-4 md:py-6 px-6 md:px-9 text-base md:text-xl shrink-0 flex items-center gap-2"
        >
          <Square className="h-5 w-5 md:h-6 md:w-6" /> Stop
        </button>
      )}
    </div>
  )
}
