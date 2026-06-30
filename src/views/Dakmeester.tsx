import { useState } from 'react'
import { ExternalLink, Check } from 'lucide-react'

// Dakmeester — beheerview voor side-business Dakmeester.
const ROADMAP0 = [
  { label: 'Website gebouwd + live (dakdekker-iota.vercel.app)', done: true },
  { label: '7 email templates klaar (aanvraag, afspraak, offerte, opvolging, betaling)', done: true },
  { label: 'SEO-structuur + on-page copy klaar', done: true },
  { label: 'Deal getekend met dakdekker', done: false, deadline: '1 jul' },
  { label: 'Google Mijn Bedrijf live + geoptimaliseerd', done: false, deadline: '5 jul' },
  { label: 'Eerste 3 leads gegenereerd', done: false, deadline: '31 jul' },
  { label: '5+ jobs per maand consistent', done: false, deadline: 'sep' },
  { label: "Top 3 Google 'dakdekker Geldrop'", done: false, deadline: 'okt' },
]
const DELIVERABLES = [
  { name: "Next.js website — 6 pagina's", status: 'live', href: 'https://dakdekker-iota.vercel.app/' },
  { name: '7 email templates (volledige flow)', status: 'klaar' },
  { name: 'SEO-structuur + on-page copy', status: 'klaar' },
  { name: 'Deal getekend met dakdekker', status: 'open' },
  { name: 'Google Mijn Bedrijf aangemaakt', status: 'open' },
  { name: 'Eerste lead gegenereerd', status: 'open' },
]
const REVENUE = [
  { name: 'A. Retainer', income: '€500/maand vast', pref: 'Eerste keuze — voorspelbaar' },
  { name: 'B. Per job', income: '€200 × jobs', pref: 'Bij 4+ jobs = €800' },
  { name: 'C. Combinatie', income: '€250 + €100/job', pref: 'Hybride startoptie' },
]
const KPIS = [
  { label: 'Leads/maand', value: '0', target: '5' },
  { label: 'Jobs gesloten', value: '0', target: '4/mnd' },
  { label: 'Revenue/maand', value: '€0', target: '€800' },
  { label: 'Google positie', value: '—', target: 'Top 3' },
]
const APPROACH = [
  "GMB profiel aanmaken met foto's, diensten en openingstijden",
  'Reviews verzamelen na elke klus via geautomatiseerde email (al klaar)',
  "Lokale SEO: 'dakdekker Geldrop / Helmond / Eindhoven'",
  'Na 3 maanden organisch: Google Ads overwegen bij budget',
]
const STATUS_TONE: Record<string, { bg: string; fg: string; label: string }> = {
  live: { bg: '#D1FAE5', fg: '#065F46', label: '✅ live' },
  klaar: { bg: '#D1FAE5', fg: '#065F46', label: '✅ klaar' },
  open: { bg: '#F4F5EE', fg: '#5C6150', label: 'open' },
}

export default function Dakmeester() {
  const [roadmap, setRoadmap] = useState(ROADMAP0)
  const done = roadmap.filter((r) => r.done).length
  const toggle = (i: number) => setRoadmap((r) => r.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))

  const stats = [
    { label: 'Site status', value: 'Live' },
    { label: 'Emails klaar', value: '7/7' },
    { label: 'Leads nu', value: '0' },
    { label: 'Roadmap', value: `${done}/${roadmap.length}` },
  ]

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: '#D1FAE5', color: '#065F46' }}>
          lead generation <span className="h-1 w-1 rounded-full bg-current opacity-50" /> deal fase
        </span>
        <h1 className="text-4xl font-bold tracking-tight leading-none mt-3">🏠 Dakmeester</h1>
        <h2 className="text-4xl font-bold tracking-tight leading-none text-faint">Premium dak.</h2>
        <p className="text-[15px] text-ink-soft leading-relaxed mt-3">
          Premium lead gen en marketing voor een bevriende onafhankelijke dakdekker. Website live. Deal nog niet getekend.
        </p>
      </div>

      <div className="rounded-3xl p-4" style={{ background: '#D1FAE5', border: '1px solid #10B981' }}>
        <div className="text-xs font-bold mb-1" style={{ color: '#065F46' }}>Quick win beschikbaar</div>
        <div className="text-[13px] leading-relaxed" style={{ color: '#064E3B' }}>
          Meeting plannen <strong>deze week</strong>. Pitch: site al live + 7 emails klaar. Voorstel: €500/maand retainer. Twijfelt hij? Eerste maand gratis. Deadline deal: <strong>1 juli 2026.</strong>
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

      <Section title="Wat er al klaar is">
        <div className="card divide-y divide-line">
          {DELIVERABLES.map((d) => {
            const tone = STATUS_TONE[d.status]
            return (
              <div key={d.name} className="flex items-center justify-between gap-2.5 p-3.5">
                <span className="text-sm text-muted">
                  {d.name}
                  {'href' in d && d.href && (
                    <a href={d.href} target="_blank" rel="noopener noreferrer" className="ml-2 text-personal-deep">↗</a>
                  )}
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ background: tone.bg, color: tone.fg }}>{tone.label}</span>
              </div>
            )
          })}
        </div>
      </Section>

      <Section title="Verdienmodel opties">
        <div className="card divide-y divide-line">
          {REVENUE.map((r, i) => (
            <div key={r.name} className="flex items-center justify-between gap-2 p-3.5">
              <div>
                <div className={`text-sm font-semibold ${i === 0 ? 'text-ink' : 'text-muted'}`}>{r.name}</div>
                <div className="text-xs text-faint mt-0.5">{r.pref}</div>
              </div>
              <div className={`text-[15px] font-bold shrink-0 ${i === 0 ? 'text-buurtkaart-deep' : 'text-faint'}`}>{r.income}</div>
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

      <div className="card p-4">
        <div className="text-sm font-bold mb-3">Lead gen aanpak</div>
        {APPROACH.map((step, i) => (
          <div key={i} className="flex gap-2.5 mb-2 last:mb-0">
            <span className="h-5 w-5 rounded-full bg-sunken flex items-center justify-center text-[11px] font-bold text-personal-deep shrink-0">{i + 1}</span>
            <span className="text-[13px] text-muted leading-snug pt-0.5">{step}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-2.5">
        <a href="https://dakdekker-iota.vercel.app/" target="_blank" rel="noopener noreferrer" className="flex-1 btn-ghost">Bekijk website <ExternalLink className="h-4 w-4" /></a>
        <a href="https://app.notion.com/p/Dakmeester-386ddc8e920880cf8cc7d39b4cd07e7a" target="_blank" rel="noopener noreferrer" className="flex-1 btn-primary">Open in Notion <ExternalLink className="h-4 w-4" /></a>
      </div>
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
