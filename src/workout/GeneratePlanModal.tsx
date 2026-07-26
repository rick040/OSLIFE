import { useEffect, useMemo, useState } from 'react'
import { Overlay, Empty } from '../components/ui'
import { DOMAIN_HEX } from '../domains'
import { TARGET_MUSCLES, titleCase, loadExerciseLibrary, type LibraryExercise } from './exerciseLibrary'
import { generatePlan, SPLIT_PRESETS, type GeneratedDay, type GeneratedExercise } from './planGenerator'
import type { WorkoutPlan, WorkoutExercise } from '../types'
import { Wand2, X, Shuffle, RefreshCw, Trash2, Dumbbell, Loader2 } from 'lucide-react'

const WEEKDAY_FULL = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag']
const PLAN_COLORS = Object.values(DOMAIN_HEX)

function ExerciseThumb({ src }: { src?: string | null }) {
  const [broken, setBroken] = useState(false)
  if (!src || broken) {
    return (
      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-line">
        <Dumbbell className="h-4 w-4 text-faint" />
      </span>
    )
  }
  return <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className="h-11 w-11 shrink-0 rounded-xl object-cover bg-line" />
}

export default function GeneratePlanModal({
  existingPlanCount,
  onClose,
  onCreate,
}: {
  existingPlanCount: number
  onClose: () => void
  onCreate: (days: { plan: Omit<WorkoutPlan, 'id' | 'orderIdx' | 'active'>; exercises: Omit<WorkoutExercise, 'id' | 'planId'>[] }[]) => Promise<void>
}) {
  const [library, setLibrary] = useState<LibraryExercise[] | null>(null)
  const [days, setDays] = useState(3)
  const [muscleGroups, setMuscleGroups] = useState<string[]>([])
  const [exercisesPerDay, setExercisesPerDay] = useState(5)
  const [targetSets, setTargetSets] = useState(3)
  const [targetReps, setTargetReps] = useState('8-12')
  const [equipmentFilter, setEquipmentFilter] = useState<string[]>([])
  const [startDay, setStartDay] = useState<number | null>(1)
  const [preview, setPreview] = useState<GeneratedDay[] | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    loadExerciseLibrary().then((d) => { if (alive) setLibrary(d) })
    return () => { alive = false }
  }, [])

  const equipmentOptions = useMemo(
    () => (library ? [...new Set(library.map((e) => e.equipment))].sort() : []),
    [library],
  )

  const toggleMuscle = (m: string) => setMuscleGroups((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))
  const toggleEquipment = (eq: string) => setEquipmentFilter((prev) => (prev.includes(eq) ? prev.filter((x) => x !== eq) : [...prev, eq]))

  const runGenerate = () => {
    if (!library) return
    setPreview(
      generatePlan(library, {
        days,
        muscleGroups,
        exercisesPerDay,
        targetSets,
        targetReps: targetReps.trim() || '8-12',
        equipment: equipmentFilter.length > 0 ? equipmentFilter : null,
        startDay,
      }),
    )
  }

  const reroll = (dayIdx: number, exIdx: number) => {
    if (!library || !preview) return
    const target = preview[dayIdx].exercises[exIdx]
    const usedNames = new Set(preview.flatMap((d) => d.exercises.map((e) => e.name)))
    let candidates = library.filter((e) => {
      if (titleCase(e.target) !== target.muscleGroup) return false
      if (equipmentFilter.length > 0 && !equipmentFilter.includes(e.equipment)) return false
      return !usedNames.has(e.name)
    })
    if (candidates.length === 0) {
      candidates = library.filter((e) => titleCase(e.target) === target.muscleGroup && (equipmentFilter.length === 0 || equipmentFilter.includes(e.equipment)))
    }
    if (candidates.length === 0) return
    const pick = candidates[Math.floor(Math.random() * candidates.length)]
    const next: GeneratedExercise = { ...target, name: pick.name, imageUrl: pick.image, gifUrl: pick.gifUrl }
    setPreview(preview.map((d, di) => (di !== dayIdx ? d : { ...d, exercises: d.exercises.map((e, ei) => (ei !== exIdx ? e : next)) })))
  }

  const removeExercise = (dayIdx: number, exIdx: number) => {
    if (!preview) return
    setPreview(preview.map((d, di) => (di !== dayIdx ? d : { ...d, exercises: d.exercises.filter((_, ei) => ei !== exIdx) })))
  }

  const commit = async () => {
    if (!preview) return
    setSaving(true)
    const drafts = preview
      .filter((d) => d.exercises.length > 0)
      .map((d, i) => ({
        plan: {
          name: d.name,
          dayOfWeek: d.dayOfWeek,
          muscleGroups: d.muscleGroups,
          color: PLAN_COLORS[(existingPlanCount + i) % PLAN_COLORS.length],
        },
        exercises: d.exercises.map((e, ei) => ({
          name: e.name,
          muscleGroup: e.muscleGroup,
          targetSets: e.targetSets,
          targetReps: e.targetReps,
          orderIdx: ei,
          imageUrl: e.imageUrl,
          gifUrl: e.gifUrl,
        })),
      }))
    await onCreate(drafts)
    setSaving(false)
    onClose()
  }

  return (
    <Overlay tone="black-blur" onClose={onClose} panelClassName="bg-surface rounded-3xl p-5 w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
      <div className="flex items-center justify-between mb-1 shrink-0">
        <div className="font-semibold text-ink flex items-center gap-2"><Wand2 className="h-4 w-4" /> Plan genereren</div>
        <button onClick={onClose} className="text-faint hover:text-ink p-1" aria-label="Sluiten"><X className="h-4 w-4" /></button>
      </div>

      {!preview ? (
        <div className="flex flex-col gap-4 overflow-y-auto pt-3">
          <p className="text-xs text-faint">Kies wat je wilt trainen — de app verdeelt het over de dagen en kiest zelf oefeningen.</p>

          <div className="flex flex-wrap gap-1.5">
            {Object.keys(SPLIT_PRESETS).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setMuscleGroups(SPLIT_PRESETS[preset])}
                className="chip bg-line text-ink-soft hover:bg-ink hover:text-canvas transition-colors"
              >
                {preset}
              </button>
            ))}
          </div>

          <div>
            <div className="text-xs font-medium text-muted mb-1.5">Spiergroepen</div>
            <div className="flex flex-wrap gap-1.5">
              {TARGET_MUSCLES.map((m) => (
                <button type="button" key={m} onClick={() => toggleMuscle(m)} className={`chip ${muscleGroups.includes(m) ? 'bg-ink text-canvas' : 'bg-sunken text-muted'}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Aantal dagen
              <input type="number" min={1} max={7} value={days} onChange={(e) => setDays(Math.max(1, Math.min(7, Number(e.target.value) || 1)))} className="input" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Oefeningen per dag
              <input type="number" min={1} max={8} value={exercisesPerDay} onChange={(e) => setExercisesPerDay(Math.max(1, Math.min(8, Number(e.target.value) || 1)))} className="input" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Sets per oefening
              <input type="number" min={1} max={6} value={targetSets} onChange={(e) => setTargetSets(Math.max(1, Math.min(6, Number(e.target.value) || 1)))} className="input" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Reps
              <input value={targetReps} onChange={(e) => setTargetReps(e.target.value)} placeholder="8-12" className="input" />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Vaste startdag (verdeelt de dagen gelijkmatig over de week)
            <select value={startDay ?? ''} onChange={(e) => setStartDay(e.target.value === '' ? null : Number(e.target.value))} className="input">
              <option value="">Geen vaste dag</option>
              {WEEKDAY_FULL.map((d, i) => (
                <option key={d} value={i}>{d}</option>
              ))}
            </select>
          </label>

          {equipmentOptions.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted mb-1.5">Beschikbaar materiaal (leeg = alles)</div>
              <div className="flex flex-wrap gap-1.5">
                {equipmentOptions.map((eq) => (
                  <button type="button" key={eq} onClick={() => toggleEquipment(eq)} className={`chip ${equipmentFilter.includes(eq) ? 'bg-ink text-canvas' : 'bg-sunken text-muted'}`}>
                    {titleCase(eq)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-1 shrink-0">
            <button type="button" onClick={onClose} className="btn-ghost !py-2">Annuleer</button>
            <button
              type="button"
              onClick={runGenerate}
              disabled={!library || muscleGroups.length === 0}
              className="btn-primary !py-2"
            >
              <Wand2 className="h-4 w-4" /> Genereer voorstel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 overflow-y-auto pt-3 min-h-0">
          {preview.every((d) => d.exercises.length === 0) ? (
            <Empty>Geen oefeningen gevonden voor deze combinatie — pas de spiergroepen of het materiaal aan.</Empty>
          ) : (
            preview.map((day, di) => (
              <div key={di} className="rounded-2xl bg-sunken p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-ink">{day.name}</span>
                  {day.dayOfWeek != null && <span className="chip bg-line text-ink-soft">{WEEKDAY_FULL[day.dayOfWeek]}</span>}
                </div>
                {day.exercises.length === 0 ? (
                  <p className="text-xs text-faint italic">Geen oefeningen gevonden voor deze dag.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {day.exercises.map((ex, ei) => (
                      <div key={ei} className="flex items-center gap-2.5 rounded-xl bg-surface px-2.5 py-2">
                        <ExerciseThumb src={ex.imageUrl} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-ink truncate">{ex.name}</div>
                          <div className="text-[11px] text-faint">{ex.muscleGroup} · {ex.targetSets}×{ex.targetReps}</div>
                        </div>
                        <button onClick={() => reroll(di, ei)} className="text-faint hover:text-ink p-1 shrink-0" aria-label="Andere oefening">
                          <Shuffle className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => removeExercise(di, ei)} className="text-faint hover:text-cross p-1 shrink-0" aria-label="Verwijder oefening">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}

          <div className="flex gap-2 justify-end pt-1 shrink-0">
            <button type="button" onClick={() => setPreview(null)} className="btn-ghost !py-2">Terug</button>
            <button type="button" onClick={runGenerate} className="btn-ghost !py-2"><RefreshCw className="h-4 w-4" /> Opnieuw</button>
            <button type="button" onClick={commit} disabled={saving} className="btn-primary !py-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {preview.filter((d) => d.exercises.length > 0).length} plan(nen) aanmaken
            </button>
          </div>
        </div>
      )}
    </Overlay>
  )
}
