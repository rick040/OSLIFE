import { useState } from 'react'
import { useStore } from '../store'
import { Overlay } from './ui'
import { FolderHeart, Pill, Plus, X, Check, ArrowRight } from 'lucide-react'

interface DraftMedication {
  name: string
  dosage: string
  scheduleNote: string
  reminderTimes: string[]
}

const emptyDraft = (): DraftMedication => ({ name: '', dosage: '', scheduleNote: '', reminderTimes: ['09:00'] })

/**
 * PM-072 Fase 2 — the wizard that opens right after accepting a
 * health_condition_promotion suggestion (SuggestionSplash): baseline info
 * (resultaten/opmerkingen) + a medicatie-overzicht. Every step is skippable —
 * "automation-first / minimal input" means the wizard must never become a
 * barrier to actually using the feature just because Rick doesn't have every
 * detail on hand right now; he can always add more later from the dossier
 * itself (HealthConditions.tsx already renders `notes`, so nothing here is a
 * one-shot-only capture).
 *
 * Medication reminder_times feed notify-tick's Telegram reminders directly —
 * no native Android app exists for AlarmManager (see the plan's Fase 0 audit),
 * so this is the entire "medicatie-herinneringen triggeren automatisch een
 * reminder" step; Rick never configures anything phone-side.
 */
export default function HealthConditionWizard({ healthConditionId, onDone }: { healthConditionId: string; onDone: () => void }) {
  const { healthConditions, updateHealthCondition, createMedication } = useStore()
  const condition = healthConditions.find((c) => c.id === healthConditionId)

  const [step, setStep] = useState<'baseline' | 'medication'>('baseline')
  const [results, setResults] = useState('')
  const [notes, setNotes] = useState('')
  const [meds, setMeds] = useState<DraftMedication[]>([])
  const [draft, setDraft] = useState<DraftMedication>(emptyDraft())
  const [saving, setSaving] = useState(false)

  function addDraftMedication() {
    if (!draft.name.trim()) return
    setMeds((m) => [...m, { ...draft, reminderTimes: draft.reminderTimes.filter(Boolean) }])
    setDraft(emptyDraft())
  }

  async function saveBaselineAndContinue() {
    const combined = [results.trim(), notes.trim()].filter(Boolean).join('\n\n')
    if (combined) {
      const base = condition?.notes ? `${condition.notes}\n\n${combined}` : combined
      await updateHealthCondition(healthConditionId, { notes: base })
    }
    setStep('medication')
  }

  async function finish() {
    setSaving(true)
    // Anything still sitting in the "add one" draft counts too — Rick
    // shouldn't lose an entry just because they didn't press "voeg toe" first.
    const all = draft.name.trim() ? [...meds, { ...draft, reminderTimes: draft.reminderTimes.filter(Boolean) }] : meds
    for (const m of all) {
      await createMedication({
        healthConditionId,
        name: m.name.trim(),
        dosage: m.dosage.trim() || null,
        scheduleNote: m.scheduleNote.trim() || null,
        reminderTimes: m.reminderTimes,
        active: true,
        tier: 'geheim',
      })
    }
    setSaving(false)
    onDone()
  }

  return (
    <Overlay onClose={onDone}>
      <div className="card w-full max-w-lg p-5 space-y-4 animate-fade-up">
        <div className="flex items-center gap-2">
          <FolderHeart className="h-5 w-5 text-cross" />
          <h2 className="text-base font-semibold">{condition?.label ?? 'Nieuw dossier'}</h2>
        </div>

        {step === 'baseline' ? (
          <>
            <p className="text-xs text-faint">
              Alles hieronder is optioneel — je kunt dit ook later nog aanvullen vanuit het dossier zelf.
            </p>
            <label className="text-[11px] text-muted flex flex-col gap-1">
              Resultaten (bv. wat de dierenarts zei)
              <textarea value={results} onChange={(e) => setResults(e.target.value)} rows={3} className="input resize-none" />
            </label>
            <label className="text-[11px] text-muted flex flex-col gap-1">
              Opmerkingen
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input resize-none" />
            </label>
            <div className="flex gap-2 pt-1">
              <button className="btn-primary flex-1 justify-center" onClick={saveBaselineAndContinue}>
                Volgende <ArrowRight className="h-4 w-4" />
              </button>
              <button className="btn-ghost" onClick={() => setStep('medication')}>Sla over</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-faint">Medicatie toevoegen (optioneel) — elke herinnering gaat via Telegram.</p>

            {meds.length > 0 && (
              <ul className="space-y-1.5">
                {meds.map((m, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 rounded-xl bg-sunken px-3 py-2 text-sm">
                    <span className="flex items-center gap-1.5 min-w-0 truncate">
                      <Pill className="h-3.5 w-3.5 text-muted shrink-0" />
                      {m.name}{m.dosage ? ` — ${m.dosage}` : ''}
                      {m.reminderTimes.length > 0 && <span className="text-faint">({m.reminderTimes.join(', ')})</span>}
                    </span>
                    <button onClick={() => setMeds((prev) => prev.filter((_, j) => j !== i))} className="text-faint hover:text-cross shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="grid grid-cols-2 gap-2">
              <input placeholder="Naam" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} className="input col-span-2" />
              <input placeholder="Dosering (optioneel)" value={draft.dosage} onChange={(e) => setDraft((d) => ({ ...d, dosage: e.target.value }))} className="input" />
              <input
                type="time"
                value={draft.reminderTimes[0] ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, reminderTimes: [e.target.value] }))}
                className="input"
              />
              <input
                placeholder="Notitie (bv. alleen op trainingsdagen)"
                value={draft.scheduleNote}
                onChange={(e) => setDraft((d) => ({ ...d, scheduleNote: e.target.value }))}
                className="input col-span-2"
              />
            </div>
            <button className="btn-ghost w-full justify-center" onClick={addDraftMedication} disabled={!draft.name.trim()}>
              <Plus className="h-4 w-4" /> Nog een medicatie toevoegen
            </button>

            <div className="flex gap-2 pt-1">
              <button className="btn-primary flex-1 justify-center" onClick={finish} disabled={saving}>
                <Check className="h-4 w-4" /> {saving ? 'Opslaan…' : 'Klaar'}
              </button>
            </div>
          </>
        )}
      </div>
    </Overlay>
  )
}
