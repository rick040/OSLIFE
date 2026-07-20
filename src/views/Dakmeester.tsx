import { ExternalLink } from 'lucide-react'
import SideBusiness, { Section } from './SideBusiness'

// Dakmeester — side-business scherm.
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
  return (
    <SideBusiness
      badge={{
        bg: '#D1FAE5',
        fg: '#065F46',
        content: <>lead generation <span className="h-1 w-1 rounded-full bg-current opacity-50" /> deal fase</>,
      }}
      title="🏠 Dakmeester"
      subtitle="Premium dak."
      intro="Premium lead gen en marketing voor een bevriende onafhankelijke dakdekker. Website live. Deal nog niet getekend."
      callout={{
        bg: '#D1FAE5',
        border: '#10B981',
        titleColor: '#065F46',
        bodyColor: '#064E3B',
        title: 'Quick win beschikbaar',
        body: <>Meeting plannen <strong>deze week</strong>. Pitch: site al live + 7 emails klaar. Voorstel: €500/maand retainer. Twijfelt hij? Eerste maand gratis. Deadline deal: <strong>1 juli 2026.</strong></>,
      }}
      stats={[
        { label: 'Site status', value: 'Live' },
        { label: 'Emails klaar', value: '7/7' },
        { label: 'Leads nu', value: '0' },
      ]}
      kpis={KPIS}
      roadmap0={ROADMAP0}
      afterKpis={
        <>
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
        </>
      }
      afterRoadmap={
        <div className="card p-4">
          <div className="text-sm font-bold mb-3">Lead gen aanpak</div>
          {APPROACH.map((step, i) => (
            <div key={i} className="flex gap-2.5 mb-2 last:mb-0">
              <span className="h-5 w-5 rounded-full bg-sunken flex items-center justify-center text-[11px] font-bold text-personal-deep shrink-0">{i + 1}</span>
              <span className="text-[13px] text-muted leading-snug pt-0.5">{step}</span>
            </div>
          ))}
        </div>
      }
      footer={
        <a href="https://dakdekker-iota.vercel.app/" target="_blank" rel="noopener noreferrer" className="btn-ghost w-full">Bekijk website <ExternalLink className="h-4 w-4" /></a>
      }
    />
  )
}
