import { useState } from 'react'
import { ExternalLink, Check } from 'lucide-react'

// The Eyes — beheerview voor side-business The Eyes.
const ROADMAP0 = [
  { label: 'Business plan compleet', done: true },
  { label: 'Afspraak inplannen met Brandon', done: false, deadline: 'nu' },
  { label: 'Deal tekenen', done: false, deadline: '5 jul' },
  { label: 'Caps bestellen run 1 (100 stuks, ~€2.200-2.900)', done: false, deadline: '10 jul' },
  { label: 'Instagram @the.eyes live + 9 posts klaar', done: false, deadline: '15 jul' },
  { label: 'Eerste drop live', done: false, deadline: '1 aug' },
  { label: '3 retailers aangehaakt', done: false, deadline: '1 sep' },
  { label: 'Eerste origineel schilderij verkocht', done: false, deadline: '15 sep' },
  { label: 'Pop-up event Amsterdam', done: false, deadline: 'okt' },
]
const REVENUE = [
  { source: 'Cap direct verkoop', share: '~€19/stuk', scale: '100 caps per run' },
  { source: 'Cap via retailer', share: '~€10,25/stuk', scale: 'Ongelimiteerd' },
  { source: 'Custom cap (event/commissie)', share: '€375 – 1.500', scale: 'Per opdracht' },
  { source: 'Schilderij (€2K–5K/stuk)', share: '€500 – 1.500 comm.', scale: 'Per verkoop' },
]
const KPIS = [
  { label: 'IG volgers', value: '0', target: '10K' },
  { label: 'Caps verkocht', value: '0', target: '100' },
  { label: 'Custom aanvragen', value: '0', target: '5/mnd' },
  { label: 'Commissie binnen', value: '€0', target: '€1.500/mnd' },
]

export default function Eyes() {
  const [roadmap, setRoadmap] = useState(ROADMAP0)
  const done = roadmap.filter((r) => r.done).length
  const toggle = (i: number) => setRoadmap((r) => r.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))

  const stats = [
    { label: 'Mijn aandeel', value: '75%' },
    { label: 'Commissie', value: '25%' },
    { label: 'Break-even', value: '115' },
    { label: 'Roadmap', value: `${done}/${roadmap.length}` },
  ]

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: '#FEF3C7', color: '#92400E' }}>
          artist management <span className="h-1 w-1 rounded-full bg-current opacity-60" /> investment fase
        </span>
        <h1 className="text-4xl font-bold tracking-tight leading-none mt-3">👁️ The Eyes</h1>
        <h2 className="text-4xl font-bold tracking-tight leading-none text-faint">Management.</h2>
        <p className="text-[15px] text-ink-soft leading-relaxed mt-3">
          Hype streetwear brand + artist management voor schilder Brandon Senders. Rick = commercieel directeur. Brandon = creatief.
        </p>
      </div>

      <div className="rounded-3xl p-4" style={{ background: '#FEF3C7', border: '1px solid #F59E0B' }}>
        <div className="text-xs font-bold mb-1" style={{ color: '#92400E' }}>Actie vereist</div>
        <div className="text-[13px] leading-relaxed" style={{ color: '#78350F' }}>
          WhatsApp Brandon <strong>vandaag</strong> om afspraak te plannen week van 30 jun. Deal vóór 5 juli getekend of project on hold. Zodra getekend: caps bestellen dag 1.
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2.5">
        {stats.map((s) => (
          <div key={s.label} className="card p-3">
            <div className="text-lg font-bold tracking-tight leading-none">{s.value}</div>
            <div className="text-[11px] text-faint mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      <Section title="KPIs">
        <div className="card divide-y divide-line">
          {KPIS.map((k) => (
            <div key={k.label} className="flex items-center justify-between p-3.5">
              <span className="text-sm text-muted">{k.label}</span>
              <div className="flex items-center gap-2.5">
                <span className="text-[15px] font-bold">{k.value}</span>
                <span className="text-[11px] text-faint">→ {k.target}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Revenue model">
        <div className="card divide-y divide-line">
          {REVENUE.map((r) => (
            <div key={r.source} className="flex items-start justify-between gap-2 p-3.5">
              <div>
                <div className="text-sm font-medium">{r.source}</div>
                <div className="text-xs text-faint mt-0.5">{r.scale}</div>
              </div>
              <div className="text-[15px] font-bold text-personal-deep shrink-0">{r.share}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Roadmap">
        <div className="card divide-y divide-line">
          {roadmap.map((item, i) => (
            <button key={item.label} onClick={() => toggle(i)} className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-sunken transition-colors">
              <span className={`h-5 w-5 rounded-md flex items-center justify-center shrink-0 ${item.done ? 'bg-buurtkaart text-white' : 'border-[1.5px] border-line text-transparent'}`}>
                <Check className="h-3 w-3" />
              </span>
              <span className={`flex-1 text-sm ${item.done ? 'line-through text-faint' : 'text-ink'}`}>{item.label}</span>
              {item.deadline && <span className="text-[11px] text-faint shrink-0">{item.deadline}</span>}
            </button>
          ))}
        </div>
      </Section>

      <a href="https://app.notion.com/p/THE-EYES-MANAGEMENT-386ddc8e920880538271f85f881577ac" target="_blank" rel="noopener noreferrer" className="btn-primary w-full">
        Open in Notion <ExternalLink className="h-4 w-4" />
      </a>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-faint mb-2.5">{title}</div>
      {children}
    </div>
  )
}
