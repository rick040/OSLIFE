import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { ConfidenceBar, Empty } from '../components/ui'
import { Check, X, Sparkles } from 'lucide-react'
import type { InferredItem } from '../types'

// Human labels for the inference types the engine currently produces.
const TYPE_LABEL: Record<string, string> = {
  vet_visit: 'Dierenartsbezoek',
  subscription_candidate: 'Terugkerende uitgave',
  energy_dip_pattern: 'Slaap/energie-signaal',
  project_stall: 'Project ligt stil',
}

function InferenceCard({ item, onResolve }: {
  item: InferredItem
  onResolve: (id: string, decision: 'confirm' | 'reject') => void
}) {
  const [busy, setBusy] = useState(false)
  const resolve = (decision: 'confirm' | 'reject') => {
    setBusy(true)
    onResolve(item.id, decision)
  }
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs uppercase tracking-wider text-faint">
            {TYPE_LABEL[item.type] ?? item.type}
          </span>
          {item.ruleId && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-line text-muted">{item.ruleId}</span>
          )}
        </div>
        <div className="flex gap-1">
          {item.domains.map((d) => (
            <span key={d} className="text-[10px] px-1.5 py-0.5 rounded-full bg-line text-muted">{d}</span>
          ))}
        </div>
      </div>

      <p className="text-sm text-ink">{item.question}</p>

      <div className="flex items-center gap-3">
        <span className="text-[10px] uppercase tracking-wider text-faint shrink-0">zekerheid</span>
        <ConfidenceBar value={item.confidence} />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          disabled={busy}
          onClick={() => resolve('confirm')}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-forest/10 text-forest border border-forest-hi/40 py-2 text-sm font-medium hover:bg-forest/15 disabled:opacity-50"
        >
          <Check className="h-4 w-4" /> Bevestigen
        </button>
        <button
          disabled={busy}
          onClick={() => resolve('reject')}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-line/60 text-muted border border-line py-2 text-sm font-medium hover:bg-line disabled:opacity-50"
        >
          <X className="h-4 w-4" /> Verwerpen
        </button>
      </div>
    </div>
  )
}

export default function Inferences() {
  const { inferences, resolveInference, loadInferences } = useStore()

  // Refresh the queue on entry so hourly-produced inferences show without a reload.
  useEffect(() => { void loadInferences() }, [loadInferences])

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-cross" /> Inferenties
        </h1>
        <p className="text-sm text-muted mt-1">
          Wat het systeem afleidde uit je data, maar nog niet als feit vastlegt. Bevestig wat klopt,
          verwerp wat niet klopt. Elke keuze maakt de regels scherper.
        </p>
      </div>

      {inferences.length === 0 ? (
        <Empty>Niets te bevestigen. Het systeem heeft geen open gissingen voor je.</Empty>
      ) : (
        <div className="space-y-3 animate-fade-up">
          {inferences.map((item) => (
            <InferenceCard key={item.id} item={item} onResolve={resolveInference} />
          ))}
        </div>
      )}
    </div>
  )
}
