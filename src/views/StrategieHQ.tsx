import { ExternalLink } from 'lucide-react'
import type { View } from '../nav'

// Strategie HQ — 1-op-1 port van rick-os /hq (income tracker + week focus +
// project cards + roadmap + "wat je nooit meer doet").
const PY_SALARY = 2200
const TARGET_5K = 5000
const TARGET_10K = 10000

const PROJECTS = [
  { key: 'buurtkaart' as View, name: 'Geldrop Buurtkaart', emoji: '🗺️', phase: 'EDITIE 1 - SALES FASE', thisMonth: 0, label: 'Editie 1 in opbouw', alert: '1 / 12 spots gevuld. Doel: 12/12 voor 15 jul.', focus: 'Bel 5-7 lokale bedrijven per dinsdag. Kapper, tandarts, bakker, fysiotherapeut.', notion: 'https://app.notion.com/p/Geldrop-Buurtkaart-268ddc8e920880a987a0ff40d2c19a7c' },
  { key: 'eyes' as View, name: 'The Eyes', emoji: '👁️', phase: 'INVESTMENT FASE', thisMonth: 0, label: 'Deal nog niet getekend', alert: 'Deal nog niet getekend. Brandon vrij na 27 jun.', focus: 'WhatsApp Brandon nu. Deal vóór 5 juli. Daarna caps bestellen.', notion: 'https://app.notion.com/p/THE-EYES-MANAGEMENT-386ddc8e920880538271f85f881577ac' },
  { key: 'dakmeester' as View, name: 'Dakmeester', emoji: '🏠', phase: 'DEAL FASE', thisMonth: 0, label: 'Deal nog niet getekend', alert: 'Website live. Deal nog niet getekend. Deadline: 1 jul.', focus: 'Meeting plannen met dakdekker. Pitch: site live + leads via GMB.', notion: 'https://app.notion.com/p/Dakmeester-386ddc8e920880cf8cc7d39b4cd07e7a' },
]

const WEEK_FOCUS = [
  { day: 'Di', blocks: ['Buurtkaart dag — bel 5-7 lokale bedrijven', 'Doel: spots 2-8 verkopen voor 15 jul'] },
  { day: 'Wo', blocks: ['The Eyes + Dakmeester dag — deals, leads, content'] },
  { day: 'Ma/Do/Vr avonden', blocks: ['Follow-ups, Notion updaten, content batchen'] },
]

const ROADMAP = [
  { label: 'Maand 1 — Juli 2026', income: 3900, detail: 'PY €2.200 + GBK €1.200 + Dakmeester €500' },
  { label: 'Maand 3 — Sep 2026', income: 6500, detail: 'PY + GBK €2.100 + Dakmeester €1.200 + Eyes €1.000' },
  { label: 'Maand 6 — Dec 2026', income: 9200, detail: 'PY + alle projecten op stoom' },
]

const PHASE_TONE: Record<string, { bg: string; fg: string }> = {
  'EDITIE 1': { bg: '#D1FAE5', fg: '#065F46' },
  'SALES FASE': { bg: '#D1FAE5', fg: '#065F46' },
  INVESTMENT: { bg: '#FEF3C7', fg: '#92400E' },
}
function phaseTone(p: string) {
  for (const [k, t] of Object.entries(PHASE_TONE)) if (p.toUpperCase().includes(k)) return t
  return { bg: '#F4F5EE', fg: '#5C6150' }
}

const eur = (n: number) => `€${n.toLocaleString('nl-NL')}`

