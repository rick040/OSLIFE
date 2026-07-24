import { useMemo, useRef, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  Plus, Mic, MicOff, Loader2, AlertTriangle, RotateCcw, Trash2, X, Pencil, Check,
  Sparkles, TrendingUp, Target, ShieldAlert, Lightbulb, Grid2x2,
} from 'lucide-react'
import type { View } from '../nav'
import type { BusinessIdea, IdeaLifecycleStatus, ImpactLevel, Domain } from '../types'
import { useStore } from '../store'
import { DOMAIN_META, DOMAIN_HEX, fmtDate } from '../domains'
import { eur0 as eur } from '../lib/format'
import { DomainChip, Ring, Overlay, ConfirmDialog, Empty, SetupHint } from '../components/ui'
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

export default function StrategieHQ(_props: { onNav?: (v: View) => void } = {}) {
  const businessIdeas = useStore((s) => s.businessIdeas)
  const captureBusinessIdea = useStore((s) => s.captureBusinessIdea)
  const updateBusinessIdea = useStore((s) => s.updateBusinessIdea)
  const deleteBusinessIdea = useStore((s) => s.deleteBusinessIdea)
  const retryIdeaElaboration = useStore((s) => s.retryIdeaElaboration)
  const toggleIdeaMilestone = useStore((s) => s.toggleIdeaMilestone)

  const [statusFilter, setStatusFilter] = useState<IdeaLifecycleStatus | 'all'>('all')
  const [newOpen, setNewOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: businessIdeas.length }
    for (const i of businessIdeas) c[i.status] = (c[i.status] ?? 0) + 1
    return c
  }, [businessIdeas])

  const filtered = useMemo(
    () => (statusFilter === 'all' ? businessIdeas : businessIdeas.filter((i) => i.status === statusFilter)),
    [businessIdeas, statusFilter],
  )

  const detail = detailId ? businessIdeas.find((i) => i.id === detailId) ?? null : null

  return (
    <div className="flex flex-col gap-7 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sunken">
            <Lightbulb className="h-5 w-5 text-ink-soft" />
          </span>
          <h1 className="text-xl font-medium text-ink">Strategie HQ</h1>
        </div>
        <button onClick={() => setNewOpen(true)} className="btn-primary !py-2 text-sm shrink-0">
          <Plus className="h-4 w-4" /> Nieuw idee
        </button>
      </div>

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
          <Empty>Geen ideeën in deze status.</Empty>
        )
      ) : (
        <div className="space-y-3">
          {filtered.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} onOpen={() => setDetailId(idea.id)} />
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
        />
      )}
    </div>
  )
}

// ── list card ────────────────────────────────────────────────────────────────

function IdeaCard({ idea, onOpen }: { idea: BusinessIdea; onOpen: () => void }) {
  const busy = idea.elaborationStatus === 'pending' || idea.elaborationStatus === 'processing'
  return (
    <button onClick={onOpen} className="card p-4 w-full text-left flex items-center gap-3.5 hover:border-buurtkaart/40 transition-colors">
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
        <div className="flex items-center gap-1.5 mt-1.5">
          <DomainChip domain={idea.domain} small />
          <span className="chip text-[10px] px-2 py-0" style={{ color: STATUS_HEX[idea.status], background: `${STATUS_HEX[idea.status]}1f` }}>
            {STATUS_LABEL[idea.status]}
          </span>
          <span className="text-[11px] text-faint ml-auto shrink-0">{fmtDate(idea.createdAt)}</span>
        </div>
      </div>
    </button>
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
}: {
  idea: BusinessIdea
  onClose: () => void
  onUpdate: (patch: Partial<BusinessIdea>) => void
  onDelete: () => void
  onRetry: () => void
  onToggleMilestone: (index: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [showFullDoc, setShowFullDoc] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
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

            {idea.elaborationStatus === 'failed' && (
              <div className="rounded-xl bg-personal/10 p-3 text-sm text-personal-deep flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="font-medium">Uitwerken mislukt</p>
                  {idea.error && <p className="text-xs mt-0.5 opacity-80">{idea.error}</p>}
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

                {idea.milestones.length > 0 && (
                  <div>
                    <SectionLabel icon={TrendingUp}>Mijlpalen</SectionLabel>
                    <div className="space-y-1.5">
                      {idea.milestones.map((m, i) => (
                        <label key={i} className="flex items-center gap-2.5 card p-2.5 cursor-pointer">
                          <input type="checkbox" checked={m.done} onChange={() => onToggleMilestone(i)} className="h-4 w-4 rounded accent-forest shrink-0" />
                          <span className={`text-sm flex-1 ${m.done ? 'line-through text-faint' : 'text-ink-soft'}`}>{m.title}</span>
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
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-ink-soft flex-1">{r.risk}</span>
                            <span className="chip text-[10px] px-2 py-0 shrink-0" style={{ color: RISK_HEX[r.impact], background: `${RISK_HEX[r.impact]}1f` }}>{IMPACT_LABEL[r.impact]}</span>
                          </div>
                          {r.mitigation && <p className="text-xs text-faint mt-1">Mitigatie: {r.mitigation}</p>}
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
                        <div key={i} className="card p-3 text-sm flex items-start justify-between gap-2">
                          <span className="text-ink-soft flex-1">{o.opportunity}</span>
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
        <div className="sticky bottom-0 bg-canvas/90 backdrop-blur border-t border-line px-4 py-3 flex justify-end">
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
          {items.map((it, i) => <li key={i} className="text-xs text-ink-soft leading-snug">· {it}</li>)}
        </ul>
      ) : (
        <div className="text-xs text-faint italic">geen</div>
      )}
    </div>
  )
}
