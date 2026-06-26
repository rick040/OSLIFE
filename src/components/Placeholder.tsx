import { SCREENS, type View } from '../nav'
import { Hammer } from 'lucide-react'

/** Temporary screen for routes that exist in nav but are built in a later phase. */
export default function Placeholder({ view }: { view: View }) {
  const s = SCREENS.find((x) => x.id === view)
  const Icon = s?.icon ?? Hammer
  return (
    <div className="max-w-2xl mx-auto">
      <div className="card p-8 text-center">
        <div className="h-14 w-14 rounded-3xl bg-sunken mx-auto flex items-center justify-center mb-4">
          <Icon className={`h-7 w-7 ${s?.accent ?? 'text-muted'}`} />
        </div>
        <h1 className="text-xl font-semibold">{s?.label ?? view}</h1>
        <p className="text-sm text-muted mt-1">{s?.layer}</p>
        <div className="chip bg-sunken text-faint mt-4 mx-auto">
          <Hammer className="h-3.5 w-3.5" /> in aanbouw, volgt in een latere fase
        </div>
      </div>
    </div>
  )
}