export default function StrategieHQ({ onNav }: { onNav?: (v: View) => void }) {
  const projectIncome = PROJECTS.reduce((s, p) => s + p.thisMonth, 0)
  const total = PY_SALARY + projectIncome
  const pct5 = Math.min(100, Math.round((total / TARGET_5K) * 100))
  const pct10 = Math.min(100, Math.round((total / TARGET_10K) * 100))

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-faint">Strategie</div>
        <h1 className="text-3xl font-bold tracking-tight leading-none">HQ.</h1>
        <p className="text-sm text-muted mt-1.5">Strategie overzicht · Juni 2026</p>
      </div>

      {/* income tracker */}
      <div className="card p-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-faint mb-3">Inkomen tracker</div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-bold tracking-tight">{eur(total)}</span>
          <span className="text-sm text-faint">/maand</span>
        </div>
        <div className="flex flex-wrap gap-2 mt-3 mb-4">
          <span className="chip bg-sunken text-muted">ParkingYou €2.200</span>
          {projectIncome > 0 && <span className="chip bg-sunken text-muted">Projecten {eur(projectIncome)}</span>}
        </div>
        <Bar label="Doel €5.000" pct={pct5} sub={`Nog ${eur(TARGET_5K - total)} nodig uit projecten`} />
        <div className="h-3" />
        <Bar label="Doel €10.000" pct={pct10} />
      </div>

      {/* this week */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-faint mb-2.5">Focus deze week</div>
        <div className="space-y-2">
          {WEEK_FOCUS.map((f) => (
            <div key={f.day} className="card p-3.5 flex gap-3 items-start">
              <div className="min-w-[60px] text-sm font-bold text-personal-deep">{f.day}</div>
              <div className="flex-1 space-y-1">
                {f.blocks.map((b, i) => <div key={i} className="text-sm text-muted leading-snug">{b}</div>)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* projects */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-faint mb-2.5">Actieve projecten</div>
        <div className="space-y-3.5">
          {PROJECTS.map((p) => {
            const tone = phaseTone(p.phase)
            return (
              <div key={p.key} className="card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xl">{p.emoji}</span>
                      <span className="font-bold">{p.name}</span>
                    </div>
                    <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: tone.bg, color: tone.fg }}>{p.phase}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xl font-bold tracking-tight">{eur(p.thisMonth)}</div>
                    <div className="text-[11px] text-faint">deze maand</div>
                  </div>
                </div>
                <div className="bg-sunken rounded-xl px-3 py-2.5 text-[13px] text-muted leading-relaxed border-l-[3px] border-personal">{p.focus}</div>
                <div className="text-xs text-faint">{p.label}</div>
                <div className="flex gap-2">
                  <button onClick={() => onNav?.(p.key)} className="flex-1 btn-ghost !py-2 text-xs">Open in app</button>
                  <a href={p.notion} target="_blank" rel="noopener noreferrer" className="flex-1 btn-primary !py-2 text-xs">Notion <ExternalLink className="h-3 w-3" /></a>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* roadmap */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-faint mb-2.5">Inkomen roadmap</div>
        <div className="card divide-y divide-line">
          {ROADMAP.map((m) => (
            <div key={m.label} className="flex items-center justify-between gap-3 p-4">
              <div>
                <div className="text-sm font-semibold">{m.label}</div>
                <div className="text-xs text-faint">{m.detail}</div>
              </div>
              <div className="text-xl font-bold tracking-tight shrink-0">{eur(m.income)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* never again */}
      <div className="rounded-3xl p-4" style={{ background: '#F5ECD4', border: '1px solid #C6A05B' }}>
        <div className="text-sm font-bold text-personal-deep mb-1.5">Wat je nooit meer doet</div>
        <div className="text-[13px] text-ink-soft leading-relaxed">
          Geen losse freelance klussen · Geen eBooks of kleine grafische opdrachten · Geen klanten waarbij je al irritatie voelt bij eerste contact · Geen projecten die je niet volledig zelf controleert.
        </div>
      </div>
    </div>
  )
}

function Bar({ label, pct, sub }: { label: string; pct: number; sub?: string }) {
  return (
    <div>
      <div className="flex justify-between mb-1.5">
        <span className="text-xs text-muted font-medium">{label}</span>
        <span className="text-xs text-faint tabular-nums">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-sunken overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#C6A05B,#C58392)' }} />
      </div>
      {sub && <div className="text-[11px] text-faint mt-1">{sub}</div>}
    </div>
  )
}
