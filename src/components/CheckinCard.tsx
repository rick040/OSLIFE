import { useState, useEffect } from 'react'
import { useStore } from '../store'
import { today } from '../domains'
import { Zap, Smile, Check } from 'lucide-react'

// The one signal no sensor captures: how Rick actually felt today. Feeds Reflect
// so energy↔spend / energy↔screentime / meetings↔energy can be computed at all.
export default function CheckinCard({ compact }: { compact?: boolean }) {
  const { checkins, logCheckin } = useStore()
  const todays = checkins.find((c) => c.date === today())

  const [energy, setEnergy] = useState<number>(todays?.energy ?? 0)
  const [mood, setMood] = useState<number>(todays?.mood ?? 0)
  const [savedAt, setSavedAt] = useState(false)

  // Sync the sliders to today's stored check-in once it arrives (initial state is
  // captured at mount, before loadLiveData()/realtime resolves — without this the
  // card shows 0/0 and invites a duplicate entry over an existing check-in).
  useEffect(() => {
    setEnergy(todays?.energy ?? 0)
    setMood(todays?.mood ?? 0)
  }, [todays?.energy, todays?.mood])

  const canSave = energy > 0 && mood > 0
  const dirty = energy !== (todays?.energy ?? 0) || mood !== (todays?.mood ?? 0)

  function save() {
    if (!canSave) return
    logCheckin(energy, mood)
    setSavedAt(true)
    setTimeout(() => setSavedAt(false), 1800)
  }

  const Scale = ({
    value,
    onPick,
    icon: Icon,
    label,
    color,
  }: {
    value: number
    onPick: (n: number) => void
    icon: typeof Zap
    label: string
    color: string
  }) => (
    <div className="flex-1">
      <div className="flex items-center gap-1.5 text-xs text-muted mb-1.5">
        <Icon className={`h-3.5 w-3.5 ${color}`} /> {label}
      </div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => onPick(n)}
            aria-label={`${label} ${n}`}
            className={`h-8 flex-1 rounded-lg text-sm font-medium tabular-nums transition-all ${
              value >= n
                ? 'bg-forest text-white shadow-sm'
                : 'bg-sunken text-faint hover:bg-line'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className={`card ${compact ? 'p-3' : 'p-4'} animate-fade-up`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wider text-muted font-semibold">
          {todays ? 'Check-in van vandaag' : 'Hoe voel je je?'}
        </div>
        {todays && !dirty && (
          <span className="text-[11px] text-buurtkaart flex items-center gap-1">
            <Check className="h-3 w-3" /> gelogd
          </span>
        )}
      </div>
      <div className="flex gap-3">
        <Scale value={energy} onPick={setEnergy} icon={Zap} label="Energie" color="text-personal" />
        <Scale value={mood} onPick={setMood} icon={Smile} label="Stemming" color="text-cross" />
      </div>
      <button
        onClick={save}
        disabled={!canSave || (!dirty && !!todays)}
        className="btn-primary w-full mt-3 justify-center disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {savedAt ? (
          <>
            <Check className="h-4 w-4" /> Opgeslagen
          </>
        ) : todays && !dirty ? (
          'Vandaag al gelogd'
        ) : todays ? (
          'Bijwerken'
        ) : (
          'Vastleggen'
        )}
      </button>
    </div>
  )
}
