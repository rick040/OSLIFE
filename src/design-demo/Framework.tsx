import { Card } from './components'

const SWATCHES: { name: string; token: string; hex: string }[] = [
  { name: 'bg-base', token: '--v3-bg-base', hex: '#141416' },
  { name: 'bg-surface', token: '--v3-bg-surface', hex: '#212125' },
  { name: 'bg-elevated', token: '--v3-bg-elevated', hex: '#2A2A2E' },
  { name: 'text-primary', token: '--v3-text-primary', hex: '#F5F5F7' },
  { name: 'text-secondary', token: '--v3-text-secondary', hex: '#8A8A90' },
]

const SEMANTIC: { name: string; fillVar: string; textVar: string; fillHex: string; textHex: string }[] = [
  { name: 'success', fillVar: '--v3-success-fill', textVar: '--v3-success-text', fillHex: '#2E4A3D', textHex: '#4ADE80' },
  { name: 'danger', fillVar: '--v3-danger-fill', textVar: '--v3-danger-text', fillHex: '#4A2E2E', textHex: '#F87171' },
  { name: 'warning', fillVar: '--v3-warning-fill', textVar: '--v3-warning-text', fillHex: '#4A3E2E', textHex: '#E8C468' },
]

/** Phase 1 — design framework reference sheet: tokens + type scale + the core law. */
export default function Framework() {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <p className="v3-micro-label mb-4">Core law</p>
        <p className="v3-heading mb-2">Number / icon / color first. Label second. Sentence never — except the greeting.</p>
        <p className="v3-body">
          Every card must be legible in under two seconds without reading a word. The one exception is the AI-greeting
          header, which is allowed exactly one sentence with inline-bolded stats.
        </p>
      </Card>

      <Card>
        <p className="v3-micro-label mb-4">Neutral surfaces</p>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {SWATCHES.map((s) => (
            <div key={s.name} className="flex flex-col gap-2">
              <div
                className="h-16 rounded-2xl"
                style={{ background: s.hex, border: s.hex === '#141416' ? '1px solid rgba(255,255,255,0.1)' : undefined }}
              />
              <p className="text-xs font-semibold">{s.name}</p>
              <p className="text-[11px] font-mono" style={{ color: 'hsl(var(--v3-text-secondary))' }}>
                {s.hex}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <p className="v3-micro-label mb-4">Semantic accents (fill + text pairs)</p>
        <div className="grid grid-cols-3 gap-3">
          {SEMANTIC.map((s) => (
            <div key={s.name} className="flex flex-col gap-2">
              <div
                className="h-16 rounded-2xl flex items-center justify-center text-sm font-bold"
                style={{ background: s.fillHex, color: s.textHex }}
              >
                Aa
              </div>
              <p className="text-xs font-semibold capitalize">{s.name}</p>
              <p className="text-[11px] font-mono" style={{ color: 'hsl(var(--v3-text-secondary))' }}>
                {s.fillHex} / {s.textHex}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <p className="v3-micro-label mb-4">Type scale</p>
        <div className="flex flex-col gap-4">
          <div>
            <p className="v3-display" style={{ fontSize: '3rem' }}>
              1,302
            </p>
            <p className="text-xs mt-1" style={{ color: 'hsl(var(--v3-text-secondary))' }}>
              Display — hero numbers · 800 weight · tabular-nums · tracking -0.02em
            </p>
          </div>
          <div>
            <p className="v3-heading">Section heading</p>
            <p className="text-xs mt-1" style={{ color: 'hsl(var(--v3-text-secondary))' }}>
              Heading — card titles · 700 weight · 18px
            </p>
          </div>
          <div>
            <p className="v3-micro-label">Micro label</p>
            <p className="text-xs mt-1" style={{ color: 'hsl(var(--v3-text-secondary))' }}>
              Micro-label — eyebrows/units · 700 weight · 10px · uppercase · tracked 0.12em
            </p>
          </div>
          <div>
            <p className="v3-body">Body copy — reserved for one sentence per card, max.</p>
            <p className="text-xs mt-1" style={{ color: 'hsl(var(--v3-text-secondary))' }}>
              Body — 14px · secondary color
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <p className="v3-micro-label mb-4">Shape & elevation</p>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-semibold mb-1">Card radius</p>
            <p style={{ color: 'hsl(var(--v3-text-secondary))' }}>26px — every card, hero, and duo-cell</p>
          </div>
          <div>
            <p className="font-semibold mb-1">Pill radius</p>
            <p style={{ color: 'hsl(var(--v3-text-secondary))' }}>full — badges, tabs, task/goal rows</p>
          </div>
          <div>
            <p className="font-semibold mb-1">Elevation</p>
            <p style={{ color: 'hsl(var(--v3-text-secondary))' }}>
              Two flat layers only (surface, elevated) — no drop shadows. Depth comes from layered fills, not blur.
            </p>
          </div>
          <div>
            <p className="font-semibold mb-1">Motion</p>
            <p style={{ color: 'hsl(var(--v3-text-secondary))' }}>
              120–150ms ease-out, state-change only. No bounce, no entrance choreography.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <p className="v3-micro-label mb-2">Icon style</p>
        <p className="v3-body">
          lucide-react, single stroke weight (1.5–2px), max one filled/solid icon per card — everything else stays
          outline so the one accent glyph (urgency dot, priority bar, delta arrow) still reads as the thing to look
          at first.
        </p>
      </Card>
    </div>
  )
}
