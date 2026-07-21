import { useState } from 'react'
import { Empty, SectionTitle } from '../components/ui'
import { eur0, eur } from '../lib/format'
import { fmtDate } from '../domains'
import type { Goal } from '../types'
import { Plus, Target, Trash2, Sparkles, RefreshCw } from 'lucide-react'

export function BudgetTab({
  goals,
  onAddGoal,
  onUpdateGoal,
  onDeleteGoal,
  coach,
  coachLoading,
  onRefreshCoach,
}: {
  goals: Goal[]
  onAddGoal: (g: Omit<Goal, 'id'>) => void
  onUpdateGoal: (id: string, patch: Partial<Omit<Goal, 'id'>>) => void
  onDeleteGoal: (id: string) => void
  coach: { text: string; generatedAt: string } | null
  coachLoading: boolean
  onRefreshCoach: () => void
}) {
  const financialGoals = goals.filter((g) => g.metric === 'EUR')
  const [form, setForm] = useState(false)

  return (
    <div className="space-y-6">
      <div className="card p-4">
        <div className="flex items-center justify-between gap-3 mb-1">
          <SectionTitle><span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-prjct" /> Financieel coach</span></SectionTitle>
          <button onClick={onRefreshCoach} disabled={coachLoading} className="btn-ghost !py-1.5 shrink-0">
            <RefreshCw className={`h-4 w-4 ${coachLoading ? 'animate-spin' : ''}`} /> {coachLoading ? 'Bezig…' : 'Ververs advies'}
          </button>
        </div>
        {coach ? (
          <>
            <p className="text-sm text-ink leading-relaxed whitespace-pre-line">{coach.text}</p>
            <p className="text-xs text-faint mt-2">bijgewerkt {fmtDate(coach.generatedAt.slice(0, 10))}</p>
          </>
        ) : (
          <p className="text-sm text-faint">Nog geen advies — druk op "Ververs advies" voor een korte, concrete kijk op je uitgaven, abonnementen en openstaande betalingen.</p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <SectionTitle><span className="flex items-center gap-2"><Target className="h-4 w-4 text-prjct" /> Doelen</span></SectionTitle>
        <button className="btn-primary !py-1.5 shrink-0" onClick={() => setForm((f) => !f)}>
          <Plus className="h-4 w-4" /> Nieuw
        </button>
      </div>

      {form && (
        <NewGoalForm
          onSubmit={(g) => { onAddGoal(g); setForm(false) }}
          onCancel={() => setForm(false)}
        />
      )}

      {financialGoals.length === 0 ? (
        <Empty>Nog geen spaardoel. Stel er een in — bv. een buffer of een bedrag opzij voor iets specifieks.</Empty>
      ) : (
        <div className="space-y-3">
          {financialGoals.map((g) => (
            <GoalRow key={g.id} goal={g} onUpdate={(patch) => onUpdateGoal(g.id, patch)} onDelete={() => onDeleteGoal(g.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

function GoalRow({
  goal,
  onUpdate,
  onDelete,
}: {
  goal: Goal
  onUpdate: (patch: Partial<Omit<Goal, 'id'>>) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [current, setCurrent] = useState(String(goal.current))
  const pct = goal.target > 0 ? Math.min(1, goal.current / goal.target) : 0

  const save = () => {
    const val = parseFloat(current.replace(',', '.'))
    if (!isNaN(val)) onUpdate({ current: val })
    setEditing(false)
  }

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink truncate">{goal.title}</div>
          <div className="text-xs text-faint">{goal.deadline ? `streefdatum ${fmtDate(goal.deadline)}` : 'geen streefdatum'}</div>
        </div>
        <button onClick={onDelete} className="text-faint hover:text-cross shrink-0 p-1" aria-label="Verwijder doel">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="h-1.5 w-full rounded-full bg-line overflow-hidden mt-3">
        <div className="h-full rounded-full bg-prjct" style={{ width: `${pct * 100}%` }} />
      </div>
      <div className="flex items-center justify-between gap-3 mt-2">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              autoFocus
              inputMode="decimal"
              className="w-24 rounded-lg bg-sunken border border-line px-2 py-1 text-sm outline-none"
            />
            <span className="text-xs text-faint">van {eur0(goal.target)}</span>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="text-sm font-semibold tabular-nums hover:underline">
            {eur(goal.current)} <span className="text-xs text-faint font-normal">van {eur0(goal.target)}</span>
          </button>
        )}
        <span className="text-xs text-faint">nog {eur0(Math.max(0, goal.target - goal.current))}</span>
      </div>
    </div>
  )
}

function NewGoalForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (g: Omit<Goal, 'id'>) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState('')
  const [deadline, setDeadline] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const targetNum = parseFloat(target.replace(',', '.'))
    if (!title.trim() || isNaN(targetNum)) return
    onSubmit({ title: title.trim(), metric: 'EUR', target: targetNum, current: 0, deadline, domain: 'personal' })
  }

  return (
    <form onSubmit={submit} className="card p-4 space-y-3">
      <SectionTitle>Nieuw doel</SectionTitle>
      <div className="flex flex-wrap gap-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titel (bv. Buffer 3 maanden)" required className="flex-[2_1_180px] rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none focus:border-prjct/60" />
        <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Streefbedrag" required inputMode="decimal" className="flex-[1_1_120px] rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none focus:border-prjct/60" />
        <input value={deadline} onChange={(e) => setDeadline(e.target.value)} type="date" className="flex-[1_1_140px] rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none" />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-ghost !py-1.5">Annuleer</button>
        <button type="submit" className="btn-primary !py-1.5"><Plus className="h-4 w-4" /> Toevoegen</button>
      </div>
    </form>
  )
}
