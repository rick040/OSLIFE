import { useState } from 'react'
import { useStore } from '../store'
import { fmtDate } from '../domains'
import { dueLabel } from '../lib/dates'
import { DomainChip, ConfidenceBar, Empty } from '../components/ui'
import { Lock, GitBranch, Repeat, CheckCircle2, RotateCcw, TrendingUp, TrendingDown, Minus, ScrollText } from 'lucide-react'

type Tab = 'essentials' | 'threads' | 'patterns' | 'summaries'

export default function Memory() {
  const { essentials, threads, patterns, summaries, closeThread, reopenThread } = useStore()
  const [tab, setTab] = useState<Tab>('threads')

  const tabs: { id: Tab; label: string; icon: typeof Lock; count: number; desc: string }[] = [
    { id: 'essentials', label: 'Feiten', icon: Lock, count: essentials.length, desc: 'Permanente feiten. Ze veranderen niet en verlopen niet.' },
    { id: 'threads', label: 'Threads', icon: GitBranch, count: threads.filter((t) => t.status === 'open').length, desc: 'Open loops & openstaande beloften. Deze vragen om afsluiting.' },
    { id: 'patterns', label: 'Patronen', icon: Repeat, count: patterns.length, desc: 'Terugkerende observaties, gewogen op betrouwbaarheid. Ze nemen af als ze niet worden versterkt.' },
    { id: 'summaries', label: 'Samenvattingen', icon: ScrollText, count: summaries.length, desc: 'Nachtelijke dag-digests: ruwe events ingedikt tot leesbare context (tier=normaal).' },
  ]

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold">Geheugen</h1>
        <p className="text-sm text-muted mt-1">
          Drie bewust gescheiden opslagplaatsen. Een belofte mag nooit begraven raken onder een gewoonte.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {tabs.map((t) => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`card p-3 text-left transition-all ${active ? 'border-forest-hi/60 bg-forest/5' : 'hover:border-line'}`}
            >
              <div className="flex items-center justify-between">
                <Icon className={`h-4 w-4 ${active ? 'text-forest' : 'text-muted'}`} />
                <span className="text-lg font-semibold tabular-nums">{t.count}</span>
              </div>
              <div className="text-sm font-medium mt-1">{t.label}</div>
            </button>
          )
        })}
      </div>

      <p className="text-xs text-faint -mt-2">{tabs.find((t) => t.id === tab)!.desc}</p>

      {tab === 'essentials' && (essentials.length === 0 ? (
        <Empty>Nog geen feiten afgeleid. Verbind je databronnen.</Empty>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 animate-fade-up">
          {essentials.map((e) => (
            <div key={e.id} className="card p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-faint">{e.label}</span>
                <DomainChip domain={e.domain} small />
              </div>
              <p className="text-sm text-ink mt-1">{e.value}</p>
            </div>
          ))}
        </div>
      ))}

      {tab === 'threads' && (
        <div className="space-y-2 animate-fade-up">
          {threads.length ? (
            threads.map((t) => {
              const due = dueLabel(t.due, { prefix: 'deadline ', none: 'geen deadline', active: t.status === 'open' })
              return (
                <div
                  key={t.id}
                  className={`card p-3 flex items-center justify-between gap-3 ${
                    t.status === 'closed' ? 'opacity-50' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <DomainChip domain={t.domain} small />
                      {t.status === 'closed' ? (
                        <span className="chip bg-buurtkaart/15 text-buurtkaart">gesloten</span>
                      ) : (
                        <span className={`text-[11px] ${due.overdue ? 'text-cross font-medium' : 'text-faint'}`}>
                          {due.label}
                        </span>
                      )}
                    </div>
                    <p className={`text-sm mt-0.5 truncate ${t.status === 'closed' ? 'line-through text-faint' : 'text-ink'}`}>
                      {t.title}
                    </p>
                    <p className="text-[11px] text-faint">{'→'} {t.owedTo}</p>
                  </div>
                  {t.status === 'open' ? (
                    <button className="btn-ghost shrink-0 !py-1.5" onClick={() => closeThread(t.id)}>
                      <CheckCircle2 className="h-4 w-4" /> Sluiten
                    </button>
                  ) : (
                    <button className="btn-ghost shrink-0 !py-1.5" onClick={() => reopenThread(t.id)}>
                      <RotateCcw className="h-4 w-4" /> Heropenen
                    </button>
                  )}
                </div>
              )
            })
          ) : (
            <Empty>Nog geen threads.</Empty>
          )}
        </div>
      )}

      {tab === 'patterns' && (patterns.length === 0 ? (
        <Empty>Nog geen patronen. Voer een reflectie uit zodra er genoeg data is.</Empty>
      ) : (
        <div className="space-y-2 animate-fade-up">
          {patterns
            .slice()
            .sort((a, b) => b.confidence - a.confidence)
            .map((p) => {
              const Trend = p.trend === 'up' ? TrendingUp : p.trend === 'down' ? TrendingDown : Minus
              return (
                <div key={p.id} className="card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-ink">{p.text}</p>
                    <DomainChip domain={p.domain} small />
                  </div>
                  <div className="mt-2">
                    <ConfidenceBar value={p.confidence} />
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-faint mt-1.5">
                    <Trend
                      className={`h-3 w-3 ${
                        p.trend === 'up' ? 'text-buurtkaart' : p.trend === 'down' ? 'text-cross' : 'text-faint'
                      }`}
                    />
                    laatst versterkt op {fmtDate(p.lastReinforced)}
                  </div>
                </div>
              )
            })}
        </div>
      ))}

      {tab === 'summaries' && (summaries.length === 0 ? (
        <Empty>Nog geen samenvattingen. De nachtelijke roll-up vult deze zodra er dagdata is.</Empty>
      ) : (
        <div className="space-y-2 animate-fade-up">
          {summaries.map((s) => (
            <div key={s.id} className="card p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-faint">{s.period} · {fmtDate(s.periodStart)}</span>
                <span className="text-[11px] text-faint">{s.eventCount} signalen</span>
              </div>
              <p className="text-sm text-ink mt-1 whitespace-pre-line">{s.text}</p>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
