import { useMemo, useRef, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { CHART_TIP_BARE, AXIS_TICK_10, AXIS_TICK_11 } from '../components/chart'
import { useStore } from '../store'
import { TODAY, fmtDate, daysBetween } from '../domains'
import { SectionTitle, Empty, Overlay } from '../components/ui'
import { useLongPress } from '../lib/useLongPress'
import { isoToDatetimeLocal, nowDatetimeLocal } from '../lib/datetimeLocal'
import type { DogKind, DogEntry, DogMedicalType } from '../types'
import {
  Dog as DogIcon,
  Footprints,
  Bone,
  Droplet,
  Sparkles,
  Dumbbell,
  Stethoscope,
  Scale,
  Camera,
  Plus,
  X,
  Bell,
  Lightbulb,
  Check,
  Syringe,
  Pill,
  HeartPulse,
  Pencil,
  Clock,
  MapPin,
  Timer,
} from 'lucide-react'

const KIND: Record<DogKind, { label: string; icon: typeof Bone; hex: string }> = {
  walk:     { label: 'Wandeling',  icon: Footprints,   hex: '#6FA07C' },
  food:     { label: 'Eten',       icon: Bone,          hex: '#C6A05B' },
  water:    { label: 'Water',      icon: Droplet,       hex: '#6E8CA8' },
  pee:      { label: 'Plas',       icon: Droplet,       hex: '#C6A05B' },
  poop:     { label: 'Poep',       icon: Sparkles,      hex: '#9385B0' },
  play:     { label: 'Spelen',     icon: Sparkles,      hex: '#C58392' },
  treat:    { label: 'Snack',      icon: Bone,          hex: '#C6A05B' },
  training: { label: 'Training',   icon: Dumbbell,      hex: '#6E8CA8' },
  vet:      { label: 'Dierenarts', icon: Stethoscope,   hex: '#C58392' },
  weight:   { label: 'Gewicht',    icon: Scale,         hex: '#9385B0' },
  note:     { label: 'Notitie',    icon: Camera,        hex: '#5C6150' },
}

const QUICK: DogKind[] = ['walk', 'food', 'water', 'pee', 'poop', 'play', 'treat', 'training', 'vet']

const MED_META: Record<DogMedicalType, { label: string; icon: typeof Syringe; hex: string }> = {
  vaccine:   { label: 'Enting',      icon: Syringe,     hex: '#6FA07C' },
  vet:       { label: 'Dierenarts',  icon: Stethoscope, hex: '#C58392' },
  medication:{ label: 'Medicatie',   icon: Pill,        hex: '#6E8CA8' },
  condition: { label: 'Conditie',    icon: HeartPulse,  hex: '#C6A05B' },
  weight:    { label: 'Gewicht',     icon: Scale,       hex: '#9385B0' },
}

const POOP_LABELS: Record<number, string> = {
  1: 'Vloeibaar',
  2: 'Zacht',
  3: 'Normaal',
  4: 'Vast',
  5: 'Droog',
}

const TRAINING_TYPES = ['Zit', 'Af / Blijf', 'Loopt mee', 'Terugroepen', 'Voetstap', 'Socialisatie', 'Gehoorzaamheid', 'Overig']

function readPhoto(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = rej
    r.readAsDataURL(file)
  })
}

function timeHM(iso: string) {
  return new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' })
}

// ── Shared entry form state ──────────────────────────────────────────────────
type EntryDraft = {
  at: string
  durationMin: string
  distanceKm: string
  location: string
  weightKg: string
  note: string
  poopConsistency: 1 | 2 | 3 | 4 | 5 | null
  trainingType: string
}

function emptyDraft(): EntryDraft {
  return {
    at: nowDatetimeLocal(),
    durationMin: '',
    distanceKm: '',
    location: '',
    weightKg: '',
    note: '',
    poopConsistency: null,
    trainingType: '',
  }
}

