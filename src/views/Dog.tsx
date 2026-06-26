import { useMemo, useRef, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useStore } from '../store'
import { TODAY, fmtDate, daysBetween } from '../domains'
import { SectionTitle, Empty } from '../components/ui'
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
} from 'lucide-react'

const KIND: Record<DogKind, { label: string; icon: typeof Bone; hex: string }> = {
  walk: { label: 'Wandeling', icon: Footprints, hex: '#6FA07C' },
  food: { label: 'Eten', icon: Bone, hex: '#C6A05B' },
  water: { label: 'Water', icon: Droplet, hex: '#6E8CA8' },
  pee: { label: 'Plas', icon: Droplet, hex: '#C6A05B' },
  poop: { label: 'Poep', icon: Sparkles, hex: '#9385B0' },
  play: { label: 'Spelen', icon: Sparkles, hex: '#C58392' },
  treat: { label: 'Snack', icon: Bone, hex: '#C6A05B' },
  training: { label: 'Training', icon: Dumbbell, hex: '#6E8CA8' },
  vet: { label: 'Dierenarts', icon: Stethoscope, hex: '#C58392' },
  weight: { label: 'Gewicht', icon: Scale, hex: '#9385B0' },
  note: { label: 'Notitie', icon: Camera, hex: '#5C6150' },
}

const QUICK: DogKind[] = ['walk', 'food', 'water', 'pee', 'poop', 'play', 'treat', 'training', 'vet']

const MED_META: Record<DogMedicalType, { label: string; icon: typeof Syringe; hex: string }> = {
  vaccine: { label: 'Enting', icon: Syringe, hex: '#6FA07C' },
  vet: { label: 'Dierenarts', icon: Stethoscope, hex: '#C58392' },
  medication: { label: 'Medicatie', icon: Pill, hex: '#6E8CA8' },
  condition: { label: 'Conditie', icon: HeartPulse, hex: '#C6A05B' },
  weight: { label: 'Gewicht', icon: Scale, hex: '#9385B0' },
}

function readPhoto(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = rej
    r.readAsDataURL(file)
  })
}
function timeHM(iso: string) {
  return new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}

export default function Dog() {
  const {
    dogProfile,
    dogEntries,
    dogMedical,
    dogReminders,
    logDog,
    deleteDogEntry,
    addDogMedical,
    deleteDogMedical,
    toggleDogReminder,
  } = useStore()
  const photoRef = useRef<HTMLInputElement>(null)
  const [medForm, setMedForm] = useState(false)

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

  const onQuick = (k: DogKind) => logDog({ kind: k })

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

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* hero */}
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

      {/* today summary */}
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

      {/* quick log */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>Snel loggen</SectionTitle>
          <button className="btn-ghost !py-1.5" onClick={() => photoRef.current?.click()}>
            <Camera className="h-4 w-4" /> Foto
          </button>
          <input ref={photoRef} type="file" accept="image/*" hidden onChange={onPhoto} />
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
          {QUICK.map((k) => {
            const meta = KIND[k]
            const Icon = meta.icon
            return (
              <button key={k} onClick={() => onQuick(k)} className="card p-3 flex flex-col items-center gap-1.5 hover:bg-sunken transition-colors active:scale-95">
                <span className="h-10 w-10 rounded-2xl flex items-center justify-center" style={{ background: `${meta.hex}22` }}>
                  <Icon className="h-5 w-5" style={{ color: meta.hex }} />
                </span>
                <span className="text-xs font-medium">{meta.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* today timeline */}
      <div>
        <SectionTitle>Vandaag</SectionTitle>
        {today.length === 0 ? (
          <Empty>Nog niks gelogd vandaag. Tik een knop hierboven.</Empty>
        ) : (
          <div className="card divide-y divide-line">
            {today.map((e) => <TimelineRow key={e.id} e={e} onDelete={() => deleteDogEntry(e.id)} />)}
          </div>
        )}
      </div>

      {/* weight / vitals */}
      {weights.length > 1 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <SectionTitle>Gewicht</SectionTitle>
            <span className="chip bg-sunken text-muted">{latestWeight} kg</span>
          </div>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={weights} margin={{ top: 6, right: 10, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E9DE" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#8C9080', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[8, 10]} tick={{ fill: '#8C9080', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E7E9DE', borderRadius: 12, fontSize: 12 }} formatter={(v: number) => [`${v} kg`, 'gewicht']} />
              <Line type="monotone" dataKey="kg" stroke="#9385B0" strokeWidth={2.5} dot={{ r: 3, fill: '#9385B0' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* advice */}
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

      {/* reminders */}
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

      {/* medical dossier */}
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

function TimelineRow({ e, onDelete }: { e: DogEntry; onDelete: () => void }) {
  const meta = KIND[e.kind]
  const Icon = meta.icon
  const extra = [e.durationMin ? `${e.durationMin} min` : null, e.distanceKm ? `${e.distanceKm} km` : null, e.weightKg ? `${e.weightKg} kg` : null]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="flex items-center gap-3 p-3">
      <span className="h-9 w-9 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `${meta.hex}22` }}>
        <Icon className="h-4 w-4" style={{ color: meta.hex }} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-ink">{meta.label}{extra ? ` · ${extra}` : ''}</div>
        {e.note && <div className="text-[11px] text-faint truncate">{e.note}</div>}
        {e.photo && <img src={e.photo} alt="" className="mt-1.5 rounded-lg max-h-28 object-cover border border-line" />}
      </div>
      <span className="text-[11px] text-faint shrink-0">{timeHM(e.at)}</span>
      <button onClick={onDelete} className="text-faint hover:text-cross p-0.5 shrink-0"><X className="h-3.5 w-3.5" /></button>
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
