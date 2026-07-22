import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { fmtDate } from '../domains'
import { dueLabel } from '../lib/dates'
import { DomainChip, ConfidenceBar, Empty } from '../components/ui'
import { BraindumpCard, BraindumpDetail } from '../components/BraindumpCard'
import { searchMemory } from '../lib/supabase'
import { cogneeSearch } from '../heyra/agents/cognee'
import type { BraindumpEntry, MemoryHit, InferredItem } from '../types'
import type { FactCategory } from '../heyra/learning'
import {
  Lock,
  GitBranch,
  Repeat,
  CheckCircle2,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  Minus,
  ScrollText,
  Brain,
  Inbox,
  Search,
  X,
  Network,
  Loader2,
  Trash2,
  Sparkles,
  Check,
} from 'lucide-react'

type Tab = 'essentials' | 'learned' | 'threads' | 'patterns' | 'summaries' | 'braindumps' | 'inferences'

// Human labels for the inference types the engine currently produces.
const INFERENCE_TYPE_LABEL: Record<string, string> = {
  vet_visit: 'Dierenartsbezoek',
  subscription_candidate: 'Terugkerende uitgave',
  energy_dip_pattern: 'Slaap/energie-signaal',
  project_stall: 'Project ligt stil',
}

function InferenceCard({ item, onResolve }: {
  item: InferredItem
  onResolve: (id: string, decision: 'confirm' | 'reject') => void
}) {
  const [busy, setBusy] = useState(false)
  const resolve = (decision: 'confirm' | 'reject') => {
    setBusy(true)
    onResolve(item.id, decision)
  }
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs uppercase tracking-wider text-faint">
            {INFERENCE_TYPE_LABEL[item.type] ?? item.type}
          </span>
          {item.ruleId && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-line text-muted">{item.ruleId}</span>
          )}
        </div>
        <div className="flex gap-1">
          {item.domains.map((dm) => (
            <span key={dm} className="text-[10px] px-1.5 py-0.5 rounded-full bg-line text-muted">{dm}</span>
          ))}
        </div>
      </div>

      <p className="text-sm text-ink">{item.question}</p>

      <div className="flex items-center gap-3">
        <span className="text-[10px] uppercase tracking-wider text-faint shrink-0">zekerheid</span>
        <ConfidenceBar value={item.confidence} />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          disabled={busy}
          onClick={() => resolve('confirm')}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-forest/10 text-forest border border-forest-hi/40 py-2 text-sm font-medium hover:bg-forest/15 disabled:opacity-50"
        >
          <Check className="h-4 w-4" /> Bevestigen
        </button>
        <button
          disabled={busy}
          onClick={() => resolve('reject')}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-line/60 text-muted border border-line py-2 text-sm font-medium hover:bg-line disabled:opacity-50"
        >
          <X className="h-4 w-4" /> Verwerpen
        </button>
      </div>
    </div>
  )
}

const CATEGORY_META: Record<FactCategory, { label: string; hex: string }> = {
  preference: { label: 'Voorkeur', hex: '#A78BFA' },
  person: { label: 'Persoon', hex: '#7CA9C9' },
  context: { label: 'Context', hex: '#8A9A6B' },
  workflow: { label: 'Werkwijze', hex: '#FBBF24' },
  goal: { label: 'Doel', hex: '#F87171' },
}

const SOURCE_LABEL: Record<string, string> = {
  braindump: 'Braindump',
  interaction: 'Contact',
  summary: 'Samenvatting',
}

