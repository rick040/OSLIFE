import { useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'

// Gedeeld skelet voor de side-business schermen (The Eyes, Dakmeester).
// Live HQ-callouts komen uit Notion via notion-hq.

export type RoadmapItem = { label: string; done: boolean; deadline?: string }

export interface SideBusinessConfig {
  badge: { bg: string; fg: string; content: ReactNode }
  title: string
  subtitle: string
  intro: string
  callout: { bg: string; border: string; titleColor: string; bodyColor: string; title: string; body: ReactNode }
  /** Drie vaste stats; de vierde ("Roadmap x/y") wordt automatisch toegevoegd. */
  stats: { label: string; value: string }[]
  kpis: { label: string; value: string; target: string }[]
  roadmap0: RoadmapItem[]
  afterKpis?: ReactNode
  afterRoadmap?: ReactNode
  footer: ReactNode
}

export default function SideBusiness({ badge, title, subtitle, intro, callout, stats, kpis, roadmap0, afterKpis, afterRoadmap, footer }: SideBusinessConfig) {
  const [roadmap, setRoadmap] = useState(roadmap0)
  const done = roadmap.filter((r) => r.done).length
  const toggle = (i: number) => setRoadmap((r) => r.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))

  const allStats = [...stats, { label: 'Roadmap', value: `${done}/${roadmap.length}` }]

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: badge.bg, color: badge.fg }}>
          {badge.content}
        </span>
        <h1 className="text-4xl font-bold tracking-tight leading-none mt-3">{title}</h1>
        <h2 className="text-4xl font-bold tracking-tight leading-none text-faint">{subtitle}</h2>
        <p className="text-[15px] text-ink-soft leading-relaxed mt-3">{intro}</p>
      </div>

      <div className="rounded-3xl p-4" style={{ background: callout.bg, border: `1px solid ${callout.border}` }}>
        <div className="text-xs font-bold mb-1" style={{ color: callout.titleColor }}>{callout.title}</div>
        <div className="text-[13px] leading-relaxed" style={{ color: callout.bodyColor }}>{callout.body}</div>
      </div>

      <div className="grid grid-cols-4 gap-2.5">
        {allStats.map((s) => (
          <div key={s.label} className="card p-3">
            <div className="text-lg font-bold tracking-tight leading-none">{s.value}</div>
            <div className="text-[11px] text-faint mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      <Section title="KPIs">
        <div className="card divide-y divide-line">
          {kpis.map((k) => (
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

      {afterKpis}

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

      {afterRoadmap}

      {footer}
    </div>
  )
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-faint mb-2.5">{title}</div>
      {children}
    </div>
  )
}
