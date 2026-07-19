import { useState } from 'react'
import { useStore } from '../store'
import { TODAY, fmtDate, daysBetween, DOMAIN_META } from '../domains'
import { DomainChip, Empty, ConfirmDialog } from '../components/ui'
import type { Domain, Goal, GoalProposal } from '../types'
import {
  Target,
  CheckCircle2,
  Circle,
  Flag,
  Plus,
  Sparkles,
  X,
  Pencil,
  Trash2,
  Check,
} from 'lucide-react'
import { eur0 } from '../lib/format'

const DOMAINS: Domain[] = ['parkingyou', 'prjct', 'buurtkaart', 'personal', 'cross']

function fmtValue(n: number, metric: string) {
  if (metric === 'EUR') return eur0(n)
  if (metric === 'steps') return `${n.toLocaleString('nl-NL')}`
  return `${n.toLocaleString('nl-NL')}`
}

const inputCls =
  'rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none focus:border-prjct/60'

interface GoalDraft {
  title: string
  domain: Domain
  metric: string
  target: string
  current: string
  deadline: string
}

function emptyDraft(): GoalDraft {
  return { title: '', domain: 'prjct', metric: 'EUR', target: '', current: '0', deadline: '' }
}

function GoalForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: GoalDraft
  submitLabel: string
  onSubmit: (g: Omit<Goal, 'id'>) => void
  onCancel: () => void
}) {
  const [d, setD] = useState<GoalDraft>(initial)
  const set = (patch: Partial<GoalDraft>) => setD((x) => ({ ...x, ...patch }))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const target = parseFloat(d.target)
    if (!d.title.trim() || !Number.isFinite(target) || target <= 0) return
    const current = Number.isFinite(parseFloat(d.current)) ? Math.max(0, parseFloat(d.current)) : 0
    onSubmit({
      title: d.title.trim(),
      domain: d.domain,
      metric: d.metric.trim() || 'stuks',
      target,
      current: Math.min(current, target),
      deadline: d.deadline || TODAY,
    })
  }

  return (
    <form onSubmit={submit} className="card p-4 space-y-3">
      <input
        autoFocus
        value={d.title}
        onChange={(e) => set({ title: e.target.value })}
        placeholder="Doel (bv. €50.000 omzet uit PRJCT)"
        className={`${inputCls} w-full`}
      />
      <div className="flex flex-wrap gap-2">
        <select value={d.domain} onChange={(e) => set({ domain: e.target.value as Domain })} className={inputCls}>
          {DOMAINS.map((dm) => (
            <option key={dm} value={dm}>
              {DOMAIN_META[dm].label}
            </option>
          ))}
        </select>
        <input
          value={d.metric}
          onChange={(e) => set({ metric: e.target.value })}
          placeholder="eenheid (EUR, klanten…)"
          className={`${inputCls} w-36`}
        />
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <label className="text-xs text-faint">
          nu
          <input
            type="number"
            value={d.current}
            onChange={(e) => set({ current: e.target.value })}
            className={`${inputCls} w-28 ml-2`}
          />
        </label>
        <label className="text-xs text-faint">
          doel
          <input
            type="number"
            value={d.target}
            onChange={(e) => set({ target: e.target.value })}
            className={`${inputCls} w-28 ml-2`}
          />
        </label>
        <label className="text-xs text-faint">
          deadline
          <input
            type="date"
            value={d.deadline}
            onChange={(e) => set({ deadline: e.target.value })}
            className={`${inputCls} ml-2`}
          />
        </label>
      </div>
      <div className="flex gap-2">
        <button type="submit" className="btn-primary !py-1.5">
          <Check className="h-4 w-4" /> {submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost !py-1.5">
          Annuleer
        </button>
      </div>
    </form>
  )
}

