import { useState } from 'react'
import { useStore } from '../store'
import { Overlay, ConfidenceBar } from './ui'
import HealthConditionWizard from './HealthConditionWizard'
import { Check, X, Sparkles } from 'lucide-react'

/**
 * PM-072 Fase 2 — "bij app-opstart toont OSLIFE een splashscreen" met een
 * patroon-voorstel en twee acties: accepteren of afwijzen. Shown once per app
 * session (dismissed after the queue empties, not re-shown until next load),
 * cycling through every pending inference so a backlog doesn't take multiple
 * days of app-opens to clear. Reuses the exact same confirm/reject mechanism
 * as the Geheugen/Inferenties screen (store.resolveInference) — this is a
 * second, proactive surface for the same review queue, not a separate system.
 *
 * Confirming a health_condition_promotion (the dossier-creation case, e.g.
 * the vet/Kyra example) opens HealthConditionWizard right after — "maak het
 * dossier aan op de achtergrond, dan start een wizard" — everything else just
 * advances to the next pending suggestion.
 */
export default function SuggestionSplash() {
  const { inferences, resolveInference } = useStore()
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [wizardFor, setWizardFor] = useState<string | null>(null)

  if (wizardFor) {
    return <HealthConditionWizard healthConditionId={wizardFor} onDone={() => setWizardFor(null)} />
  }
  if (dismissed || inferences.length === 0) return null

  const item = inferences[0]

  async function resolve(decision: 'confirm' | 'reject') {
    setBusy(true)
    const createdId = await resolveInference(item.id, decision)
    setBusy(false)
    if (createdId) setWizardFor(createdId)
    // else: this splash re-renders against the next item in `inferences`
    // automatically (resolveInference already removed this one from the store)
    // — once the queue is empty, the `inferences.length === 0` check above closes it.
  }

  return (
    <Overlay onClose={() => setDismissed(true)}>
      <div className="card w-full max-w-md p-5 space-y-4 animate-fade-up">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-forest" />
          <h2 className="text-base font-semibold">Ik heb iets gemerkt</h2>
        </div>

        <p className="text-sm text-ink leading-relaxed">{item.question}</p>

        <div className="flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-wider text-faint shrink-0">zekerheid</span>
          <ConfidenceBar value={item.confidence} />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            disabled={busy}
            onClick={() => resolve('confirm')}
            className="btn-primary flex-1 justify-center"
          >
            <Check className="h-4 w-4" /> Ja, doe dat
          </button>
          <button
            disabled={busy}
            onClick={() => resolve('reject')}
            className="btn-ghost flex-1 justify-center"
          >
            <X className="h-4 w-4" /> Nee, niet relevant
          </button>
        </div>

        {inferences.length > 1 && (
          <p className="text-[11px] text-faint text-center">nog {inferences.length - 1} na deze</p>
        )}
      </div>
    </Overlay>
  )
}
