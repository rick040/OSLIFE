import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Cell,
} from 'recharts'
import { useStore } from '../store'
import { TODAY, DOMAIN_HEX } from '../domains'
import { Ring, SectionTitle, DomainChip } from '../components/ui'
import { Radar, Smartphone, MapPin, CalendarClock, Music, Hand, Brain } from 'lucide-react'
import type { Domain } from '../types'

const d = (iso: string) => iso.slice(8)
const DEADLINES = ['2026-06-12', '2026-06-17', '2026-06-18']
const tip = { background: '#FFFFFF', border: '1px solid #E7E9DE', color: '#1B1D17', borderRadius: 12, fontSize: 12 }
const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}u ${m % 60}m` : `${m}m`)

export default function Signals() {
  const { screenDays, locationDays, meetingDays, musicDays, dayLogs } = useStore()

  const screenToday = screenDays.find((s) => s.date === TODAY) ?? screenDays[screenDays.length - 1] ?? null
  const locToday = locationDays.find((l) => l.date === TODAY) ?? locationDays[locationDays.length - 1] ?? null
  const musicToday = musicDays.find((m) => m.date === TODAY) ?? musicDays[musicDays.length - 1] ?? null

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

  const screenData = screenDays.map((s) => ({
    date: d(s.date),
    focus: s.focusMinutes,
    distract: s.distractMinutes,
    pickups: s.pickups,
  }))

  const meetingData = meetingDays.map((m) => ({ date: d(m.date), iso: m.date, count: m.count, minutes: m.minutes }))

  const moodByDate = new Map(dayLogs.map((l) => [l.date, l.mood]))
  const musicData = musicDays.map((m) => ({
    date: d(m.date),
    valence: Math.round(m.valence * 5 * 10) / 10, // op 0..5 schaal, zelfde as als mood
    mood: moodByDate.get(m.date) ?? null,
  }))

  // meest bezochte plekken: minuten geaggregeerd over 14 dagen
  const topPlaces = useMemo(() => {
    const map = new Map<string, { name: string; domain: Domain; minutes: number }>()
    locationDays.forEach((l) =>
      l.places.forEach((p) => {
        const e = map.get(p.name)
        if (e) e.minutes += p.minutes
        else map.set(p.name, { name: p.name, domain: p.domain, minutes: p.minutes })
      }),
    )
    return Array.from(map.values()).sort((a, b) => b.minutes - a.minutes).slice(0, 6)
  }, [locationDays])

  const locTotal = locToday ? (locToday.timeHome + locToday.timeOut + locToday.timeCommute || 1) : 1

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Radar className="h-5 w-5 text-cross" /> Signalen
        </h1>
        <p className="text-sm text-muted mt-1">
          Passieve gedrags-streams (schermtijd, locatie, agenda, muziek) die de Reflect-engine voeden zodat de AI je dag beter begrijpt.
        </p>
      </div>

      {/* SCHERMTIJD */}
      <div className="card p-4">
        <SectionTitle hint="Focus = werk/creatieve apps, afleiding = social/media. Pickups = telefoon ontgrendeld.">
          Schermtijd & app-gebruik
        </SectionTitle>
        {screenToday ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <Kpi icon={Smartphone} color="text-parkingyou" value={fmtMin(Math.round(avg(screenDays.map((s) => s.totalMinutes))))} label="Ø schermtijd · 14d" />
              <Kpi icon={Hand} color="text-cross" value={Math.round(avg(screenDays.map((s) => s.pickups))).toString()} label="Ø pickups · 14d" />
              <Kpi icon={Brain} color="text-buurtkaart" value={fmtMin(screenToday.focusMinutes)} label="focus vandaag" />
              <Kpi icon={Smartphone} color="text-personal" value={fmtMin(screenToday.distractMinutes)} label="afleiding vandaag" />
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={screenData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E9DE" />
                <XAxis dataKey="date" tick={{ fill: '#8C9080', fontSize: 10 }} />
                <YAxis tick={{ fill: '#8C9080', fontSize: 10 }} />
                <Tooltip contentStyle={tip} formatter={(v: number, n) => [fmtMin(v), n === 'focus' ? 'focus' : 'afleiding']} />
                <Bar dataKey="focus" stackId="s" fill={DOMAIN_HEX.buurtkaart} radius={[0, 0, 0, 0]} />
                <Bar dataKey="distract" stackId="s" fill={DOMAIN_HEX.cross} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3">
              <p className="text-[11px] text-faint mb-1.5">Top-apps vandaag</p>
              <div className="space-y-1.5">
                {screenToday.topApps.map((a) => (
                  <div key={a.name} className="flex items-center gap-2 text-sm">
                    <span className="w-24 shrink-0 text-ink-soft">{a.name}</span>
                    <div className="h-1.5 flex-1 rounded-full bg-line overflow-hidden">
                      <div className="h-full rounded-full bg-parkingyou" style={{ width: `${Math.min(100, (a.minutes / screenToday.totalMinutes) * 100)}%` }} />
                    </div>
                    <span className="text-[11px] text-faint tabular-nums w-12 text-right">{fmtMin(a.minutes)}</span>
                    <span className="chip bg-line text-ink-soft text-[10px] px-2 py-0 w-16 justify-center">{a.category}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-faint">Geen schermtijd-data beschikbaar.</p>
        )}
      </div>

      {/* PLEKKEN */}
      <div className="card p-4">
        <SectionTitle hint="Verdeling van je dag over thuis, onderweg en commute, plus je meest bezochte plekken.">
          Locatie & meest bezochte plekken
        </SectionTitle>
        {locToday ? (
          <>
            <div className="flex flex-wrap items-center justify-around gap-4 mb-4">
              <div className="flex flex-col items-center gap-1">
                <Ring value={locToday.timeHome / locTotal} size={72} color="stroke-personal" label={fmtMin(locToday.timeHome)} sub="thuis" />
              </div>
              <div className="flex flex-col items-center gap-1">
                <Ring value={locToday.timeOut / locTotal} size={72} color="stroke-parkingyou" label={fmtMin(locToday.timeOut)} sub="onderweg" />
              </div>
              <div className="flex flex-col items-center gap-1">
                <Ring value={locToday.timeCommute / locTotal} size={72} color="stroke-cross" label={fmtMin(locToday.timeCommute)} sub="commute" />
              </div>
              <div className="flex flex-col items-center justify-center">
                <MapPin className="h-5 w-5 text-buurtkaart mb-1" />
                <span className="text-lg font-semibold">{locToday.distanceKm}</span>
                <span className="text-[11px] text-faint">km vandaag</span>
              </div>
            </div>
            <p className="text-[11px] text-faint mb-1.5">Meest bezochte plekken · 14d</p>
            <div className="space-y-1.5">
              {topPlaces.map((p) => (
                <div key={p.name} className="flex items-center gap-2 text-sm">
                  <span className="w-40 shrink-0 text-ink-soft truncate">{p.name}</span>
                  <DomainChip domain={p.domain} small />
                  <div className="h-1.5 flex-1 rounded-full bg-line overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, (p.minutes / (topPlaces[0]?.minutes || 1)) * 100)}%`, background: DOMAIN_HEX[p.domain] }} />
                  </div>
                  <span className="text-[11px] text-faint tabular-nums w-14 text-right">{fmtMin(p.minutes)}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-faint">Geen locatiedata beschikbaar.</p>
        )}
      </div>

      {/* AGENDA */}
      <div className="card p-4">
        <SectionTitle hint="Roze = dag op/rond een PRJCT/campagne-deadline. 3+ meetings = versnipperde dag.">
          Agenda-druk
        </SectionTitle>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={meetingData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7E9DE" />
            <XAxis dataKey="date" tick={{ fill: '#8C9080', fontSize: 10 }} />
            <YAxis allowDecimals={false} tick={{ fill: '#8C9080', fontSize: 10 }} />
            <Tooltip contentStyle={tip} formatter={(v: number) => [`${v} meeting(s)`, 'aantal']} />
            <ReferenceLine y={3} stroke="#C58392" strokeDasharray="4 4" />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {meetingData.map((m) => (
                <Cell key={m.iso} fill={DEADLINES.includes(m.iso) ? '#C58392' : '#D4D7C8'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* MUZIEK */}
      <div className="card p-4">
        <SectionTitle hint="Valence (geschaald 0-5) is een mood-proxy uit je luistergedrag, naast je gelogde mood.">
          Muziek & stemming
        </SectionTitle>
        {musicToday ? (
          <>
            <div className="flex items-center gap-2 mb-2 text-sm text-ink-soft">
              <Music className="h-4 w-4 text-prjct" /> Vandaag: <b>{musicToday.topGenre}</b>
              <span className="text-faint">· {musicToday.tempo} bpm · valence {musicToday.valence.toFixed(2)}</span>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={musicData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E9DE" />
                <XAxis dataKey="date" tick={{ fill: '#8C9080', fontSize: 10 }} />
                <YAxis domain={[0, 5]} tick={{ fill: '#8C9080', fontSize: 10 }} />
                <Tooltip contentStyle={tip} />
                <Line type="monotone" dataKey="valence" stroke={DOMAIN_HEX.prjct} strokeWidth={2} dot={false} name="muziek-valence" />
                <Line type="monotone" dataKey="mood" stroke={DOMAIN_HEX.cross} strokeWidth={2} dot={false} name="mood (1-5)" />
              </LineChart>
            </ResponsiveContainer>
          </>
        ) : (
          <p className="text-sm text-faint">Geen muziekdata beschikbaar.</p>
        )}
      </div>
    </div>
  )
}

function Kpi({ icon: Icon, color, value, label }: { icon: typeof Smartphone; color: string; value: string; label: string }) {
  return (
    <div className="card p-3">
      <Icon className={`h-4 w-4 ${color}`} />
      <div className="text-lg font-semibold mt-1">{value}</div>
      <div className="text-[11px] text-faint">{label}</div>
    </div>
  )
}