function ProposalCard({
  p,
  onAccept,
  onDismiss,
}: {
  p: GoalProposal
  onAccept: () => void
  onDismiss: () => void
}) {
  return (
    <div className="card p-4 border-cross/40 bg-cross/5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-medium">{p.title}</h3>
            <DomainChip domain={p.domain} small />
          </div>
          <p className="text-xs text-faint mt-0.5">
            doel {fmtValue(p.target, p.metric)} · deadline {fmtDate(p.deadline)}
          </p>
          {p.rationale && <p className="text-sm text-ink-soft mt-2">{p.rationale}</p>}
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={onAccept} className="btn-primary !py-1 !px-3 text-xs">
          <Plus className="h-3.5 w-3.5" /> Toevoegen
        </button>
        <button onClick={onDismiss} className="btn-ghost !py-1 !px-3 text-xs">
          <X className="h-3.5 w-3.5" /> Negeren
        </button>
      </div>
    </div>
  )
}

export default function NorthStar() {
  const {
    goals,
    milestones,
    toggleMilestone,
    addGoal,
    updateGoal,
    deleteGoal,
    addGoalMilestone,
    deleteGoalMilestone,
    goalProposals,
    proposingGoals,
    proposeGoals,
    acceptGoalProposal,
    dismissGoalProposal,
    lastGoalProposalError,
  } = useStore()

  const [adding, setAdding] = useState(false)
  // Tracks "did we just try" so a genuinely empty (not-enough-signal) result
  // can say so instead of the spinner just stopping with no explanation.
  const [proposalAttempted, setProposalAttempted] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Goal | null>(null)
  const [msDraft, setMsDraft] = useState<{ goalId: string; title: string } | null>(null)

  const totalMs = milestones.length
  const doneMs = milestones.filter((m) => m.done).length

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Target className="h-5 w-5 text-prjct" /> North Star
          </h1>
          <p className="text-sm text-muted mt-1 max-w-xl">
            Je leven op hoog niveau: de doelen die ertoe doen en de mijlpalen ernaartoe.
            {totalMs > 0 && ` ${doneMs}/${totalMs} mijlpalen gehaald.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-ghost !py-1.5"
            onClick={async () => {
              setProposalAttempted(false)
              await proposeGoals()
              setProposalAttempted(true)
            }}
            disabled={proposingGoals}
          >
            {proposingGoals ? (
              <span className="h-4 w-4 rounded-full border-2 border-cross border-t-transparent animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 text-cross" />
            )}
            {proposingGoals ? 'Denkt na…' : 'HEYRA-voorstellen'}
          </button>
          <button className="btn-primary !py-1.5" onClick={() => setAdding((a) => !a)}>
            <Plus className="h-4 w-4" /> Nieuw doel
          </button>
        </div>
      </div>

      {adding && (
        <GoalForm
          initial={emptyDraft()}
          submitLabel="Doel toevoegen"
          onSubmit={(g) => {
            addGoal(g)
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {lastGoalProposalError && !proposingGoals && (
        <div className="card p-3 text-sm text-orange-700 bg-orange-500/10 border-orange-500/30">{lastGoalProposalError}</div>
      )}
      {!lastGoalProposalError && proposalAttempted && !proposingGoals && goalProposals.length === 0 && (
        <div className="card p-3 text-sm text-muted bg-sunken">
          Nog niet genoeg signaal voor een goed voorstel — leg een paar dingen vast (projecten, gewoontes, patronen) en
          probeer het later opnieuw.
        </div>
      )}

      {/* HEYRA-proposed goals */}
      {goalProposals.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-cross">
            <Sparkles className="h-3.5 w-3.5" /> Voorgesteld door HEYRA
          </div>
          {goalProposals.map((p) => (
            <ProposalCard
              key={p.id}
              p={p}
              onAccept={() => acceptGoalProposal(p.id)}
              onDismiss={() => dismissGoalProposal(p.id)}
            />
          ))}
        </div>
      )}

      {goals.length === 0 && !adding ? (
        <Empty>Nog geen doelen. Tik op "Nieuw doel" of laat HEYRA er een paar voorstellen.</Empty>
      ) : (
        <div className="space-y-4">
          {goals.map((g) => {
            if (editing === g.id) {
              return (
                <GoalForm
                  key={g.id}
                  initial={{
                    title: g.title,
                    domain: g.domain,
                    metric: g.metric,
                    target: String(g.target),
                    current: String(g.current),
                    deadline: g.deadline || '',
                  }}
                  submitLabel="Opslaan"
                  onSubmit={(patch) => {
                    updateGoal(g.id, patch)
                    setEditing(null)
                  }}
                  onCancel={() => setEditing(null)}
                />
              )
            }

            const pct = g.target > 0 ? Math.min(1, g.current / g.target) : 0
            const days = g.deadline ? daysBetween(TODAY, g.deadline) : null
            const ms = milestones.filter((m) => m.goalId === g.id)

            return (
              <div key={g.id} className="card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-medium">{g.title}</h2>
                      <DomainChip domain={g.domain} small />
                    </div>
                    <p className="text-xs text-faint mt-0.5">
                      deadline {fmtDate(g.deadline)}
                      {days !== null && ` · ${days > 0 ? `nog ${days} dagen` : days === 0 ? 'vandaag' : 'verlopen'}`}
                    </p>
                  </div>
                  <div className="flex items-start gap-2 shrink-0">
                    <div className="text-right">
                      <div className="text-xl font-semibold">{fmtValue(g.current, g.metric)}</div>
                      <div className="text-xs text-faint">van {fmtValue(g.target, g.metric)}</div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button onClick={() => setEditing(g.id)} className="text-faint hover:text-ink p-1" aria-label="Bewerk doel">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setConfirmDelete(g)} className="text-faint hover:text-red-500 p-1" aria-label="Verwijder doel">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="h-2.5 w-full rounded-full bg-line overflow-hidden mt-3">
                  <div className="h-full rounded-full bg-prjct transition-all duration-700" style={{ width: `${pct * 100}%` }} />
                </div>
                <div className="text-xs text-muted mt-1">{Math.round(pct * 100)}%</div>

                {/* milestones */}
                <div className="mt-4 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-faint">
                      <Flag className="h-3 w-3" /> mijlpalen
                    </div>
                    <button
                      onClick={() => setMsDraft({ goalId: g.id, title: '' })}
                      className="text-[11px] text-prjct hover:underline flex items-center gap-0.5"
                    >
                      <Plus className="h-3 w-3" /> mijlpaal
                    </button>
                  </div>

                  {ms.map((m) => (
                    <div
                      key={m.id}
                      className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-sunken transition-colors group"
                    >
                      <button onClick={() => toggleMilestone(m.id)} className="flex items-center gap-2.5 flex-1 text-left">
                        {m.done ? (
                          <CheckCircle2 className="h-4 w-4 text-buurtkaart shrink-0" />
                        ) : (
                          <Circle className="h-4 w-4 text-faint shrink-0" />
                        )}
                        <span className={`text-sm flex-1 ${m.done ? 'text-faint line-through' : 'text-ink'}`}>{m.title}</span>
                        {m.due && <span className="text-[11px] text-faint shrink-0">{fmtDate(m.due)}</span>}
                      </button>
                      <button
                        onClick={() => deleteGoalMilestone(m.id)}
                        className="text-faint hover:text-red-500 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Verwijder mijlpaal"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}

                  {msDraft?.goalId === g.id && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        addGoalMilestone(g.id, msDraft.title)
                        setMsDraft(null)
                      }}
                      className="flex gap-2 items-center pt-1"
                    >
                      <input
                        autoFocus
                        value={msDraft.title}
                        onChange={(e) => setMsDraft({ goalId: g.id, title: e.target.value })}
                        placeholder="Mijlpaal…"
                        className={`${inputCls} flex-1`}
                      />
                      <button type="submit" className="btn-primary !py-1.5 !px-3 text-xs">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => setMsDraft(null)} className="btn-ghost !py-1.5 !px-3 text-xs">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  )}

                  {ms.length === 0 && msDraft?.goalId !== g.id && (
                    <p className="text-[11px] text-faint italic pl-1">Nog geen mijlpalen.</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={`Doel "${confirmDelete.title}" verwijderen?`}
          message="De bijbehorende mijlpalen worden ook verwijderd."
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            deleteGoal(confirmDelete.id)
            setConfirmDelete(null)
          }}
        />
      )}
    </div>
  )
}
