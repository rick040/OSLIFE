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
import { useMemo } from 'react'
import { CHART_TIP, AXIS_TICK_10 } from '../components/chart'
import { useStore } from '../store'
import { TODAY, DOMAIN_HEX } from '../domains'
import { deriveDeadlines } from '../derive'
import { Ring, SectionTitle, Sparkline } from '../components/ui'
import CheckinCard from '../components/CheckinCard'
import HealthConditions from '../components/HealthConditions'
import { Activity, Footprints, Moon, Heart, Zap, Smile, Smartphone, Hand, Brain, CalendarClock } from 'lucide-react'

const d = (iso: string) => iso.slice(8)
const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}u ${m % 60}m` : `${m}m`)

export default function Vitals() {
  const { healthDays, screenDays, meetingDays, projects } = useStore()
  const today = healthDays.find((h) => h.date === TODAY) ?? healthDays[healthDays.length - 1]

  const deadlines = useMemo(() => deriveDeadlines(projects), [projects])
  const screenToday = screenDays.find((s) => s.date === TODAY) ?? screenDays[screenDays.length - 1] ?? null
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  const screenData = screenDays.map((s) => ({ date: d(s.date), focus: s.focusMinutes, distract: s.distractMinutes, pickups: s.pickups }))
  const meetingData = meetingDays.map((m) => ({ date: d(m.date), iso: m.date, count: m.count, minutes: m.minutes }))

  if (!today) {
    return (
      <div className="flex flex-col gap-7 max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sunken">
            <Activity className="h-5 w-5 text-ink-soft" />
          </span>
          <div>
            <h1 className="text-xl font-medium text-ink">Gezondheid</h1>
            <p className="text-sm text-muted mt-0.5">Nog geen sensordata — log wel hoe je je voelt.</p>
          </div>
        </div>
        <CheckinCard />
      </div>
    )
  }

  const data = healthDays.map((h) => ({
    date: d(h.date),
    steps: h.steps,
    sleep: h.sleepHours,
    hr: h.restingHR,
    active: h.activeMinutes,
    energy: h.energy,
    mood: h.mood,
  }))

  const avgH = (k: 'steps' | 'sleep' | 'hr' | 'active') =>
    data.length ? data.reduce((a, x) => a + x[k], 0) / data.length : 0

  const stat = [
    { icon: Footprints, label: 'Ø stappen', value: Math.round(avgH('steps')).toLocaleString('nl-NL'), trend: data.map((x) => x.steps) },
    { icon: Moon, label: 'Ø slaap', value: avgH('sleep').toFixed(1) + 'u', trend: data.map((x) => x.sleep) },
    { icon: Heart, label: 'Ø rust-HR', value: Math.round(avgH('hr')) + ' bpm', trend: data.map((x) => x.hr) },
    { icon: Activity, label: 'Ø actief', value: Math.round(avgH('active')) + ' min', trend: data.map((x) => x.active) },
  ]

  return (
    <div className="flex flex-col gap-7 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sunken">
          <Activity className="h-5 w-5 text-ink-soft" />
        </span>
        <div>
          <h1 className="text-xl font-medium text-ink">Gezondheid</h1>
          <p className="text-sm text-muted mt-0.5">Lichaam, stemming en gedrag — stappen, slaap, hartslag, schermtijd en agenda-druk in één overzicht.</p>
        </div>
      </div>

      <CheckinCard />

      <HealthConditions subject="rick" />

      {/* today — the one hero focal point on this screen: today's snapshot */}
      <div className="card-hero p-4">
        <div className="text-xs font-semibold uppercase tracking-wider mb-2">Vandaag</div>
        <div className="flex flex-wrap items-center justify-around gap-4">
          <div className="flex flex-col items-center gap-1">
            <Ring value={today.steps / today.stepGoal} size={72} color="stroke-forest-hi" label={today.steps.toLocaleString('nl-NL')} />
            <span className="text-xs font-medium flex items-center gap-1"><Footprints className="h-3.5 w-3.5" /> doel {today.stepGoal.toLocaleString('nl-NL')}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Ring value={today.sleepHours / 8} size={72} color="stroke-forest-hi" label={today.sleepHours + 'u'} />
            <span className="text-xs font-medium flex items-center gap-1"><Moon className="h-3.5 w-3.5" /> doel 8u</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Ring value={today.energy / 5} size={72} color="stroke-forest-hi" label={today.energy + '/5'} />
            <span className="text-xs font-medium flex items-center gap-1"><Zap className="h-3.5 w-3.5" /> energie</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Ring value={today.mood / 5} size={72} color="stroke-forest-hi" label={today.mood + '/5'} />
            <span className="text-xs font-medium flex items-center gap-1"><Smile className="h-3.5 w-3.5" /> stemming</span>
          </div>
          <div className="flex flex-col items-center justify-center">
            <Heart className="h-5 w-5 mb-1" />
            <span className="text-lg font-bold tabular-nums">{today.restingHR}</span>
            <span className="text-xs font-medium">bpm rust</span>
          </div>
        </div>
      </div>

      {/* 14-day averages, each with a mini trend so "Ø" isn't just a static number */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stat.map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="card relative p-3">
              <span className="absolute right-3 top-3">
                <Sparkline values={s.trend} className="text-ink-soft" width={40} height={18} />
              </span>
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sunken">
                <Icon className="h-4 w-4 text-ink-soft" />
              </span>
              <div className="text-xl font-bold tabular-nums mt-2">{s.value}</div>
              <div className="text-xs text-faint">{s.label} · 14d</div>
            </div>
          )
        })}
      </div>

      {/* steps */}
      <div className="card p-4">
        <h3 className="text-sm font-medium mb-1 flex items-center gap-2">
          <Footprints className="h-4 w-4 text-ink-soft" /> Stappen (14 dagen)
        </h3>
        <p className="text-xs text-faint mb-2">Groen = doel gehaald, lijn = dagdoel {today.stepGoal.toLocaleString('nl-NL')}.</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
            <XAxis dataKey="date" tick={AXIS_TICK_10} />
            <YAxis tick={AXIS_TICK_10} />
            <Tooltip contentStyle={CHART_TIP} formatter={(v: number) => [v.toLocaleString('nl-NL'), 'stappen']} />
            <ReferenceLine y={today.stepGoal} stroke="#34D399" strokeDasharray="4 4" />
            <Bar dataKey="steps" radius={[4, 4, 0, 0]}>
              {data.map((x) => (
                <Cell key={x.date} fill={x.steps >= today.stepGoal ? '#34D399' : '#333333'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* sleep */}
        <div className="card p-4">
          <h3 className="text-sm font-medium mb-1 flex items-center gap-2">
            <Moon className="h-4 w-4 text-ink-soft" /> Slaap
          </h3>
          <p className="text-xs text-faint mb-2">Roze lijn = 6u drempel, daaronder keldert je energie.</p>
          <ResponsiveContainer width="100%" height={170}>
            <LineChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
              <XAxis dataKey="date" tick={AXIS_TICK_10} />
              <YAxis domain={[0, 9]} tick={AXIS_TICK_10} />
              <Tooltip contentStyle={CHART_TIP} formatter={(v: number) => [`${v}u`, 'slaap']} />
              <ReferenceLine y={6} stroke="#F87171" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="sleep" stroke="#60A5FA" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* resting HR */}
        <div className="card p-4">
          <h3 className="text-sm font-medium mb-1 flex items-center gap-2">
            <Heart className="h-4 w-4 text-ink-soft" /> Rust-hartslag
          </h3>
          <p className="text-xs text-faint mb-2">Hoger op slechte nachten, lager bij herstel.</p>
          <ResponsiveContainer width="100%" height={170}>
            <LineChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
              <XAxis dataKey="date" tick={AXIS_TICK_10} />
              <YAxis domain={[50, 70]} tick={AXIS_TICK_10} />
              <Tooltip contentStyle={CHART_TIP} formatter={(v: number) => [`${v} bpm`, 'rust-HR']} />
              <Line type="monotone" dataKey="hr" stroke="#F87171" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── gedrag: schermtijd & agenda-druk (voorheen Signalen) ────────────── */}
      <div>
        <SectionTitle hint="Passieve gedrags-streams die de Reflect-engine voeden zodat de AI je dag beter begrijpt.">
          Gedrag · schermtijd & agenda
        </SectionTitle>
      </div>

      <div className="card p-4">
        <h3 className="text-sm font-medium mb-1 flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-ink-soft" /> Schermtijd & app-gebruik
        </h3>
        <p className="text-xs text-faint mb-2">Focus = werk/creatieve apps, afleiding = social/media. Pickups = telefoon ontgrendeld.</p>
        {screenToday ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <Kpi icon={Smartphone} value={fmtMin(Math.round(avg(screenDays.map((s) => s.totalMinutes))))} label="Ø schermtijd · 14d" />
              <Kpi icon={Hand} value={Math.round(avg(screenDays.map((s) => s.pickups))).toString()} label="Ø pickups · 14d" />
              <Kpi icon={Brain} value={fmtMin(screenToday.focusMinutes)} label="focus vandaag" />
              <Kpi icon={Smartphone} value={fmtMin(screenToday.distractMinutes)} label="afleiding vandaag" />
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={screenData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                <XAxis dataKey="date" tick={AXIS_TICK_10} />
                <YAxis tick={AXIS_TICK_10} />
                <Tooltip contentStyle={CHART_TIP} formatter={(v: number, n) => [fmtMin(v), n === 'focus' ? 'focus' : 'afleiding']} />
                <Bar dataKey="focus" stackId="s" fill={DOMAIN_HEX.buurtkaart} radius={[0, 0, 0, 0]} />
                <Bar dataKey="distract" stackId="s" fill={DOMAIN_HEX.cross} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3">
              <p className="text-xs text-faint mb-1.5">Top-apps vandaag</p>
              <div className="space-y-1.5">
                {screenToday.topApps.map((a) => (
                  <div key={a.name} className="flex items-center gap-2 text-sm">
                    <span className="w-24 shrink-0 text-ink-soft">{a.name}</span>
                    <div className="h-1.5 flex-1 rounded-full bg-line overflow-hidden">
                      <div className="h-full rounded-full bg-parkingyou" style={{ width: `${Math.min(100, (a.minutes / screenToday.totalMinutes) * 100)}%` }} />
                    </div>
                    <span className="text-xs text-faint tabular-nums w-12 text-right">{fmtMin(a.minutes)}</span>
                    <span className="chip bg-line text-ink-soft text-xs px-2 py-0 w-16 justify-center">{a.category}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-faint">Geen schermtijd-data beschikbaar.</p>
        )}
      </div>

      <div className="card p-4">
        <h3 className="text-sm font-medium mb-1 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-ink-soft" /> Agenda-druk
        </h3>
        <p className="text-xs text-faint mb-2">Roze = dag op/rond een PRJCT/campagne-deadline. 3+ meetings = versnipperde dag.</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={meetingData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
            <XAxis dataKey="date" tick={AXIS_TICK_10} />
            <YAxis allowDecimals={false} tick={AXIS_TICK_10} />
            <Tooltip contentStyle={CHART_TIP} formatter={(v: number) => [`${v} meeting(s)`, 'aantal']} />
            <ReferenceLine y={3} stroke="#F87171" strokeDasharray="4 4" />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {meetingData.map((m) => (
                <Cell key={m.iso} fill={deadlines.includes(m.iso) ? '#F87171' : '#333333'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function Kpi({ icon: Icon, value, label }: { icon: typeof Smartphone; value: string; label: string }) {
  return (
    <div className="card p-3">
      <Icon className="h-4 w-4 text-ink-soft" />
      <div className="text-lg font-semibold mt-1">{value}</div>
      <div className="text-xs text-faint">{label}</div>
    </div>
  )
}
