import { useMemo, useRef, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  Plus, Mic, MicOff, Loader2, AlertTriangle, RotateCcw, Trash2, X, Pencil, Check,
  Sparkles, TrendingUp, Target, ShieldAlert, Lightbulb, Grid2x2, Rocket, Mail, Radar,
  Users2, Building2, Compass, Euro, Quote, MapPinned, Search, FolderKanban,
  Download, Printer, GitCompare, Settings2, Scale,
} from 'lucide-react'
import type { View } from '../nav'
import type { BusinessIdea, IdeaLifecycleStatus, ImpactLevel, Domain, Persona, ScoreBreakdown } from '../types'
import { useStore } from '../store'
import { DOMAIN_META, DOMAIN_HEX, fmtDate, TODAY } from '../domains'
import { eur0 as eur } from '../lib/format'
import { ideaStaleness, STALENESS_META } from '../lib/ideaStaleness'
import { downloadIdeaMarkdown, printIdeaAsPdf } from '../lib/ideaExport'
import { DomainChip, Ring, Overlay, ConfirmDialog, Empty, SetupHint, SectionTitle } from '../components/ui'
import { CHART_TIP, AXIS_TICK_10 } from '../components/chart'
import { Markdown } from '../components/Markdown'

const STATUS_LABEL: Record<IdeaLifecycleStatus, string> = {
  idea: 'Idee', active: 'Actief', parked: 'Geparkeerd', archived: 'Gearchiveerd',
}
// Light pastel stops — these are chip text colors read against their own
// ~12%-alpha tinted background, so they need to stay light on the dark
// canvas (the same "-deep" convention as the domain tokens), not the dark
// saturated stops a light-mode card would have used.
const STATUS_HEX: Record<IdeaLifecycleStatus, string> = {
  idea: '#a3a3a3', active: '#6ee7b7', parked: '#fcd34d', archived: '#8c8c8c',
}
const IMPACT_LABEL: Record<ImpactLevel, string> = { low: 'laag', medium: 'gemiddeld', high: 'hoog' }
/** Risk impact: high = bad (red). Opportunity potential: high = good (green). */
const RISK_HEX: Record<ImpactLevel, string> = { low: '#6ee7b7', medium: '#fcd34d', high: '#fca5a5' }
const POTENTIAL_HEX: Record<ImpactLevel, string> = { low: '#a3a3a3', medium: '#fcd34d', high: '#6ee7b7' }

function feasibilityStroke(score: number | null): string {
  if (score === null) return 'stroke-line'
  if (score >= 70) return 'stroke-buurtkaart'
  if (score >= 40) return 'stroke-personal'
  return 'stroke-cross'
}

type SpeechRec = { start: () => void; stop: () => void; onresult: ((e: any) => void) | null; onend: (() => void) | null; lang: string; interimResults: boolean; continuous: boolean }

