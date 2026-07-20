import SideBusiness, { Section } from './SideBusiness'

// The Eyes — side-business scherm.
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
  return (
    <SideBusiness
      badge={{
        bg: '#FEF3C7',
        fg: '#92400E',
        content: <>artist management <span className="h-1 w-1 rounded-full bg-current opacity-60" /> investment fase</>,
      }}
      title="👁️ The Eyes"
      subtitle="Management."
      intro="Hype streetwear brand + artist management voor schilder Brandon Senders. Rick = commercieel directeur. Brandon = creatief."
      callout={{
        bg: '#FEF3C7',
        border: '#F59E0B',
        titleColor: '#92400E',
        bodyColor: '#78350F',
        title: 'Actie vereist',
        body: <>WhatsApp Brandon <strong>vandaag</strong> om afspraak te plannen week van 30 jun. Deal vóór 5 juli getekend of project on hold. Zodra getekend: caps bestellen dag 1.</>,
      }}
      stats={[
        { label: 'Mijn aandeel', value: '75%' },
        { label: 'Commissie', value: '25%' },
        { label: 'Break-even', value: '115' },
      ]}
      kpis={KPIS}
      roadmap0={ROADMAP0}
      afterKpis={
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
      }
    />
  )
}
