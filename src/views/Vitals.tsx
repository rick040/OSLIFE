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
import { TODAY } from '../domains'
import { Ring, SectionTitle } from '../components/ui'
import { Activity, Footprints, Moon, Heart, Zap, Smile } from 'lucide-react'

const d = (iso: string) => iso.slice(8)

export default function Vitals() {
  const { healthDays } = useStore()
  const today = healthDays.find((h) => h.date === TODAY) ?? healthDays[healthDays.length - 1]

  const data = healthDays.map((h) => ({
    date: d(h.date),
    steps: h.steps,
    sleep: h.sleepHours,
    hr: h.restingHR,
    active: h.activeMinutes,
    energy: h.energy,
    mood: h.mood,
  }))

  const avg = (k: 'steps' | 'sleep' | 'hr' | 'active') =>
    data.reduce((a, x) => a + x[k], 0) / data.length

  const stat = [
    { icon: Footprints, label: 'Ø stappen', value: Math.round(avg('steps')).toLocaleString('nl-NL'), color: 'text-buurtkaart' },
    { icon: Moon, label: 'Ø slaap', value: avg('sleep').toFixed(1) + 'u', color: 'text-parkingyou' },
    { icon: Heart, label: 'Ø rust-HR', value: Math.round(avg('hr')) + ' bpm', color: 'text-cross' },
    { icon: Activity, label: 'Ø actief', value: Math.round(avg('active')) + ' min', color: 'text-personal' },
  ]

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Activity className="h-5 w-5 text-buurtkaart" /> Vitals
        </h1>
        <p className="text-sm text-muted mt-1">Health overzicht, samengevoegd uit je stappen-, slaap- en hartslagdata.</p>
      </div>

      {/* today */}
      <div className="card p-4">
        <SectionTitle>Vandaag</SectionTitle>
        <div className="flex flex-wrap items-center justify-around gap-4">
          <div className="flex flex-col items-center gap-1">
            <Ring value={today.steps / today.stepGoal} size={72} color="stroke-buurtkaart" label={today.steps.toLocaleString('nl-NL')} sub="stappen" />
            <span className="text-[11px] text-faint">doel {today.stepGoal.toLocaleString('nl-NL')}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Ring value={today.sleepHours / 8} size={72} color="stroke-parkingyou" label={today.sleepHours + 'u'} sub="slaap" />
            <span className="text-[11px] text-faint">doel 8u</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Ring value={today.energy / 5} size={72} color="stroke-personal" label={today.energy + '/5'} sub="energie" />
            <span className="text-[11px] text-faint flex items-center gap-1"><Zap className="h-3 w-3" /> energie</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Ring value={today.mood / 5} size={72} color="stroke-cross" label={today.mood + '/5'} sub="mood" />
            <span className="text-[11px] text-faint flex items-center gap-1"><Smile className="h-3 w-3" /> stemming</span>
          </div>
          <div className="flex flex-col items-center justify-center">
            <Heart className="h-5 w-5 text-cross mb-1" />
            <span className="text-lg font-semibold">{today.restingHR}</span>
            <span className="text-[11px] text-faint">bpm rust</span>
          </div>
        </div>
      </div>

      {/* 14-day averages */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stat.map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="card p-3">
              <Icon className={`h-4 w-4 ${s.color}`} />
              <div className="text-lg font-semibold mt-1">{s.value}</div>
              <div className="text-[11px] text-faint">{s.label} · 14d</div>
            </div>
          )
        })}
      </div>

      {/* steps */}
      <div className="card p-4">
        <h3 className="text-sm font-medium mb-1 flex items-center gap-2">
          <Footprints className="h-4 w-4 text-buurtkaart" /> Stappen (14 dagen)
        </h3>
        <p className="text-[11px] text-faint mb-2">Groen = doel gehaald, lijn = dagdoel {today.stepGoal.toLocaleString('nl-NL')}.</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7E9DE" />
            <XAxis dataKey="date" tick={{ fill: '#8C9080', fontSize: 10 }} />
            <YAxis tick={{ fill: '#8C9080', fontSize: 10 }} />
            <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #E7E9DE', color: '#1B1D17', borderRadius: 12, fontSize: 12 }} formatter={(v: number) => [v.toLocaleString('nl-NL'), 'stappen']} />
            <ReferenceLine y={today.stepGoal} stroke="#6FA07C" strokeDasharray="4 4" />
            <Bar dataKey="steps" radius={[4, 4, 0, 0]}>
              {data.map((x) => (
                <Cell key={x.date} fill={x.steps >= today.stepGoal ? '#6FA07C' : '#D4D7C8'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* sleep */}
        <div className="card p-4">
          <h3 className="text-sm font-medium mb-1 flex items-center gap-2">
            <Moon className="h-4 w-4 text-parkingyou" /> Slaap
          </h3>
          <p className="text-[11px] text-faint mb-2">Roze lijn = 6u drempel, daaronder keldert je energie.</p>
          <ResponsiveContainer width="100%" height={170}>
            <LineChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E9DE" />
              <XAxis dataKey="date" tick={{ fill: '#8C9080', fontSize: 10 }} />
              <YAxis domain={[0, 9]} tick={{ fill: '#8C9080', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #E7E9DE', color: '#1B1D17', borderRadius: 12, fontSize: 12 }} formatter={(v: number) => [`${v}u`, 'slaap']} />
              <ReferenceLine y={6} stroke="#C58392" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="sleep" stroke="#6E8CA8" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* resting HR */}
        <div className="card p-4">
          <h3 className="text-sm font-medium mb-1 flex items-center gap-2">
            <Heart className="h-4 w-4 text-cross" /> Rust-hartslag
          </h3>
          <p className="text-[11px] text-faint mb-2">Hoger op slechte nachten, lager bij herstel.</p>
          <ResponsiveContainer width="100%" height={170}>
            <LineChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E9DE" />
              <XAxis dataKey="date" tick={{ fill: '#8C9080', fontSize: 10 }} />
              <YAxis domain={[50, 70]} tick={{ fill: '#8C9080', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #E7E9DE', color: '#1B1D17', borderRadius: 12, fontSize: 12 }} formatter={(v: number) => [`${v} bpm`, 'rust-HR']} />
              <Line type="monotone" dataKey="hr" stroke="#C58392" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