export default function StrategieHQ({ onNav }: { onNav?: (v: View) => void } = {}) {
  const businessIdeas = useStore((s) => s.businessIdeas)
  const captureBusinessIdea = useStore((s) => s.captureBusinessIdea)
  const updateBusinessIdea = useStore((s) => s.updateBusinessIdea)
  const deleteBusinessIdea = useStore((s) => s.deleteBusinessIdea)
  const retryIdeaElaboration = useStore((s) => s.retryIdeaElaboration)
  const toggleIdeaMilestone = useStore((s) => s.toggleIdeaMilestone)
  const generateMvpPlan = useStore((s) => s.generateMvpPlan)
  const toggleMvpRoadmapTask = useStore((s) => s.toggleMvpRoadmapTask)
  const generateCustomerAnalysis = useStore((s) => s.generateCustomerAnalysis)
  const convertIdeaToProject = useStore((s) => s.convertIdeaToProject)
  const setFocusProjectId = useStore((s) => s.setFocusProjectId)

  const [statusFilter, setStatusFilter] = useState<IdeaLifecycleStatus | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'newest' | 'feasibility'>('newest')
  const [newOpen, setNewOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [compareMode, setCompareMode] = useState(false)
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [showCompare, setShowCompare] = useState(false)

  function toggleCompare(id: string) {
    setCompareIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : ids.length < 4 ? [...ids, id] : ids))
  }
  function exitCompareMode() {
    setCompareMode(false)
    setCompareIds([])
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: businessIdeas.length }
    for (const i of businessIdeas) c[i.status] = (c[i.status] ?? 0) + 1
    return c
  }, [businessIdeas])

  const filtered = useMemo(() => {
    let list = statusFilter === 'all' ? businessIdeas : businessIdeas.filter((i) => i.status === statusFilter)
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          (i.overview ?? '').toLowerCase().includes(q) ||
          i.tags.some((t) => t.toLowerCase().includes(q)),
      )
    }
    return sortBy === 'feasibility'
      ? [...list].sort((a, b) => (b.feasibilityScore ?? -1) - (a.feasibilityScore ?? -1))
      : [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [businessIdeas, statusFilter, searchQuery, sortBy])

  const detail = detailId ? businessIdeas.find((i) => i.id === detailId) ?? null : null

  // Object-permanence: ideas sitting in 'idea'/'parked' status untouched for a
  // while quietly fall out of mind — surface them, red (loopt vast) before
  // yellow (loopt stil), same pattern as CRM's "Opvolgen".
  const staleIdeas = useMemo(() => {
    const rank: Record<string, number> = { red: 0, yellow: 1 }
    return businessIdeas
      .map((i) => ({ idea: i, staleness: ideaStaleness(i, TODAY) }))
      .filter((x) => x.staleness !== 'none')
      .sort((a, b) => rank[a.staleness] - rank[b.staleness])
  }, [businessIdeas])

  return (
    <div className="flex flex-col gap-7 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sunken">
            <Lightbulb className="h-5 w-5 text-ink-soft" />
          </span>
          <h1 className="text-xl font-medium text-ink">Strategie HQ</h1>
        </div>
        <div className="flex gap-2 shrink-0">
          {businessIdeas.length > 1 && (
            <button
              onClick={() => (compareMode ? exitCompareMode() : setCompareMode(true))}
              className={`btn-ghost !py-2 text-sm ${compareMode ? 'bg-line' : ''}`}
            >
              <GitCompare className="h-4 w-4" /> {compareMode ? 'Annuleer' : 'Vergelijken'}
            </button>
          )}
          <button onClick={() => setNewOpen(true)} className="btn-primary !py-2 text-sm">
            <Plus className="h-4 w-4" /> Nieuw idee
          </button>
        </div>
      </div>

      {/* Vergelijk-balk */}
      {compareMode && (
        <div className="card p-3 flex items-center justify-between gap-3 flex-wrap sticky top-0 z-10">
          <span className="text-sm text-muted">
            {compareIds.length === 0 ? 'Kies 2-4 ideeën om te vergelijken' : `${compareIds.length} geselecteerd`}
          </span>
          <button
            onClick={() => setShowCompare(true)}
            disabled={compareIds.length < 2}
            className="btn-primary !py-1.5 text-xs"
          >
            <GitCompare className="h-3.5 w-3.5" /> Vergelijk
          </button>
        </div>
      )}

      {/* Loopt vast — ideeën die een tijd stilliggen */}
      {staleIdeas.length > 0 && (
        <div className="card p-4">
          <SectionTitle hint="Ideeën in 'idee' of 'geparkeerd' die al een tijd niet zijn bijgewerkt.">Loopt vast</SectionTitle>
          <div className="space-y-1.5">
            {staleIdeas.map(({ idea, staleness }) => {
              const m = STALENESS_META[staleness as Exclude<typeof staleness, 'none'>]
              return (
                <button key={idea.id} onClick={() => setDetailId(idea.id)} className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-sunken hover:bg-surface transition-colors text-left">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: m.hex }} />
                  <span className="text-sm font-medium truncate flex-1">{idea.title}</span>
                  <span className="text-[11px] font-medium shrink-0" style={{ color: m.hex }}>{m.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* zoeken + sorteren */}
      {businessIdeas.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-faint pointer-events-none" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Zoek op titel, omschrijving of tag…"
              className="w-full rounded-xl bg-sunken border border-line pl-9 pr-3 py-2 text-sm outline-none focus:border-buurtkaart/50"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'newest' | 'feasibility')}
            className="rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none shrink-0"
            aria-label="Sorteren"
          >
            <option value="newest">Nieuwste eerst</option>
            <option value="feasibility">Hoogste haalbaarheid</option>
          </select>
        </div>
      )}

      {/* status filter */}
      <div className="flex flex-wrap gap-1.5">
        {(['all', 'idea', 'active', 'parked', 'archived'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`chip transition-colors ${statusFilter === s ? 'bg-ink text-canvas' : 'bg-sunken text-muted hover:bg-line'}`}
          >
            {s === 'all' ? 'Alle' : STATUS_LABEL[s]}
            {counts[s] ? <span className="ml-1 opacity-70">{counts[s]}</span> : null}
          </button>
        ))}
      </div>

      {/* list */}
      {filtered.length === 0 ? (
        businessIdeas.length === 0 ? (
          <SetupHint icon={Sparkles} title="Nog geen ideeën vastgelegd" cta="Nieuw idee" onCta={() => setNewOpen(true)}>
            Spreek een idee in of typ het uit — HEYRA werkt het meteen uit tot een volledige strategische analyse
            met haalbaarheid, financiën, risico's en SWOT.
          </SetupHint>
        ) : (
          <Empty>{searchQuery.trim() ? 'Geen ideeën gevonden voor deze zoekopdracht.' : 'Geen ideeën in deze status.'}</Empty>
        )
      ) : (
        <div className="space-y-3">
          {filtered.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              onOpen={() => setDetailId(idea.id)}
              compareMode={compareMode}
              selected={compareIds.includes(idea.id)}
              onToggleCompare={() => toggleCompare(idea.id)}
            />
          ))}
        </div>
      )}

      {newOpen && (
        <NewIdeaModal
          onClose={() => setNewOpen(false)}
          onSubmit={async (input) => {
            const row = await captureBusinessIdea(input)
            setNewOpen(false)
            if (row) setDetailId(row.id)
          }}
        />
      )}

      {detail && (
        <IdeaDetailModal
          idea={detail}
          onClose={() => setDetailId(null)}
          onUpdate={(patch) => updateBusinessIdea(detail.id, patch)}
          onDelete={() => { deleteBusinessIdea(detail.id); setDetailId(null) }}
          onRetry={() => retryIdeaElaboration(detail.id)}
          onToggleMilestone={(idx) => toggleIdeaMilestone(detail.id, idx)}
          onGenerateMvpPlan={() => generateMvpPlan(detail.id)}
          onToggleMvpTask={(phaseIdx, taskIdx) => toggleMvpRoadmapTask(detail.id, phaseIdx, taskIdx)}
          onGenerateCustomerAnalysis={() => generateCustomerAnalysis(detail.id)}
          onConvertToProject={async () => { await convertIdeaToProject(detail.id) }}
          onViewProject={() => {
            if (detail.linkedProjectId) setFocusProjectId(detail.linkedProjectId)
            onNav?.('crm')
          }}
        />
      )}

      {showCompare && (
        <CompareModal
          ideas={businessIdeas.filter((i) => compareIds.includes(i.id))}
          onClose={() => setShowCompare(false)}
        />
      )}
    </div>
  )
}

// ── list card ────────────────────────────────────────────────────────────────

function IdeaCard({
  idea,
  onOpen,
  compareMode,
  selected,
  onToggleCompare,
}: {
  idea: BusinessIdea
  onOpen: () => void
  compareMode?: boolean
  selected?: boolean
  onToggleCompare?: () => void
}) {
  const busy = idea.elaborationStatus === 'pending' || idea.elaborationStatus === 'processing'
  return (
    <button
      onClick={compareMode ? onToggleCompare : onOpen}
      className={`card p-4 w-full text-left flex items-center gap-3.5 transition-colors ${selected ? 'border-buurtkaart bg-buurtkaart/5' : 'hover:border-buurtkaart/40'}`}
    >
      {compareMode && (
        <span className={`h-5 w-5 rounded-md flex items-center justify-center shrink-0 ${selected ? 'bg-buurtkaart text-white' : 'border-[1.5px] border-line text-transparent'}`}>
          <Check className="h-3 w-3" />
        </span>
      )}
      {idea.elaborationStatus === 'ready' ? (
        <Ring
          value={(idea.feasibilityScore ?? 0) / 100}
          size={48}
          stroke={5}
          color={feasibilityStroke(idea.feasibilityScore)}
          label={idea.feasibilityScore ?? '–'}
        />
      ) : (
        <div className="h-12 w-12 rounded-full bg-sunken flex items-center justify-center shrink-0">
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin text-buurtkaart" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-personal-deep" />
          )}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-ink truncate">{idea.title}</div>
        <p className="text-xs text-muted line-clamp-1 mt-0.5">
          {idea.overview ?? idea.rawInput ?? (busy ? 'HEYRA werkt dit idee uit…' : idea.error ?? '')}
        </p>
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          <DomainChip domain={idea.domain} small />
          <span className="chip text-[10px] px-2 py-0 shrink-0" style={{ color: STATUS_HEX[idea.status], background: `${STATUS_HEX[idea.status]}1f` }}>
            {STATUS_LABEL[idea.status]}
          </span>
          <span className="text-[11px] text-faint ml-auto shrink-0">{fmtDate(idea.createdAt)}</span>
        </div>
      </div>
    </button>
  )
}

