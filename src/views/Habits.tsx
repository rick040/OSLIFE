import { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts'
import { CHART_TIP_BARE, AXIS_TICK_10, AXIS_TICK_11 } from '../components/chart'
import { useStore } from '../store'
import { TODAY } from '../domains'
import { SectionTitle, Empty } from '../components/ui'
import type { Habit } from '../types'
import { Repeat, Plus, Check, Flame, X, TrendingUp } from 'lucide-react'

function isoDaysAgo(n: number): string {
  const d = new Date(TODAY + 'T00:00:00')
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}
const last30 = Array.from({ length: 30 }, (_, i) => isoDaysAgo(29 - i)) // oldest → today
const last7 = Array.from({ length: 7 }, (_, i) => isoDaysAgo(6 - i))
const WEEKDAY = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']

function doneOn(h: Habit, iso: string): boolean {
  if (iso === TODAY && h.doneToday) return true
  return (h.history ?? []).includes(iso)
}
function completion30(h: Habit): number {
  const done = last30.filter((d) => doneOn(h, d)).length
  return Math.round((done / 30) * 100)
}

export default function Habits() {
  const { habits, tickHabit, addHabit, deleteHabit } = useStore()
  // Track the selected habit by id, not index — an index goes stale when a habit
  // is deleted and would silently point the heatmap at a different habit.
  const [selId, setSel] = useState<string | null>(null)
  const [form, setForm] = useState(false)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('')

  const doneToday = habits.filter((h) => h.doneToday).length
  const pct = habits.length ? Math.round((doneToday / habits.length) * 100) : 0

  const weekData = useMemo(
    () =>
      last7.map((iso) => {
        const count = habits.filter((h) => doneOn(h, iso)).length
        return { day: WEEKDAY[new Date(iso + 'T00:00:00').getDay()], iso, count }
      }),
    [habits],
  )

  const active = habits.find((h) => h.id === selId) ?? habits[0] ?? null

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    addHabit(name.trim(), emoji.trim())
    setName(''); setEmoji(''); setForm(false)
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Repeat className="h-5 w-5 text-buurtkaart" /> Gewoontes
          </h1>
          <p className="text-sm text-muted mt-1">Dagelijks afvinken, inzicht in je consistentie.</p>
        </div>
        <button className="btn-primary !py-1.5" onClick={() => setForm((f) => !f)}>
          <Plus className="h-4 w-4" /> Nieuw
        </button>
      </div>

      {form && (
        <form onSubmit={submit} className="card p-4 flex flex-wrap gap-2 items-center">
          <input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={2} placeholder="🙂" className="w-14 text-center rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Naam (bv. Water drinken)" className="flex-1 min-w-[160px] rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none focus:border-prjct/60" />
          <button type="submit" className="btn-primary !py-1.5"><Plus className="h-4 w-4" /> Toevoegen</button>
        </form>
      )}

      {habits.length === 0 ? (
        <Empty>Nog geen gewoontes. Tik op Nieuw om te beginnen.</Empty>
      ) : (
        <>
          {/* Today summary + checklist */}
          <div className="card p-4">
            <div className="flex items-baseline justify-between">
              <div className="text-lg font-semibold">{doneToday} van {habits.length} vandaag</div>
              <div className="text-xs text-faint">{pct}%</div>
            </div>
            <div className="h-1.5 w-full rounded-full bg-line overflow-hidden mt-2 mb-4">
              <div className="h-full rounded-full bg-buurtkaart transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <div className="space-y-2">
              {habits.map((h) => (
                <button
                  key={h.id}
                  onClick={() => tickHabit(h.id)}
                  className={`w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 border transition-colors ${
                    h.doneToday ? 'bg-buurtkaart/10 border-buurtkaart/30' : 'bg-surface border-line hover:bg-sunken'
                  }`}
                >
                  <span className="text-lg shrink-0">{h.emoji}</span>
                  <span className={`flex-1 text-left text-sm ${h.doneToday ? 'text-ink font-medium' : 'text-muted'}`}>{h.name}</span>
                  {h.streak > 0 && (
                    <span className="text-[11px] text-personal-deep flex items-center gap-0.5"><Flame className="h-3 w-3" /> {h.streak}</span>
                  )}
                  <span
                    className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${
                      h.doneToday ? 'text-white' : 'border border-line text-transparent'
                    }`}
                    style={h.doneToday ? { background: h.color ?? '#34D399' } : undefined}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Week chart */}
          <div className="card p-4">
            <SectionTitle hint="Aantal afgevinkte gewoontes per dag, afgelopen 7 dagen.">Deze week</SectionTitle>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={weekData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
                <XAxis dataKey="day" tick={AXIS_TICK_11} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} domain={[0, habits.length]} tick={AXIS_TICK_10} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: '#F4F5EE' }}
                  contentStyle={CHART_TIP_BARE}
                  formatter={(v: number) => [`${v}/${habits.length}`, 'afgevinkt']}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {weekData.map((d) => (
                    <Cell key={d.iso} fill={d.count === habits.length ? '#34431F' : '#34D399'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 30-day heatmap for selected habit */}
          {active && (
            <div className="card p-4">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
                <SectionTitle>30 dagen · {active.emoji} {active.name}</SectionTitle>
                <span className="chip bg-sunken text-muted flex items-center gap-1"><TrendingUp className="h-3 w-3" /> {completion30(active)}% voltooid</span>
              </div>
              {habits.length > 1 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {habits.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => setSel(h.id)}
                      className={`chip ${h.id === active.id ? 'bg-forest text-white' : 'bg-surface border border-line text-muted'}`}
                    >
                      {h.emoji} {h.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-10 gap-1.5">
                {last30.map((iso) => {
                  const done = doneOn(active, iso)
                  const isToday = iso === TODAY
                  return (
                    <div
                      key={iso}
                      title={`${iso}: ${done ? 'gedaan' : 'gemist'}`}
                      className="aspect-square rounded-md"
                      style={{
                        background: done ? active.color ?? '#34D399' : '#F4F5EE',
                        outline: isToday ? `2px solid ${active.color ?? '#34D399'}` : 'none',
                        outlineOffset: 1,
                      }}
                    />
                  )
                })}
              </div>
              <div className="flex justify-between text-[11px] text-faint mt-2">
                <span>{last30[0].slice(5)}</span>
                <span>vandaag</span>
              </div>
            </div>
          )}

          {/* Overview list */}
          <div>
            <SectionTitle>Overzicht</SectionTitle>
            <div className="card divide-y divide-line">
              {habits.map((h) => {
                const c = completion30(h)
                return (
                  <div key={h.id} className="p-3.5">
                    <div className="flex items-center gap-2.5 mb-2">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: h.color ?? '#34D399' }} />
                      <span className="text-lg shrink-0">{h.emoji}</span>
                      <button onClick={() => setSel(h.id)} className="flex-1 text-left text-sm font-medium truncate hover:text-forest">{h.name}</button>
                      {h.streak > 0 && <span className="text-[11px] text-personal-deep flex items-center gap-0.5"><Flame className="h-3 w-3" /> {h.streak}</span>}
                      <button onClick={() => deleteHabit(h.id)} className="text-faint hover:text-cross p-1 shrink-0" aria-label="Verwijder"><X className="h-3.5 w-3.5" /></button>
                    </div>
                    <div className="h-1 rounded-full bg-line overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${c}%`, background: h.color ?? '#34D399' }} />
                    </div>
                    <div className="text-[11px] text-faint mt-1">{c}% in 30 dagen</div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