export default function Memory() {
  const {
    essentials,
    learnedFacts,
    forgetLearnedFact,
    threads,
    patterns,
    summaries,
    braindumpEntries,
    deleteBraindumpEntry,
    retryBraindumpEntry,
    closeThread,
    reopenThread,
    dataSource,
    inferences,
    resolveInference,
    loadInferences,
  } = useStore()
  const [tab, setTab] = useState<Tab>('threads')
  const [openEntry, setOpenEntry] = useState<BraindumpEntry | null>(null)

  // Refresh the inference queue on entry so hourly-produced inferences show without a reload.
  useEffect(() => { void loadInferences() }, [loadInferences])

  // ── Live search over the one memory: hybrid full-text/vector recall
  // (search_memory) plus a best-effort knowledge-graph insight (cognee) — the
  // same two sources HEYRA's chat already uses, finally with an entry point
  // outside a chat message. Debounced so it doesn't fire on every keystroke.
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [hits, setHits] = useState<MemoryHit[]>([])
  const [graphInsight, setGraphInsight] = useState<string | null>(null)

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setHits([])
      setGraphInsight(null)
      setSearching(false)
      return
    }
    setSearching(true)
    const t = window.setTimeout(() => {
      Promise.all([searchMemory(q, 10), cogneeSearch(q)])
        .then(([h, g]) => {
          setHits(h)
          setGraphInsight(g)
        })
        .finally(() => setSearching(false))
    }, 350)
    return () => window.clearTimeout(t)
  }, [query])

  const readyBraindumps = useMemo(
    () =>
      (braindumpEntries ?? [])
        .filter((e) => e.status === 'ready')
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [braindumpEntries],
  )
  const openLiveEntry = openEntry ? readyBraindumps.find((e) => e.id === openEntry.id) ?? openEntry : null

  const tabs: { id: Tab; label: string; icon: typeof Lock; count: number; desc: string }[] = [
    { id: 'essentials', label: 'Basis', icon: Lock, count: essentials.length, desc: 'Permanente, structurele feiten. Ze veranderen niet en verlopen niet.' },
    { id: 'learned', label: 'Geleerd', icon: Brain, count: learnedFacts.length, desc: 'Wat HEYRA in gesprekken over je heeft geleerd — groeit vanzelf hoe meer je praat. Klopt iets niet, wis het.' },
    { id: 'threads', label: 'Threads', icon: GitBranch, count: threads.filter((t) => t.status === 'open').length, desc: 'Open loops & openstaande beloften. Deze vragen om afsluiting.' },
    { id: 'patterns', label: 'Patronen', icon: Repeat, count: patterns.length, desc: 'Terugkerende observaties, gewogen op betrouwbaarheid. Ze nemen af als ze niet worden versterkt.' },
    { id: 'summaries', label: 'Samenvattingen', icon: ScrollText, count: summaries.length, desc: 'Nachtelijke dag-digests: ruwe events ingedikt tot leesbare context (tier=normaal).' },
    { id: 'braindumps', label: 'Braindumps', icon: Inbox, count: readyBraindumps.length, desc: 'Alles wat je hebt vastgelegd — links, notities, foto’s, video’s — omgezet naar doorzoekbare kennis.' },
    { id: 'inferences', label: 'Inferenties', icon: Sparkles, count: inferences.length, desc: 'Wat het systeem afleidde uit je data, maar nog niet als feit vastlegt. Bevestig wat klopt, verwerp wat niet.' },
  ]

  return (
    <div className="flex flex-col gap-7 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sunken">
            <Brain className="h-5 w-5 text-ink-soft" />
          </span>
          <div>
            <h1 className="text-xl font-medium text-ink">Geheugen</h1>
            <p className="text-sm text-muted mt-0.5">
              Eén doorzoekbaar geheugen. Een belofte mag nooit begraven raken onder een gewoonte.
            </p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-[11px] text-faint shrink-0">
          <span className={`h-1.5 w-1.5 rounded-full ${dataSource === 'live' ? 'bg-forest' : 'bg-faint'}`} />
          {dataSource === 'live' ? 'live · bijgewerkt in realtime' : 'mock data'}
        </span>
      </div>

      {/* search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Doorzoek je hele geheugen…"
          className="w-full rounded-xl bg-sunken border border-line pl-9 pr-9 py-2.5 text-sm outline-none focus:border-forest-hi/50"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-ink"
            aria-label="Wis zoekopdracht"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {query.trim() ? (
        <div className="space-y-2 animate-fade-up">
          {searching ? (
            <div className="flex items-center gap-2 text-sm text-muted py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Zoeken…
            </div>
          ) : hits.length || graphInsight ? (
            <>
              {graphInsight && (
                <div className="card p-3 flex items-start gap-2 bg-sunken">
                  <Network className="h-4 w-4 text-muted mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-faint mb-0.5">uit je kennisgraaf</p>
                    <p className="text-sm text-ink-soft">{graphInsight}</p>
                  </div>
                </div>
              )}
              {hits.map((h) => (
                <div key={h.id} className="card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-faint">{SOURCE_LABEL[h.source] ?? h.source}</span>
                    {h.ts && <span className="text-[11px] text-faint">{fmtDate(h.ts)}</span>}
                  </div>
                  <p className="text-sm font-medium text-ink mt-1">{h.title}</p>
                  {h.snippet && <p className="text-xs text-muted mt-0.5">{h.snippet}</p>}
                </div>
              ))}
            </>
          ) : (
            <Empty>Niks gevonden voor “{query.trim()}”.</Empty>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
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
                  <div className="text-xs sm:text-sm font-medium mt-1 leading-tight break-words hyphens-auto">{t.label}</div>
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

          {tab === 'learned' && (learnedFacts.length === 0 ? (
            <Empty>Nog niks geleerd — hoe meer je met HEYRA praat, hoe persoonlijker dit wordt.</Empty>
          ) : (
            <div className="space-y-2 animate-fade-up">
              {learnedFacts.map((f) => {
                const meta = CATEGORY_META[f.category]
                return (
                  <div key={f.id} className="card p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="chip text-[10px]" style={{ background: `${meta.hex}22`, color: meta.hex }}>
                          {meta.label}
                        </span>
                        <span className="text-[11px] text-faint">{fmtDate(f.createdAt)}</span>
                      </div>
                      <p className="text-sm text-ink mt-1">{f.text}</p>
                    </div>
                    <button
                      onClick={() => forgetLearnedFact(f.id)}
                      className="text-faint hover:text-red-500 p-1 shrink-0"
                      aria-label="Vergeet dit feit"
                      title="Vergeet dit feit"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              })}
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
                            <span className="chip bg-buurtkaart/15 text-buurtkaart-deep">gesloten</span>
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

          {tab === 'braindumps' && (readyBraindumps.length === 0 ? (
            <Empty>Nog niks vastgelegd. Gebruik Vastleggen of deel iets naar OSLIFE.</Empty>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 animate-fade-up">
              {readyBraindumps.slice(0, 30).map((e) => (
                <BraindumpCard key={e.id} entry={e} onOpen={() => setOpenEntry(e)} />
              ))}
            </div>
          ))}

          {tab === 'inferences' && (inferences.length === 0 ? (
            <Empty>Niets te bevestigen. Het systeem heeft geen open gissingen voor je.</Empty>
          ) : (
            <div className="space-y-3 animate-fade-up">
              {inferences.map((item) => (
                <InferenceCard key={item.id} item={item} onResolve={resolveInference} />
              ))}
            </div>
          ))}
        </>
      )}

      {openLiveEntry && (
        <BraindumpDetail
          entry={openLiveEntry}
          onClose={() => setOpenEntry(null)}
          onDelete={deleteBraindumpEntry}
          onRetry={retryBraindumpEntry}
        />
      )}
    </div>
  )
}