function draftFromEntry(entry: DogEntry): EntryDraft {
  return {
    at: isoToDatetimeLocal(entry.at),
    durationMin: entry.durationMin != null ? String(entry.durationMin) : '',
    distanceKm: entry.distanceKm != null ? String(entry.distanceKm) : '',
    location: entry.location ?? '',
    weightKg: entry.weightKg != null ? String(entry.weightKg) : '',
    note: entry.note ?? '',
    poopConsistency: entry.poopConsistency ?? null,
    trainingType: entry.trainingType ?? '',
  }
}

// ── Shared per-kind field blocks (walk/poop/training/play/weight) ────────────
function EntryFields({
  kind,
  draft,
  onChange,
  locationLabel,
}: {
  kind: DogKind
  draft: EntryDraft
  onChange: (patch: Partial<EntryDraft>) => void
  locationLabel: string
}) {
  const meta = KIND[kind]

  return (
    <>
      {/* Walk-specifiek */}
      {kind === 'walk' && (
        <>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <label className="block">
              <div className="text-xs text-faint mb-1 flex items-center gap-1"><Timer className="h-3 w-3" /> Duur (min)</div>
              <input type="number" min="0" value={draft.durationMin} onChange={e => onChange({ durationMin: e.target.value })} placeholder="30" className="input w-full" />
            </label>
            <label className="block">
              <div className="text-xs text-faint mb-1 flex items-center gap-1"><Footprints className="h-3 w-3" /> Afstand (km)</div>
              <input type="number" min="0" step="0.1" value={draft.distanceKm} onChange={e => onChange({ distanceKm: e.target.value })} placeholder="2.5" className="input w-full" />
            </label>
          </div>
          <label className="block mb-3">
            <div className="text-xs text-faint mb-1 flex items-center gap-1"><MapPin className="h-3 w-3" /> {locationLabel}</div>
            <input value={draft.location} onChange={e => onChange({ location: e.target.value })} placeholder="bijv. Beatrixpark" className="input w-full" />
          </label>
        </>
      )}

      {/* Poop-specifiek */}
      {kind === 'poop' && (
        <div className="mb-3">
          <div className="text-xs text-faint mb-1.5">Consistentie</div>
          <div className="flex gap-1.5 flex-wrap">
            {([1, 2, 3, 4, 5] as const).map(n => (
              <button
                key={n}
                type="button"
                onClick={() => onChange({ poopConsistency: draft.poopConsistency === n ? null : n })}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                  draft.poopConsistency === n
                    ? 'border-transparent text-white'
                    : 'border-line text-muted bg-sunken'
                }`}
                style={draft.poopConsistency === n ? { background: meta.hex } : {}}
              >
                {n} · {POOP_LABELS[n]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Training-specifiek */}
      {kind === 'training' && (
        <>
          <label className="block mb-3">
            <div className="text-xs text-faint mb-1 flex items-center gap-1"><Timer className="h-3 w-3" /> Duur (min)</div>
            <input type="number" min="0" value={draft.durationMin} onChange={e => onChange({ durationMin: e.target.value })} placeholder="15" className="input w-full" />
          </label>
          <div className="mb-3">
            <div className="text-xs text-faint mb-1.5">Type training</div>
            <div className="flex gap-1.5 flex-wrap">
              {TRAINING_TYPES.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onChange({ trainingType: draft.trainingType === t ? '' : t })}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                    draft.trainingType === t
                      ? 'border-transparent text-white'
                      : 'border-line text-muted bg-sunken'
                  }`}
                  style={draft.trainingType === t ? { background: meta.hex } : {}}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Play/Spelen duur */}
      {kind === 'play' && (
        <label className="block mb-3">
          <div className="text-xs text-faint mb-1 flex items-center gap-1"><Timer className="h-3 w-3" /> Duur (min)</div>
          <input type="number" min="0" value={draft.durationMin} onChange={e => onChange({ durationMin: e.target.value })} placeholder="20" className="input w-full" />
        </label>
      )}

      {/* Gewicht */}
      {kind === 'weight' && (
        <label className="block mb-3">
          <div className="text-xs text-faint mb-1">Gewicht (kg)</div>
          <input type="number" min="0" step="0.1" value={draft.weightKg} onChange={e => onChange({ weightKg: e.target.value })} placeholder="9.2" className="input w-full" />
        </label>
      )}
    </>
  )
}

// ── Entry modal: detail log (long press), manual add, and edit ───────────────
type EntryModalProps =
  | { mode: 'detail'; kind: DogKind; onSave: (entry: Omit<DogEntry, 'id'>) => void; onClose: () => void }
  | { mode: 'add'; onSave: (entry: Omit<DogEntry, 'id'>) => void; onClose: () => void }
  | { mode: 'edit'; entry: DogEntry; onSave: (patch: Partial<Omit<DogEntry, 'id'>>) => void; onDelete: () => void; onClose: () => void }

function EntryModal(props: EntryModalProps) {
  const { onClose } = props
  const [kind, setKind] = useState<DogKind>(
    props.mode === 'detail' ? props.kind : props.mode === 'edit' ? props.entry.kind : 'walk',
  )
  const [draft, setDraft] = useState<EntryDraft>(() =>
    props.mode === 'edit' ? draftFromEntry(props.entry) : emptyDraft(),
  )
  const [confirmDel, setConfirmDel] = useState(false)

  const meta = KIND[kind]
  const Icon = meta.icon

  const patch = (p: Partial<EntryDraft>) => setDraft(d => ({ ...d, ...p }))

  const save = () => {
    const data = {
      at: new Date(draft.at).toISOString(),
      durationMin: draft.durationMin ? Number(draft.durationMin) : null,
      distanceKm: draft.distanceKm ? Number(draft.distanceKm) : null,
      weightKg: draft.weightKg ? Number(draft.weightKg) : null,
      location: draft.location || null,
      note: draft.note || null,
      poopConsistency: draft.poopConsistency,
      trainingType: draft.trainingType || null,
    }
    if (props.mode === 'edit') props.onSave(data)
    else props.onSave({ kind, ...data })
    onClose()
  }

  const iconBadge = (
    <span className="h-10 w-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `${meta.hex}22` }}>
      <Icon className="h-5 w-5" style={{ color: meta.hex }} />
    </span>
  )

  return (
    <Overlay tone="black-blur" onClose={onClose} panelClassName="bg-surface rounded-3xl p-5 w-full max-w-sm shadow-2xl max-h-[90vh] overflow-y-auto">
      {/* Header */}
      {props.mode === 'edit' ? (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {iconBadge}
            <div className="font-semibold text-ink">{meta.label} bewerken</div>
          </div>
          {!confirmDel ? (
            <button onClick={() => setConfirmDel(true)} className="text-xs text-cross hover:underline">Verwijderen</button>
          ) : (
            <div className="flex gap-1.5">
              <button onClick={() => setConfirmDel(false)} className="text-xs text-faint">Nee</button>
              <button onClick={() => { props.onDelete(); onClose() }} className="text-xs text-cross font-medium">Ja, verwijder</button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3 mb-4">
          {iconBadge}
          {props.mode === 'detail' ? (
            <div>
              <div className="font-semibold text-ink">{meta.label} loggen</div>
              <div className="text-xs text-faint">Lang ingedrukt voor details</div>
            </div>
          ) : (
            <div className="font-semibold text-ink">Activiteit toevoegen</div>
          )}
        </div>
      )}

      {/* Type kiezen (alleen bij handmatig toevoegen) */}
      {props.mode === 'add' && (
        <div className="mb-3">
          <div className="text-xs text-faint mb-1.5">Type</div>
          <div className="grid grid-cols-3 gap-1.5">
            {QUICK.map(k => {
              const m = KIND[k]
              const I = m.icon
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                    kind === k ? 'border-transparent text-white' : 'border-line text-muted bg-sunken'
                  }`}
                  style={kind === k ? { background: m.hex } : {}}
                >
                  <I className="h-3.5 w-3.5 shrink-0" /> {m.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Tijd */}
      <label className="block mb-3">
        <div className="text-xs text-faint mb-1 flex items-center gap-1"><Clock className="h-3 w-3" /> Tijd</div>
        <input type="datetime-local" value={draft.at} onChange={e => patch({ at: e.target.value })} className="input w-full" />
      </label>

      {/* Per-kind velden */}
      <EntryFields
        kind={kind}
        draft={draft}
        onChange={patch}
        locationLabel={props.mode === 'detail' ? 'Waar (locatie)' : 'Locatie'}
      />

      {/* Notitie */}
      <label className="block mb-4">
        <div className="text-xs text-faint mb-1">{props.mode === 'edit' ? 'Notitie' : 'Notitie (optioneel)'}</div>
        <input value={draft.note} onChange={e => patch({ note: e.target.value })} placeholder="Extra info..." className="input w-full" />
      </label>

      <div className="flex gap-2">
        <button onClick={onClose} className="btn-ghost flex-1">Annuleren</button>
        <button onClick={save} className="btn-primary flex-1">
          {props.mode === 'edit' ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />} Opslaan
        </button>
      </div>
    </Overlay>
  )
}

// ── Quick log button with long-press support ──────────────────────────────────
function QuickButton({
  dogKind,
  onShort,
  onLong,
}: {
  dogKind: DogKind
  onShort: () => void
  onLong: () => void
}) {
  const meta = KIND[dogKind]
  const Icon = meta.icon
  const lp = useLongPress(onShort, onLong)

  return (
    <button
      {...lp}
      className="card p-3 flex flex-col items-center gap-1.5 hover:bg-sunken transition-colors active:scale-95 select-none cursor-pointer"
      style={{ WebkitTouchCallout: 'none', userSelect: 'none' }}
    >
      <span className="h-10 w-10 rounded-2xl flex items-center justify-center" style={{ background: `${meta.hex}22` }}>
        <Icon className="h-5 w-5" style={{ color: meta.hex }} />
      </span>
      <span className="text-xs font-medium">{meta.label}</span>
      <span className="text-[9px] text-faint leading-tight">houd vast voor details</span>
    </button>
  )
}

// ── Timeline row ──────────────────────────────────────────────────────────────
function TimelineRow({ e, onEdit, onDelete }: { e: DogEntry; onEdit: () => void; onDelete: () => void }) {
  const meta = KIND[e.kind]
  const Icon = meta.icon

  const extras: string[] = []
  if (e.durationMin) extras.push(`${e.durationMin} min`)
  if (e.distanceKm) extras.push(`${e.distanceKm} km`)
  if (e.location) extras.push(e.location)
  if (e.weightKg) extras.push(`${e.weightKg} kg`)
  if (e.trainingType) extras.push(e.trainingType)
  if (e.poopConsistency) extras.push(POOP_LABELS[e.poopConsistency])

  return (
    <div className="flex items-center gap-3 p-3">
      <span className="h-9 w-9 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `${meta.hex}22` }}>
        <Icon className="h-4 w-4" style={{ color: meta.hex }} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-ink">
          {meta.label}{extras.length ? ` · ${extras.join(' · ')}` : ''}
        </div>
        {e.note && <div className="text-[11px] text-faint truncate">{e.note}</div>}
        {e.photo && <img src={e.photo} alt="" className="mt-1.5 rounded-lg max-h-28 object-cover border border-line" />}
      </div>
      <span className="text-[11px] text-faint shrink-0">{timeHM(e.at)}</span>
      <button onClick={onEdit} className="text-faint hover:text-ink p-0.5 shrink-0"><Pencil className="h-3.5 w-3.5" /></button>
      <button onClick={onDelete} className="text-faint hover:text-cross p-0.5 shrink-0"><X className="h-3.5 w-3.5" /></button>
    </div>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function Dog() {
  const {
    dogProfile,
    dogEntries,
    dogMedical,
    dogReminders,
    logDog,
    deleteDogEntry,
    updateDogEntry,
    addDogMedical,
    deleteDogMedical,
    toggleDogReminder,
  } = useStore()
  const photoRef = useRef<HTMLInputElement>(null)
  const [medForm, setMedForm] = useState(false)
  const [detailKind, setDetailKind] = useState<DogKind | null>(null)
  const [editEntry, setEditEntry] = useState<DogEntry | null>(null)
  const [addModal, setAddModal] = useState(false)

  const today = dogEntries.filter((e) => e.at.slice(0, 10) === TODAY)
  const count = (k: DogKind) => today.filter((e) => e.kind === k).length

  const summary = [
    { k: 'walk' as DogKind, label: 'Wandelingen', goal: 3 },
    { k: 'food' as DogKind, label: 'Maaltijden', goal: 2 },
    { k: 'water' as DogKind, label: 'Water', goal: 5 },
    { label: 'Sanitair', goal: 6, val: count('pee') + count('poop'), hex: '#9385B0', icon: Droplet },
  ]

  const ageYears = Math.floor(daysBetween(dogProfile.birthdate, TODAY) / 365)

  const weights = useMemo(
    () =>
      dogEntries
        .filter((e) => e.kind === 'weight' && e.weightKg)
        .map((e) => ({ date: e.at.slice(5, 10), kg: e.weightKg as number, iso: e.at }))
        .sort((a, b) => a.iso.localeCompare(b.iso)),
    [dogEntries],
  )
  const latestWeight = weights.length ? weights[weights.length - 1].kg : dogProfile.weightKg

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const photo = await readPhoto(f)
    logDog({ kind: 'note', note: 'Foto', photo })
    e.target.value = ''
  }

  const advice = useMemo(() => {
    const tips: { text: string; tone: 'good' | 'warn' }[] = []
    const walks = count('walk')
    if (walks === 0) tips.push({ text: 'Kyra is vandaag nog niet uitgelaten. Een Shiba heeft 2-3 wandelingen per dag nodig.', tone: 'warn' })
    else if (walks >= 3) tips.push({ text: `Top: ${walks} wandelingen vandaag. Goede beweging voor een Shiba.`, tone: 'good' })
    if (count('water') < 3) tips.push({ text: 'Weinig water gelogd, zet vers water klaar (zeker bij warm weer).', tone: 'warn' })
    if (latestWeight > 10) tips.push({ text: `Gewicht ${latestWeight} kg ligt boven het ideaal voor een Shiba (8-10 kg). Let op porties.`, tone: 'warn' })
    else tips.push({ text: `Gewicht ${latestWeight} kg zit goed in de Shiba-range (8-10 kg).`, tone: 'good' })
    const soon = dogReminders.filter((r) => !r.done && daysBetween(TODAY, r.due) <= 7 && daysBetween(TODAY, r.due) >= 0)
    if (soon.length) tips.push({ text: `${soon.length} herinnering(en) binnen 7 dagen: ${soon.map((r) => r.title).join(', ')}.`, tone: 'warn' })
    return tips
  }, [dogEntries, dogReminders, latestWeight])

  const todaySorted = [...today].sort((a, b) => b.at.localeCompare(a.at))

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Modals */}
      {detailKind && (
        <EntryModal
          mode="detail"
          kind={detailKind}
          onSave={(entry) => logDog(entry)}
          onClose={() => setDetailKind(null)}
        />
      )}
      {editEntry && (
        <EntryModal
          mode="edit"
          entry={editEntry}
          onSave={(patch) => updateDogEntry(editEntry.id, patch)}
          onDelete={() => deleteDogEntry(editEntry.id)}
          onClose={() => setEditEntry(null)}
        />
      )}
      {addModal && (
        <EntryModal
          mode="add"
          onSave={(entry) => logDog(entry)}
          onClose={() => setAddModal(false)}
        />
      )}

      {/* Hero */}
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-3xl bg-gradient-to-br from-personal to-cross flex items-center justify-center shadow-card overflow-hidden shrink-0">
          {dogProfile.photo ? <img src={dogProfile.photo} alt="Kyra" className="h-full w-full object-cover" /> : <DogIcon className="h-8 w-8 text-white" />}
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{dogProfile.name}</h1>
          <div className="text-sm text-muted">{dogProfile.breed} · {ageYears} jaar · {latestWeight} kg</div>
          <div className="text-xs text-faint">{dogProfile.vet}</div>
        </div>
      </div>

      {/* Today summary */}
      <div className="grid grid-cols-4 gap-2.5">
        {summary.map((s) => {
          const val = 'val' in s ? s.val! : count(s.k!)
          const meta = 'k' in s && s.k ? KIND[s.k] : { hex: s.hex!, icon: s.icon! }
          const Icon = meta.icon
          return (
            <div key={s.label} className="card p-2.5 text-center">
              <Icon className="h-4 w-4 mx-auto mb-1" style={{ color: meta.hex }} />
              <div className="text-base font-bold tabular-nums">
                {val}<span className="text-[11px] text-faint font-semibold">/{s.goal}</span>
              </div>
              <div className="text-[10px] font-medium text-muted">{s.label}</div>
            </div>
          )
        })}
      </div>

      {/* Quick log */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>Snel loggen</SectionTitle>
          <button className="btn-ghost !py-1.5" onClick={() => photoRef.current?.click()}>
            <Camera className="h-4 w-4" /> Foto
          </button>
          <input ref={photoRef} type="file" accept="image/*" hidden onChange={onPhoto} />
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
          {QUICK.map((k) => (
            <QuickButton
              key={k}
              dogKind={k}
              onShort={() => logDog({ kind: k })}
              onLong={() => setDetailKind(k)}
            />
          ))}
        </div>
      </div>

      {/* Today timeline */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>Vandaag</SectionTitle>
          <button className="btn-ghost !py-1.5" onClick={() => setAddModal(true)}>
            <Plus className="h-4 w-4" /> Toevoegen
          </button>
        </div>
        {todaySorted.length === 0 ? (
          <Empty>Nog niks gelogd vandaag. Tik een knop hierboven of houd vast voor details.</Empty>
        ) : (
          <div className="card divide-y divide-line">
            {todaySorted.map((e) => (
              <TimelineRow
                key={e.id}
                e={e}
                onEdit={() => setEditEntry(e)}
                onDelete={() => deleteDogEntry(e.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Weight chart */}
      {weights.length > 1 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <SectionTitle>Gewicht</SectionTitle>
            <span className="chip bg-sunken text-muted">{latestWeight} kg</span>
          </div>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={weights} margin={{ top: 6, right: 10, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E9DE" vertical={false} />
              <XAxis dataKey="date" tick={AXIS_TICK_11} axisLine={false} tickLine={false} />
              <YAxis domain={[8, 10]} tick={AXIS_TICK_10} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={CHART_TIP_BARE} formatter={(v: number) => [`${v} kg`, 'gewicht']} />
              <Line type="monotone" dataKey="kg" stroke="#9385B0" strokeWidth={2.5} dot={{ r: 3, fill: '#9385B0' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Advice */}
      <div className="card p-4">
        <SectionTitle hint="Op basis van vandaag, gewicht en aankomende herinneringen.">
          <span className="flex items-center gap-2"><Lightbulb className="h-4 w-4 text-personal" /> Advies</span>
        </SectionTitle>
        <div className="space-y-2">
          {advice.map((a, i) => (
            <div key={i} className={`flex items-start gap-2 text-sm rounded-xl px-3 py-2 ${a.tone === 'good' ? 'bg-buurtkaart/10 text-buurtkaart-deep' : 'bg-personal/10 text-personal-deep'}`}>
              <span className="mt-0.5">{a.tone === 'good' ? '✓' : '!'}</span>
              <span>{a.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Reminders */}
      <div>
        <SectionTitle>
          <span className="flex items-center gap-2"><Bell className="h-4 w-4 text-cross" /> Herinneringen</span>
        </SectionTitle>
        <div className="card divide-y divide-line">
          {[...dogReminders].sort((a, b) => a.due.localeCompare(b.due)).map((r) => {
            const dd = daysBetween(TODAY, r.due)
            const overdue = dd < 0 && !r.done
            return (
              <div key={r.id} className={`flex items-center gap-3 p-3 ${r.done ? 'opacity-50' : ''}`}>
                <button onClick={() => toggleDogReminder(r.id)} className={`h-5 w-5 rounded-full border flex items-center justify-center shrink-0 ${r.done ? 'bg-buurtkaart border-buurtkaart text-white' : 'border-line text-transparent'}`}>
                  <Check className="h-3 w-3" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm truncate ${r.done ? 'line-through text-faint' : 'text-ink'}`}>{r.title}</div>
                  <div className={`text-[11px] ${overdue ? 'text-cross font-medium' : 'text-faint'}`}>
                    {overdue ? `${-dd}d te laat` : dd === 0 ? 'vandaag' : `over ${dd}d · ${fmtDate(r.due)}`}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Medical dossier */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>
            <span className="flex items-center gap-2"><Stethoscope className="h-4 w-4 text-cross" /> Medisch dossier</span>
          </SectionTitle>
          <button className="btn-primary !py-1.5" onClick={() => setMedForm((f) => !f)}>
            <Plus className="h-4 w-4" /> Toevoegen
          </button>
        </div>
        {medForm && <MedForm onAdd={(m) => { addDogMedical(m); setMedForm(false) }} />}
        <div className="space-y-2.5 mt-3">
          {dogMedical.length === 0 ? (
            <Empty>Nog geen medische gegevens.</Empty>
          ) : (
            [...dogMedical].sort((a, b) => b.date.localeCompare(a.date)).map((m) => {
              const meta = MED_META[m.type]
              const Icon = meta.icon
              return (
                <div key={m.id} className="card p-3.5 flex gap-3">
                  <span className="h-10 w-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `${meta.hex}22` }}>
                    <Icon className="h-5 w-5" style={{ color: meta.hex }} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold truncate">{m.title}</span>
                      <button onClick={() => deleteDogMedical(m.id)} className="text-faint hover:text-cross p-0.5 shrink-0"><X className="h-3.5 w-3.5" /></button>
                    </div>
                    <div className="text-[11px] text-faint">{meta.label} · {fmtDate(m.date)}{m.nextDue ? ` · volgende ${fmtDate(m.nextDue)}` : ''}</div>
                    {m.note && <p className="text-xs text-muted mt-1">{m.note}</p>}
                    {m.photo && <img src={m.photo} alt={m.title} className="mt-2 rounded-xl max-h-40 object-cover border border-line" />}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

function MedForm({ onAdd }: { onAdd: (m: { type: DogMedicalType; date: string; title: string; note?: string | null; nextDue?: string | null; photo?: string | null }) => void }) {
  const [type, setType] = useState<DogMedicalType>('vet')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(TODAY)
  const [note, setNote] = useState('')
  const [nextDue, setNextDue] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    onAdd({ type, date, title: title.trim(), note: note || null, nextDue: nextDue || null, photo })
  }

  return (
    <form onSubmit={submit} className="card p-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        <select value={type} onChange={(e) => setType(e.target.value as DogMedicalType)} className="rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none">
          <option value="vet">Dierenarts</option>
          <option value="vaccine">Enting</option>
          <option value="medication">Medicatie</option>
          <option value="condition">Conditie</option>
          <option value="weight">Gewicht</option>
        </select>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titel" required className="flex-1 min-w-[140px] rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none focus:border-prjct/60" />
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="text-xs text-faint flex flex-col gap-1">Datum
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none" />
        </label>
        <label className="text-xs text-faint flex flex-col gap-1">Volgende keer
          <input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} className="rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none" />
        </label>
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notitie (optioneel)" className="w-full rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none" />
      <div className="flex items-center gap-3">
        <label className="btn-ghost !py-1.5 cursor-pointer">
          <Camera className="h-4 w-4" /> {photo ? 'Foto gekozen' : 'Foto/scan'}
          <input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await readPhoto(f)) }} />
        </label>
        {photo && <img src={photo} alt="" className="h-10 w-10 rounded-lg object-cover border border-line" />}
        <button type="submit" className="btn-primary !py-1.5 ml-auto"><Plus className="h-4 w-4" /> Opslaan</button>
      </div>
    </form>
  )
}