// ── compare modal: 2-4 ideas side by side ─────────────────────────────────────

function CompareModal({ ideas, onClose }: { ideas: BusinessIdea[]; onClose: () => void }) {
  return (
    <Overlay
      tone="black"
      onClose={onClose}
      className="flex items-end md:items-center justify-center p-0 md:p-4"
      panelClassName="bg-canvas w-full md:max-w-5xl md:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto shadow-xl"
    >
      <div className="sticky top-0 bg-canvas/90 backdrop-blur border-b border-line px-4 py-3 flex items-center gap-2">
        <GitCompare className="h-4 w-4 text-buurtkaart shrink-0" />
        <span className="text-sm font-semibold">Ideeën vergelijken</span>
        <button onClick={onClose} className="ml-auto text-faint hover:text-ink p-1 rounded-lg hover:bg-sunken">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-4 overflow-x-auto">
        <div className="flex gap-3 min-w-min">
          {ideas.map((idea) => (
            <CompareColumn key={idea.id} idea={idea} />
          ))}
        </div>
      </div>
    </Overlay>
  )
}

function topRisk(idea: BusinessIdea) {
  return idea.risks.find((r) => r.impact === 'high') ?? idea.risks[0] ?? null
}
function topOpportunity(idea: BusinessIdea) {
  return idea.opportunities.find((o) => o.potential === 'high') ?? idea.opportunities[0] ?? null
}

function CompareColumn({ idea }: { idea: BusinessIdea }) {
  const risk = topRisk(idea)
  const opportunity = topOpportunity(idea)
  return (
    <div className="w-64 shrink-0 space-y-3">
      <div className="card p-3.5 space-y-2.5">
        <div>
          <div className="font-semibold text-ink break-words">{idea.title}</div>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <DomainChip domain={idea.domain} small />
            <span className="chip text-[10px] px-2 py-0 shrink-0" style={{ color: STATUS_HEX[idea.status], background: `${STATUS_HEX[idea.status]}1f` }}>
              {STATUS_LABEL[idea.status]}
            </span>
          </div>
        </div>

        {idea.elaborationStatus === 'ready' ? (
          <>
            <div className="flex items-center gap-2.5">
              <Ring value={(idea.feasibilityScore ?? 0) / 100} size={40} stroke={4} color={feasibilityStroke(idea.feasibilityScore)} label={idea.feasibilityScore ?? '–'} />
              <div className="text-[11px] text-faint">Haalbaarheid</div>
            </div>

            <CompareRow label="Tijdlijn" value={idea.timeline} />
            <CompareRow label="Investering" value={idea.financials.investmentNeeded !== null ? eur(idea.financials.investmentNeeded) : null} />
            <CompareRow label="Break-even" value={idea.financials.breakEven} />
            <CompareRow label="Grootste risico" value={risk?.risk ?? null} sub={risk ? IMPACT_LABEL[risk.impact] : undefined} />
            <CompareRow label="Grootste kans" value={opportunity?.opportunity ?? null} sub={opportunity ? IMPACT_LABEL[opportunity.potential] : undefined} />
            <CompareRow
              label="Klantanalyse"
              value={idea.customerAnalysisStatus === 'ready' ? `${idea.customerAnalysis?.personas.length ?? 0} persona's` : idea.customerAnalysisStatus ? 'Bezig/mislukt' : 'Nog niet gegenereerd'}
            />
            <CompareRow
              label="MVP-plan"
              value={idea.mvpPlanStatus === 'ready' ? `${idea.mvpPlan?.experiments.length ?? 0} experimenten` : idea.mvpPlanStatus ? 'Bezig/mislukt' : 'Nog niet gegenereerd'}
            />
          </>
        ) : (
          <p className="text-xs text-faint italic">Nog niet uitgewerkt door HEYRA.</p>
        )}
      </div>
    </div>
  )
}

function CompareRow({ label, value, sub }: { label: string; value: string | null; sub?: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">{label}</div>
      <p className="text-xs text-ink-soft leading-snug break-words">
        {value ?? <span className="text-faint italic">—</span>}
        {sub && <span className="text-faint"> · {sub}</span>}
      </p>
    </div>
  )
}

// ── new idea modal (voice or text → HEYRA elaborates) ─────────────────────────

function NewIdeaModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void
  onSubmit: (input: { title: string; source: 'voice' | 'text'; rawInput: string; domain?: Domain }) => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [domain, setDomain] = useState<Domain>('cross')
  const [listening, setListening] = useState(false)
  const [usedVoice, setUsedVoice] = useState(false)
  const [saving, setSaving] = useState(false)
  const recRef = useRef<SpeechRec | null>(null)

  const speechSupported =
    typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)

  function toggleMic() {
    if (!speechSupported) return
    if (listening) {
      recRef.current?.stop()
      return
    }
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const rec: SpeechRec = new Ctor()
    rec.lang = 'nl-NL'
    rec.interimResults = true
    rec.continuous = true
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results).map((r: any) => r[0].transcript).join('')
      setText(transcript)
    }
    rec.onend = () => setListening(false)
    recRef.current = rec
    setUsedVoice(true)
    setListening(true)
    rec.start()
  }

  async function submit() {
    const rawInput = text.trim()
    if (!rawInput || saving) return
    setSaving(true)
    const finalTitle = title.trim() || rawInput.slice(0, 60)
    await onSubmit({ title: finalTitle, source: usedVoice ? 'voice' : 'text', rawInput, domain })
  }

  return (
    <Overlay
      tone="black"
      onClose={onClose}
      className="flex items-end md:items-center justify-center p-0 md:p-4"
      panelClassName="bg-canvas w-full md:max-w-lg md:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto shadow-xl"
    >
      <div className="sticky top-0 bg-canvas/90 backdrop-blur border-b border-line px-4 py-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-buurtkaart shrink-0" />
        <span className="text-sm font-semibold">Nieuw idee</span>
        <button onClick={onClose} className="ml-auto text-faint hover:text-ink p-1 rounded-lg hover:bg-sunken">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-4 space-y-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Korte titel (optioneel — HEYRA verzint er anders zelf één)"
          className="w-full rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none focus:border-buurtkaart/50"
        />

        <div className="relative">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="Vertel je idee — spreek het in of typ het uit. Hoe meer context, hoe scherper de analyse."
            className="w-full rounded-xl bg-sunken border border-line px-3 py-2.5 pr-11 text-sm outline-none focus:border-buurtkaart/50 resize-none"
          />
          {speechSupported && (
            <button
              onClick={toggleMic}
              type="button"
              className={`absolute top-2 right-2 p-1.5 rounded-lg ${listening ? 'bg-cross text-white animate-pulse-ring' : 'bg-canvas text-muted hover:bg-line'}`}
              aria-label={listening ? 'Stop opname' : 'Spraakinvoer'}
            >
              {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}
        </div>

        <select
          value={domain}
          onChange={(e) => setDomain(e.target.value as Domain)}
          className="w-full rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none"
        >
          {(Object.keys(DOMAIN_META) as Domain[]).map((d) => (
            <option key={d} value={d}>{DOMAIN_META[d].label}</option>
          ))}
        </select>
      </div>

      <div className="sticky bottom-0 bg-canvas/90 backdrop-blur border-t border-line px-4 py-3 flex justify-end">
        <button onClick={submit} disabled={!text.trim() || saving} className="btn-primary !py-2 text-sm">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Laat HEYRA uitwerken
        </button>
      </div>
    </Overlay>
  )
}

// ── detail modal: full analysis + edit + delete ───────────────────────────────

type EditableIdea = Pick<
  BusinessIdea,
  'title' | 'overview' | 'domain' | 'tags' | 'status' | 'feasibilityScore' | 'timeline' | 'markdown'
>

function IdeaDetailModal({
  idea,
  onClose,
  onUpdate,
  onDelete,
  onRetry,
  onToggleMilestone,
  onGenerateMvpPlan,
  onToggleMvpTask,
  onGenerateCustomerAnalysis,
  onConvertToProject,
  onViewProject,
}: {
  idea: BusinessIdea
  onClose: () => void
  onUpdate: (patch: Partial<BusinessIdea>) => void
  onDelete: () => void
  onRetry: () => void
  onToggleMilestone: (index: number) => void
  onGenerateMvpPlan: () => void
  onToggleMvpTask: (phaseIndex: number, taskIndex: number) => void
  onGenerateCustomerAnalysis: () => void
  onConvertToProject: () => Promise<void>
  onViewProject: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [showFullDoc, setShowFullDoc] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [converting, setConverting] = useState(false)

  async function handleConvert() {
    setConverting(true)
    await onConvertToProject()
    setConverting(false)
  }
  const [form, setForm] = useState<EditableIdea>(() => ({
    title: idea.title, overview: idea.overview, domain: idea.domain, tags: idea.tags,
    status: idea.status, feasibilityScore: idea.feasibilityScore, timeline: idea.timeline, markdown: idea.markdown,
  }))

  const busy = idea.elaborationStatus === 'pending' || idea.elaborationStatus === 'processing'
  const financeData = useMemo(
    () => idea.financials.revenueProjection.map((r) => ({ name: r.period, omzet: r.amount })),
    [idea.financials.revenueProjection],
  )
  const totalCosts = idea.financials.costs.reduce((sum, c) => sum + c.amount, 0)

  function save() {
    onUpdate({
      ...form,
      tags: typeof form.tags === 'string' ? (form.tags as unknown as string).split(',').map((t) => t.trim()).filter(Boolean) : form.tags,
    })
    setEditing(false)
  }

  return (
    <Overlay
      tone="black"
      onClose={onClose}
      className="flex items-end md:items-center justify-center p-0 md:p-4"
      panelClassName="bg-canvas w-full md:max-w-2xl md:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto shadow-xl"
    >
      <div className="sticky top-0 bg-canvas/90 backdrop-blur border-b border-line px-4 py-3 flex items-center gap-2">
        <DomainChip domain={idea.domain} small />
        <span className="chip text-[10px] px-2 py-0" style={{ color: STATUS_HEX[idea.status], background: `${STATUS_HEX[idea.status]}1f` }}>
          {STATUS_LABEL[idea.status]}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {!editing && (
            <button onClick={() => setEditing(true)} className="text-faint hover:text-ink p-1.5 rounded-lg hover:bg-sunken" title="Bewerken">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          <button onClick={onClose} className="text-faint hover:text-ink p-1.5 rounded-lg hover:bg-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {editing ? (
          <div className="space-y-2.5">
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full rounded-xl bg-sunken border border-line px-3 py-2 text-sm font-semibold outline-none focus:border-buurtkaart/50"
              placeholder="Titel"
            />
            <textarea
              value={form.overview ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, overview: e.target.value }))}
              rows={3}
              placeholder="Overzicht"
              className="w-full rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none focus:border-buurtkaart/50 resize-none"
            />
            <div className="flex flex-wrap gap-2">
              <select
                value={form.domain}
                onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value as Domain }))}
                className="flex-1 rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none"
              >
                {(Object.keys(DOMAIN_META) as Domain[]).map((d) => (
                  <option key={d} value={d}>{DOMAIN_META[d].label}</option>
                ))}
              </select>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as IdeaLifecycleStatus }))}
                className="flex-1 rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none"
              >
                {(Object.keys(STATUS_LABEL) as IdeaLifecycleStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <input
                type="number" min={0} max={100}
                value={form.feasibilityScore ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, feasibilityScore: e.target.value === '' ? null : Number(e.target.value) }))}
                placeholder="Haalbaarheidsscore (0-100)"
                className="flex-1 rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none focus:border-buurtkaart/50"
              />
              <input
                value={form.timeline ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, timeline: e.target.value }))}
                placeholder="Tijdlijn"
                className="flex-1 rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none focus:border-buurtkaart/50"
              />
            </div>
            <input
              value={Array.isArray(form.tags) ? form.tags.join(', ') : form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value as unknown as string[] }))}
              placeholder="Tags, komma-gescheiden"
              className="w-full rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none focus:border-buurtkaart/50"
            />
            <textarea
              value={form.markdown ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, markdown: e.target.value }))}
              rows={8}
              placeholder="Volledig document (markdown)"
              className="w-full rounded-xl bg-sunken border border-line px-3 py-2 text-xs font-mono outline-none focus:border-buurtkaart/50 resize-none"
            />
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditing(false)} className="flex-1 btn-ghost !py-2 text-sm">Annuleer</button>
              <button onClick={save} className="flex-1 btn-primary !py-2 text-sm"><Check className="h-4 w-4" /> Opslaan</button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-bold tracking-tight leading-snug">{idea.title}</h2>

            {idea.elaborationStatus === 'ready' && (
              idea.linkedProjectId ? (
                <button onClick={onViewProject} className="btn-ghost !py-1.5 text-xs self-start">
                  <FolderKanban className="h-3.5 w-3.5" /> Bekijk project in CRM
                </button>
              ) : (
                <button onClick={handleConvert} disabled={converting} className="btn-ghost !py-1.5 text-xs self-start">
                  {converting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderKanban className="h-3.5 w-3.5" />}
                  Zet om naar project
                </button>
              )
            )}

            {idea.elaborationStatus === 'failed' && (
              <div className="rounded-xl bg-personal/10 p-3 text-sm text-personal-deep flex items-start gap-2 flex-wrap">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">Uitwerken mislukt</p>
                  {idea.error && <p className="text-xs mt-0.5 opacity-80 break-words">{idea.error}</p>}
                </div>
                <button onClick={onRetry} className="btn-ghost !py-1 text-xs shrink-0">
                  <RotateCcw className="h-3.5 w-3.5" /> Opnieuw
                </button>
              </div>
            )}

            {idea.elaborationStatus === 'pending' && (
              <div className="rounded-xl bg-sunken border border-line p-3 text-sm text-muted flex items-center justify-between gap-2">
                <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin text-buurtkaart" /> Wacht op HEYRA…</span>
                <button onClick={onRetry} className="btn-ghost !py-1 text-xs shrink-0">Uitwerken</button>
              </div>
            )}

            {idea.elaborationStatus === 'processing' && (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin text-buurtkaart" /> HEYRA werkt dit idee uit tot een volledige analyse…
              </div>
            )}

            {(busy || idea.elaborationStatus === 'failed') && idea.rawInput && (
              <div className="text-sm text-ink-soft leading-relaxed italic">"{idea.rawInput}"</div>
            )}

            {idea.elaborationStatus === 'ready' && (
              <>
                {idea.overview && <p className="text-sm text-ink-soft leading-relaxed">{idea.overview}</p>}

                <div className="flex items-center gap-4 card p-3.5">
                  <Ring value={(idea.feasibilityScore ?? 0) / 100} size={64} stroke={6} color={feasibilityStroke(idea.feasibilityScore)} label={idea.feasibilityScore ?? '–'} sub="/ 100" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-wider text-faint mb-1 flex items-center gap-1"><Target className="h-3 w-3" /> Haalbaarheid</div>
                    {idea.feasibilityReasoning && <p className="text-xs text-muted leading-relaxed">{idea.feasibilityReasoning}</p>}
                    {idea.timeline && <p className="text-[11px] text-faint mt-1.5">Tijdlijn: {idea.timeline}</p>}
                  </div>
                </div>

                {idea.scoreBreakdown && <WeightedScoreCard breakdown={idea.scoreBreakdown} />}

                {idea.milestones.length > 0 && (
                  <div>
                    <SectionLabel icon={TrendingUp}>Mijlpalen</SectionLabel>
                    <div className="space-y-1.5">
                      {idea.milestones.map((m, i) => (
                        <label key={i} className="flex items-center gap-2.5 card p-2.5 cursor-pointer">
                          <input type="checkbox" checked={m.done} onChange={() => onToggleMilestone(i)} className="h-4 w-4 rounded accent-forest shrink-0" />
                          <span className={`text-sm flex-1 min-w-0 break-words ${m.done ? 'line-through text-faint' : 'text-ink-soft'}`}>{m.title}</span>
                          {m.due && <span className="text-[11px] text-faint shrink-0">{m.due}</span>}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {(idea.financials.investmentNeeded !== null || financeData.length > 0 || idea.financials.costs.length > 0) && (
                  <div>
                    <SectionLabel icon={TrendingUp}>Financiën</SectionLabel>
                    <div className="card p-3.5 space-y-3">
                      <div className="flex flex-wrap gap-4 text-sm">
                        {idea.financials.investmentNeeded !== null && (
                          <div><div className="text-[11px] text-faint">Investering nodig</div><div className="font-semibold">{eur(idea.financials.investmentNeeded)}</div></div>
                        )}
                        {totalCosts > 0 && (
                          <div><div className="text-[11px] text-faint">Kosten (totaal)</div><div className="font-semibold">{eur(totalCosts)}</div></div>
                        )}
                        {idea.financials.breakEven && (
                          <div><div className="text-[11px] text-faint">Break-even</div><div className="font-semibold">{idea.financials.breakEven}</div></div>
                        )}
                      </div>
                      {financeData.length > 0 && (
                        <ResponsiveContainer width="100%" height={Math.max(120, financeData.length * 32)}>
                          <BarChart data={financeData} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-line" />
                            <XAxis type="number" tick={AXIS_TICK_10} tickFormatter={(v) => eur(v)} />
                            <YAxis type="category" dataKey="name" width={70} tick={{ fill: '#8c8c8c', fontSize: 11 }} />
                            <Tooltip contentStyle={CHART_TIP} formatter={(v: number) => eur(v)} />
                            <Bar dataKey="omzet" radius={[0, 4, 4, 0]} fill={DOMAIN_HEX[idea.domain]} />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                      {idea.financials.notes && <p className="text-xs text-faint leading-relaxed">{idea.financials.notes}</p>}
                    </div>
                  </div>
                )}

                {idea.risks.length > 0 && (
                  <div>
                    <SectionLabel icon={ShieldAlert}>Risico's</SectionLabel>
                    <div className="space-y-1.5">
                      {idea.risks.map((r, i) => (
                        <div key={i} className="card p-3 text-sm">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <span className="text-ink-soft flex-1 min-w-0 break-words">{r.risk}</span>
                            <span className="chip text-[10px] px-2 py-0 shrink-0" style={{ color: RISK_HEX[r.impact], background: `${RISK_HEX[r.impact]}1f` }}>{IMPACT_LABEL[r.impact]}</span>
                          </div>
                          {r.mitigation && <p className="text-xs text-faint mt-1 break-words">Mitigatie: {r.mitigation}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {idea.opportunities.length > 0 && (
                  <div>
                    <SectionLabel icon={Lightbulb}>Kansen</SectionLabel>
                    <div className="space-y-1.5">
                      {idea.opportunities.map((o, i) => (
                        <div key={i} className="card p-3 text-sm flex items-start justify-between gap-2 flex-wrap">
                          <span className="text-ink-soft flex-1 min-w-0 break-words">{o.opportunity}</span>
                          <span className="chip text-[10px] px-2 py-0 shrink-0" style={{ color: POTENTIAL_HEX[o.potential], background: `${POTENTIAL_HEX[o.potential]}1f` }}>{IMPACT_LABEL[o.potential]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(idea.swot.strengths.length > 0 || idea.swot.weaknesses.length > 0 || idea.swot.opportunities.length > 0 || idea.swot.threats.length > 0) && (
                  <div>
                    <SectionLabel icon={Grid2x2}>SWOT</SectionLabel>
                    <div className="grid grid-cols-2 gap-2">
                      <SwotQuadrant title="Sterktes" items={idea.swot.strengths} hex="#3F7E52" />
                      <SwotQuadrant title="Zwaktes" items={idea.swot.weaknesses} hex="#B94A3F" />
                      <SwotQuadrant title="Kansen" items={idea.swot.opportunities} hex="#60A5FA" />
                      <SwotQuadrant title="Bedreigingen" items={idea.swot.threats} hex="#B98A2E" />
                    </div>
                  </div>
                )}

                <CustomerAnalysisSection idea={idea} onGenerate={onGenerateCustomerAnalysis} />

                <MvpPlanSection idea={idea} onGenerate={onGenerateMvpPlan} onToggleTask={onToggleMvpTask} />

                {idea.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {idea.tags.map((t) => <span key={t} className="chip bg-line text-muted text-[11px]">#{t}</span>)}
                  </div>
                )}

                {idea.markdown && (
                  <div>
                    <button onClick={() => setShowFullDoc((v) => !v)} className="btn-ghost !py-1.5 text-xs w-full justify-center">
                      {showFullDoc ? 'Verberg volledig document' : 'Toon volledig document'}
                    </button>
                    {showFullDoc && <div className="card p-3.5 mt-2"><Markdown text={idea.markdown} /></div>}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {!editing && (
        <div className="sticky bottom-0 bg-canvas/90 backdrop-blur border-t border-line px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
          {idea.elaborationStatus === 'ready' ? (
            <div className="flex gap-1">
              <button onClick={() => downloadIdeaMarkdown(idea)} className="btn-ghost !py-1.5 text-xs" title="Downloaden als Markdown">
                <Download className="h-3.5 w-3.5" /> .md
              </button>
              <button onClick={() => printIdeaAsPdf(idea)} className="btn-ghost !py-1.5 text-xs" title="Exporteren als PDF (via printdialoog)">
                <Printer className="h-3.5 w-3.5" /> PDF
              </button>
            </div>
          ) : <span />}
          <button onClick={() => setConfirmDelete(true)} className="btn-ghost !py-1.5 text-xs text-cross-deep">
            <Trash2 className="h-3.5 w-3.5" /> Verwijderen
          </button>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Idee verwijderen?"
          message={`"${idea.title}" wordt definitief verwijderd, inclusief de opgeslagen analyse.`}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={onDelete}
        />
      )}
    </Overlay>
  )
}

// ── MVP Launch Plan: lean validation before building anything ────────────────
// Low effort is the *good* outcome here (opposite of risk-impact), so the
// color mapping is inverted relative to RISK_HEX.
const EFFORT_HEX: Record<ImpactLevel, string> = { low: '#6ee7b7', medium: '#fcd34d', high: '#fca5a5' }

function MvpPlanSection({
  idea,
  onGenerate,
  onToggleTask,
}: {
  idea: BusinessIdea
  onGenerate: () => void
  onToggleTask: (phaseIndex: number, taskIndex: number) => void
}) {
  const status = idea.mvpPlanStatus
  const busy = status === 'pending' || status === 'processing'

  return (
    <div>
      <SectionLabel icon={Rocket}>MVP Launch Plan</SectionLabel>

      {!status && (
        <div className="card p-3.5 space-y-2.5">
          <p className="text-xs text-muted leading-relaxed">
            Test met minimale moeite en kosten of hier écht vraag naar is voordat je iets bouwt — geen koude
            e-mails die toch niet beantwoord worden, maar concrete, goedkope experimenten met een duidelijk
            signaal.
          </p>
          <button onClick={onGenerate} className="btn-primary !py-2 text-sm w-full justify-center">
            <Rocket className="h-4 w-4" /> Genereer MVP Launch Plan
          </button>
        </div>
      )}

      {busy && (
        <div className="flex items-center gap-2 text-sm text-muted card p-3.5">
          <Loader2 className="h-4 w-4 animate-spin text-buurtkaart" /> HEYRA stelt een validatieplan op…
        </div>
      )}

      {status === 'failed' && (
        <div className="rounded-xl bg-personal/10 p-3 text-sm text-personal-deep flex items-start gap-2 flex-wrap">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium">Opstellen mislukt</p>
            {idea.mvpPlanError && <p className="text-xs mt-0.5 opacity-80 break-words">{idea.mvpPlanError}</p>}
          </div>
          <button onClick={onGenerate} className="btn-ghost !py-1 text-xs shrink-0">
            <RotateCcw className="h-3.5 w-3.5" /> Opnieuw
          </button>
        </div>
      )}

      {status === 'ready' && idea.mvpPlan && (
        <div className="space-y-3">
          <div className="card p-3.5 space-y-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-faint">Hypothese</div>
              <p className="text-sm text-ink-soft leading-relaxed">{idea.mvpPlan.hypothesis}</p>
            </div>
            {idea.mvpPlan.riskiestAssumption && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-faint">Grootste risico-aanname</div>
                <p className="text-sm text-ink-soft leading-relaxed">{idea.mvpPlan.riskiestAssumption}</p>
              </div>
            )}
            {idea.mvpPlan.targetCustomer && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-faint">Eerste doelgroep</div>
                <p className="text-sm text-ink-soft leading-relaxed">{idea.mvpPlan.targetCustomer}</p>
              </div>
            )}
          </div>

          {idea.mvpPlan.emailCaveat && (
            <div className="rounded-xl bg-personal/10 p-3 text-xs text-ink-soft leading-relaxed flex items-start gap-2">
              <Mail className="h-4 w-4 mt-0.5 shrink-0 text-personal-deep" />
              <span>{idea.mvpPlan.emailCaveat}</span>
            </div>
          )}

          {idea.mvpPlan.channels.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-faint">Kanalen</div>
              {idea.mvpPlan.channels.map((c, i) => (
                <div key={i} className="card p-3 text-sm">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <span className="font-medium text-ink-soft flex-1 min-w-0 break-words">{c.name}</span>
                    <span className="chip text-[10px] px-2 py-0 shrink-0 max-w-full whitespace-normal break-words" style={{ color: EFFORT_HEX[c.effort as ImpactLevel] ?? EFFORT_HEX.medium, background: `${EFFORT_HEX[c.effort as ImpactLevel] ?? EFFORT_HEX.medium}1f` }}>
                      {IMPACT_LABEL[c.effort as ImpactLevel] ?? c.effort} · {c.cost}
                    </span>
                  </div>
                  {c.why && <p className="text-xs text-faint mt-1 break-words">{c.why}</p>}
                </div>
              ))}
            </div>
          )}

          {idea.mvpPlan.experiments.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-faint">Experimenten</div>
              {idea.mvpPlan.experiments.map((e, i) => (
                <div key={i} className="card p-3 text-sm space-y-1">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <span className="font-medium text-ink-soft flex-1 min-w-0 break-words">{e.title}</span>
                    <span className="chip text-[10px] px-2 py-0 shrink-0 max-w-full whitespace-normal break-words" style={{ color: EFFORT_HEX[e.effort as ImpactLevel] ?? EFFORT_HEX.medium, background: `${EFFORT_HEX[e.effort as ImpactLevel] ?? EFFORT_HEX.medium}1f` }}>
                      {IMPACT_LABEL[e.effort as ImpactLevel] ?? e.effort} · {e.cost}
                    </span>
                  </div>
                  {e.description && <p className="text-xs text-faint break-words">{e.description}</p>}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-faint">
                    {e.channel && <span className="break-words">Kanaal: {e.channel}</span>}
                    {e.timeframe && <span className="break-words">Duur: {e.timeframe}</span>}
                  </div>
                  {e.successSignal && (
                    <p className="text-xs text-ink-soft break-words"><span className="font-medium">Signaal:</span> {e.successSignal}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {idea.mvpPlan.roadmap.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-faint">Roadmap</div>
              {idea.mvpPlan.roadmap.map((phase, pi) => (
                <div key={pi} className="card p-3 space-y-1.5">
                  <div>
                    <div className="text-sm font-semibold text-ink-soft break-words">{phase.phase}</div>
                    {phase.goal && <p className="text-xs text-faint mt-0.5 break-words">{phase.goal}</p>}
                  </div>
                  <div className="space-y-1">
                    {phase.tasks.map((t, ti) => (
                      <label key={ti} className="flex items-center gap-2.5 py-0.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={t.done}
                          onChange={() => onToggleTask(pi, ti)}
                          className="h-4 w-4 rounded accent-forest shrink-0"
                        />
                        <span className={`text-xs flex-1 min-w-0 break-words ${t.done ? 'line-through text-faint' : 'text-ink-soft'}`}>{t.title}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {idea.mvpPlan.signalsToWatch.length > 0 && (
            <div className="card p-3.5 space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-faint flex items-center gap-1.5">
                <Radar className="h-3 w-3" /> Signalen om bij te houden
              </div>
              <ul className="space-y-0.5">
                {idea.mvpPlan.signalsToWatch.map((s, i) => (
                  <li key={i} className="text-xs text-ink-soft leading-snug break-words">· {s}</li>
                ))}
              </ul>
            </div>
          )}

          <button onClick={onGenerate} className="btn-ghost !py-1.5 text-xs w-full justify-center">
            <RotateCcw className="h-3.5 w-3.5" /> Opnieuw genereren
          </button>
        </div>
      )}
    </div>
  )
}

// ── Klantanalyse & Persona's: wíe precies is de klant ─────────────────────────
// Third, opt-in pipeline (idea-customer-analysis) alongside elaboration and
// the MVP plan — concrete buyer persona's, a competitor scan, positioning
// and a pricing suggestion. Same on-demand contract as MvpPlanSection.

function CustomerAnalysisSection({
  idea,
  onGenerate,
}: {
  idea: BusinessIdea
  onGenerate: () => void
}) {
  const status = idea.customerAnalysisStatus
  const busy = status === 'pending' || status === 'processing'

  return (
    <div>
      <SectionLabel icon={Users2}>Klantanalyse &amp; Persona&apos;s</SectionLabel>

      {!status && (
        <div className="card p-3.5 space-y-2.5">
          <p className="text-xs text-muted leading-relaxed">
            Laat HEYRA uitzoeken wíe precies de klant is — concrete persona&apos;s met hun situatie, doelen en
            twijfels, plus een korte concurrentiescan en een prijsadvies.
          </p>
          <button onClick={onGenerate} className="btn-primary !py-2 text-sm w-full justify-center">
            <Users2 className="h-4 w-4" /> Genereer klantanalyse
          </button>
        </div>
      )}

      {busy && (
        <div className="flex items-center gap-2 text-sm text-muted card p-3.5">
          <Loader2 className="h-4 w-4 animate-spin text-buurtkaart" /> HEYRA analyseert de doelgroep…
        </div>
      )}

      {status === 'failed' && (
        <div className="rounded-xl bg-personal/10 p-3 text-sm text-personal-deep flex items-start gap-2 flex-wrap">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium">Opstellen mislukt</p>
            {idea.customerAnalysisError && <p className="text-xs mt-0.5 opacity-80 break-words">{idea.customerAnalysisError}</p>}
          </div>
          <button onClick={onGenerate} className="btn-ghost !py-1 text-xs shrink-0">
            <RotateCcw className="h-3.5 w-3.5" /> Opnieuw
          </button>
        </div>
      )}

      {status === 'ready' && idea.customerAnalysis && (
        <div className="space-y-3">
          <div className="card p-3.5 space-y-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-faint">Doelgroep</div>
              <p className="text-sm text-ink-soft leading-relaxed break-words">{idea.customerAnalysis.targetMarket}</p>
            </div>
            {idea.customerAnalysis.marketInsight && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-faint">Markttiming</div>
                <p className="text-sm text-ink-soft leading-relaxed break-words">{idea.customerAnalysis.marketInsight}</p>
              </div>
            )}
          </div>

          {idea.customerAnalysis.personas.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-faint">Persona&apos;s</div>
              {idea.customerAnalysis.personas.map((p, i) => (
                <PersonaCard key={i} persona={p} />
              ))}
            </div>
          )}

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-faint mb-1.5 flex items-center gap-1.5">
              <Building2 className="h-3 w-3" /> Concurrentie &amp; alternatieven
            </div>
            {idea.customerAnalysis.competitors.length > 0 ? (
              <div className="space-y-1.5">
                {idea.customerAnalysis.competitors.map((c, i) => (
                  <div key={i} className="card p-3 text-sm space-y-1">
                    <span className="font-medium text-ink-soft break-words">{c.name}</span>
                    {c.description && <p className="text-xs text-faint break-words">{c.description}</p>}
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px]">
                      {c.strength && <span className="text-buurtkaart-deep break-words">Sterk: {c.strength}</span>}
                      {c.weakness && <span className="text-personal-deep break-words">Kans: {c.weakness}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty>Geen directe concurrenten gevonden.</Empty>
            )}
          </div>

          {idea.customerAnalysis.positioning && (
            <div className="card p-3.5 space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-faint flex items-center gap-1.5">
                <Compass className="h-3 w-3" /> Positionering
              </div>
              <p className="text-sm text-ink-soft leading-relaxed break-words">{idea.customerAnalysis.positioning}</p>
            </div>
          )}

          {idea.customerAnalysis.pricingSuggestion && (
            <div className="card p-3.5 space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-faint flex items-center gap-1.5">
                <Euro className="h-3 w-3" /> Prijsadvies
              </div>
              <p className="text-sm text-ink-soft leading-relaxed break-words">{idea.customerAnalysis.pricingSuggestion}</p>
            </div>
          )}

          <button onClick={onGenerate} className="btn-ghost !py-1.5 text-xs w-full justify-center">
            <RotateCcw className="h-3.5 w-3.5" /> Opnieuw genereren
          </button>
        </div>
      )}
    </div>
  )
}

function PersonaCard({ persona }: { persona: Persona }) {
  return (
    <div className="card p-3.5 space-y-2">
      <div>
        <div className="font-semibold text-ink-soft break-words">{persona.name}</div>
        <div className="text-xs text-faint break-words">
          {persona.role}{persona.ageRange ? ` · ${persona.ageRange}` : ''}
        </div>
      </div>

      {persona.quote && (
        <div className="flex items-start gap-1.5 rounded-xl bg-sunken p-2.5">
          <Quote className="h-3.5 w-3.5 text-faint shrink-0 mt-0.5" />
          <p className="text-xs italic text-ink-soft leading-relaxed break-words">{persona.quote}</p>
        </div>
      )}

      <p className="text-xs text-muted leading-relaxed break-words">{persona.situation}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {persona.goals.length > 0 && <PersonaList label="Doelen" items={persona.goals} />}
        {persona.painPoints.length > 0 && <PersonaList label="Frustraties" items={persona.painPoints} />}
        {persona.triggers.length > 0 && <PersonaList label="Triggers" items={persona.triggers} />}
        {persona.objections.length > 0 && <PersonaList label="Bezwaren" items={persona.objections} />}
      </div>

      {persona.whereToFind.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {persona.whereToFind.map((w, i) => (
            <span key={i} className="chip bg-line text-muted text-[11px] gap-1 max-w-full whitespace-normal">
              <MapPinned className="h-3 w-3 shrink-0" /> <span className="break-words">{w}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function PersonaList({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-faint mb-0.5">{label}</div>
      <ul className="space-y-0.5">
        {items.map((it, i) => <li key={i} className="text-xs text-ink-soft leading-snug break-words">· {it}</li>)}
      </ul>
    </div>
  )
}

function SectionLabel({ icon: Icon, children }: { icon: typeof TrendingUp; children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-wider text-faint mb-1.5 flex items-center gap-1.5">
      <Icon className="h-3 w-3" /> {children}
    </div>
  )
}

function SwotQuadrant({ title, items, hex }: { title: string; items: string[]; hex: string }) {
  return (
    <div className="rounded-xl p-3 space-y-1" style={{ background: `${hex}12` }}>
      <div className="text-[11px] font-semibold" style={{ color: hex }}>{title}</div>
      {items.length > 0 ? (
        <ul className="space-y-0.5">
          {items.map((it, i) => <li key={i} className="text-xs text-ink-soft leading-snug break-words">· {it}</li>)}
        </ul>
      ) : (
        <div className="text-xs text-faint italic">geen</div>
      )}
    </div>
  )
}

// ── Aanpasbare wegingsfactoren: een persoonlijke, gewogen score naast de
// AI-score — feasibilityWeights is een globale voorkeur (store), niet per
// idee, dus verandert de weging hier voor alle ideeën met een scoreBreakdown.
const SCORE_DIMENSIONS: { key: keyof ScoreBreakdown; label: string }[] = [
  { key: 'market', label: 'Markt' },
  { key: 'execution', label: 'Uitvoerbaarheid' },
  { key: 'financial', label: 'Financieel' },
  { key: 'risk', label: 'Risico-veiligheid' },
]

function WeightedScoreCard({ breakdown }: { breakdown: ScoreBreakdown }) {
  const weights = useStore((s) => s.feasibilityWeights)
  const setWeights = useStore((s) => s.setFeasibilityWeights)
  const [expanded, setExpanded] = useState(false)

  const totalWeight = weights.market + weights.execution + weights.financial + weights.risk
  const weighted =
    totalWeight > 0
      ? Math.round(
          (breakdown.market * weights.market +
            breakdown.execution * weights.execution +
            breakdown.financial * weights.financial +
            breakdown.risk * weights.risk) /
            totalWeight,
        )
      : null

  return (
    <div className="card p-3.5 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Scale className="h-3.5 w-3.5 text-faint shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wider text-faint">Gewogen score</span>
        </div>
        <button onClick={() => setExpanded((v) => !v)} className="text-faint hover:text-ink p-1 rounded-lg hover:bg-sunken" title="Wegingsfactoren aanpassen">
          <Settings2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-2xl font-bold tabular-nums shrink-0">{weighted ?? '–'}</span>
        <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-faint">
          {SCORE_DIMENSIONS.map((d) => (
            <span key={d.key} className="break-words">{d.label}: {breakdown[d.key]}</span>
          ))}
        </div>
      </div>

      {expanded && (
        <div className="space-y-2 pt-2 border-t border-line">
          <p className="text-[11px] text-faint">Persoonlijke weging — telt mee voor alle ideeën in Strategie HQ.</p>
          {SCORE_DIMENSIONS.map((d) => (
            <div key={d.key} className="flex items-center gap-2">
              <span className="text-xs text-muted w-28 shrink-0">{d.label}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={weights[d.key]}
                onChange={(e) => setWeights({ [d.key]: Number(e.target.value) })}
                className="flex-1 accent-buurtkaart"
              />
              <span className="text-xs text-faint w-7 text-right tabular-nums shrink-0">{weights[d.key]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
