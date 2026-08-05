import { useMemo, useState } from 'react'
import { Empty, SectionTitle } from '../components/ui'
import { Markdown } from '../components/Markdown'
import { eur0, eur } from '../lib/format'
import { fmtDate, TODAY } from '../domains'
import { dueLabel } from '../lib/dates'
import { TX_CATEGORIES } from './categories'
import { realTransactions } from './balance'
import type { FinancePlanItem, FinancePlanAction } from './financeCoach'
import type { Goal, BudgetCap, Transaction, Payment } from '../types'
import { Plus, Target, Trash2, Sparkles, RefreshCw, PiggyBank, AlertCircle, ListChecks, CheckCircle2, Flag, Clock } from 'lucide-react'

export function BudgetTab({
  goals,
  onAddGoal,
  onUpdateGoal,
  onDeleteGoal,
  coach,
  coachLoading,
  coachError,
  onRefreshCoach,
  budgetCaps,
  onUpdateBudgetCap,
  onAddBudgetCap,
  onDeleteBudgetCap,
  transactions,
  payments,
  onMarkPaymentPaid,
  onUpdatePayment,
}: {
  goals: Goal[]
  onAddGoal: (g: Omit<Goal, 'id'>) => void
  onUpdateGoal: (id: string, patch: Partial<Omit<Goal, 'id'>>) => void
  onDeleteGoal: (id: string) => void
  coach: { text: string; generatedAt: string; plan: FinancePlanItem[] } | null
  coachLoading: boolean
  coachError: string | null
  onRefreshCoach: () => void
  budgetCaps: BudgetCap[]
  onUpdateBudgetCap: (id: string, patch: Partial<BudgetCap>) => void
  onAddBudgetCap: (category: string, monthlyMax: number) => void
  onDeleteBudgetCap: (id: string) => void
  transactions: Transaction[]
  payments: Payment[]
  onMarkPaymentPaid: (id: string) => void
  onUpdatePayment: (id: string, patch: Partial<Pick<Payment, 'urgent' | 'note' | 'due'>>) => void
}) {
  const financialGoals = goals.filter((g) => g.metric === 'EUR')
  const [form, setForm] = useState(false)
  const [budgetForm, setBudgetForm] = useState(false)

  const thisMonth = TODAY.slice(0, 7)
  const spentByCategory = useMemo(() => {
    const map = new Map<string, number>()
    realTransactions(transactions)
      .filter((t) => t.date.slice(0, 7) === thisMonth && t.amount < 0)
      .forEach((t) => map.set(t.category, (map.get(t.category) ?? 0) + Math.abs(t.amount)))
    return map
  }, [transactions, thisMonth])

  const paymentById = useMemo(() => new Map(payments.map((p) => [p.id, p])), [payments])
  // A plan item goes stale the moment its payment is paid/removed — filter
  // those out instead of trusting the coach's snapshot from generation time.
  const openPlan = (coach?.plan ?? []).filter((item) => paymentById.get(item.paymentId)?.status === 'open')

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
            <Markdown text={coach.text} />
            <p className="text-xs text-faint mt-2">bijgewerkt {fmtDate(coach.generatedAt.slice(0, 10))}</p>
          </>
        ) : (
          <p className="text-sm text-faint">Nog geen advies — druk op "Ververs advies" voor een korte, concrete kijk op je uitgaven, abonnementen en openstaande betalingen.</p>
        )}
        {coachError && (
          <p className="text-xs text-cross mt-2 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {coachError}
          </p>
        )}
      </div>

      {openPlan.length > 0 && (
        <div className="space-y-3">
          <SectionTitle><span className="flex items-center gap-2"><ListChecks className="h-4 w-4 text-prjct" /> Plan</span></SectionTitle>
          <div className="space-y-2">
            {openPlan.map((item) => {
              const p = paymentById.get(item.paymentId)
              if (!p) return null
              return (
                <PlanItemRow
                  key={item.paymentId}
                  item={item}
                  payment={p}
                  onMarkPaid={() => onMarkPaymentPaid(p.id)}
                  onSetUrgent={(urgent) => onUpdatePayment(p.id, { urgent })}
                />
              )
            })}
          </div>
        </div>
      )}

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

      <div className="flex items-center justify-between gap-3">
        <SectionTitle><span className="flex items-center gap-2"><PiggyBank className="h-4 w-4 text-prjct" /> Budgetten</span></SectionTitle>
        <button className="btn-primary !py-1.5 shrink-0" onClick={() => setBudgetForm((f) => !f)}>
          <Plus className="h-4 w-4" /> Nieuw
        </button>
      </div>

      {budgetForm && (
        <NewBudgetCapForm
          existing={budgetCaps.map((b) => b.category)}
          onSubmit={(category, max) => { onAddBudgetCap(category, max); setBudgetForm(false) }}
          onCancel={() => setBudgetForm(false)}
        />
      )}

      {budgetCaps.length === 0 ? (
        <Empty>Nog geen budgetplafond. Stel er hier zelf een in, of hij verschijnt automatisch zodra je een budgetadvies (Geheugen → Inferenties) bevestigt.</Empty>
      ) : (
        <div className="space-y-3">
          {budgetCaps.map((b) => (
            <BudgetCapRow
              key={b.id}
              cap={b}
              spent={spentByCategory.get(b.category) ?? 0}
              onUpdate={(patch) => onUpdateBudgetCap(b.id, patch)}
              onDelete={() => onDeleteBudgetCap(b.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const PLAN_ACTION_META: Record<FinancePlanAction, { label: string; className: string }> = {
  pay_now: { label: 'Nu betalen', className: 'bg-cross/15 text-cross' },
  wait: { label: 'Kan wachten', className: 'bg-line text-muted' },
  ask_extension: { label: 'Uitstel vragen', className: 'bg-personal/15 text-personal-deep' },
  partial: { label: 'Deels betalen', className: 'bg-personal/15 text-personal-deep' },
  move_money: { label: 'Geld overboeken', className: 'bg-buurtkaart/15 text-buurtkaart-deep' },
  follow_up: { label: 'Opvolgen bij klant', className: 'bg-prjct/15 text-prjct' },
}

function PlanItemRow({
  item,
  payment,
  onMarkPaid,
  onSetUrgent,
}: {
  item: FinancePlanItem
  payment: Payment
  onMarkPaid: () => void
  onSetUrgent: (urgent: boolean) => void
}) {
  const meta = PLAN_ACTION_META[item.action]
  const due = dueLabel(payment.due, { prefix: 'vervalt ' })
  const showResolveButton = item.action === 'pay_now' || item.action === 'follow_up'

  return (
    <div className="card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink truncate">{payment.payee}</div>
          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
            <span className={`chip !py-0.5 !px-1.5 ${meta.className}`}>{meta.label}</span>
            <span className={`text-xs ${due.overdue ? 'text-cross font-medium' : 'text-faint'}`}>{due.label}</span>
          </div>
          <p className="text-xs text-faint mt-1">{item.reasoning}</p>
        </div>
        <span className={`text-sm font-medium tabular-nums shrink-0 ${payment.direction === 'incoming' ? 'text-buurtkaart-deep' : 'text-ink'}`}>
          {payment.direction === 'incoming' ? '+' : '-'}{eur(payment.amount)}
        </span>
      </div>
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {showResolveButton && (
          <button onClick={onMarkPaid} className="btn-ghost !py-1 !text-xs">
            <CheckCircle2 className="h-3.5 w-3.5" /> {payment.direction === 'incoming' ? 'Ontvangen' : 'Betaald'}
          </button>
        )}
        <button onClick={() => onSetUrgent(true)} className="btn-ghost !py-1 !text-xs" title="Markeer als urgent">
          <Flag className="h-3.5 w-3.5" /> Urgent
        </button>
        <button onClick={() => onSetUrgent(false)} className="btn-ghost !py-1 !text-xs" title="Markeer als 'kan wachten'">
          <Clock className="h-3.5 w-3.5" /> Kan wachten
        </button>
      </div>
    </div>
  )
}

function BudgetCapRow({
  cap,
  spent,
  onUpdate,
  onDelete,
}: {
  cap: BudgetCap
  spent: number
  onUpdate: (patch: Partial<BudgetCap>) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [max, setMax] = useState(String(cap.monthlyMax))

  const save = () => {
    const val = parseFloat(max.replace(',', '.'))
    if (!isNaN(val)) onUpdate({ monthlyMax: val })
    setEditing(false)
  }

  const pct = cap.monthlyMax > 0 ? Math.min(1, spent / cap.monthlyMax) : 0
  const over = cap.monthlyMax > 0 && spent > cap.monthlyMax

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink truncate">{cap.category}</div>
          <div className="text-xs text-faint">{cap.active ? 'actief' : 'gepauzeerd'}{cap.sourceRuleId ? ' — automatisch voorgesteld' : ''}</div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {editing ? (
            <input
              value={max}
              onChange={(e) => setMax(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              autoFocus
              inputMode="decimal"
              className="w-24 rounded-lg bg-sunken border border-line px-2 py-1 text-sm outline-none"
            />
          ) : (
            <button onClick={() => setEditing(true)} className="text-sm font-semibold tabular-nums hover:underline">
              {eur0(cap.monthlyMax)}<span className="text-xs text-faint font-normal"> /mnd</span>
            </button>
          )}
          <button
            onClick={() => onUpdate({ active: !cap.active })}
            className={`text-xs px-2 py-1 rounded-full ${cap.active ? 'bg-prjct/15 text-prjct' : 'bg-line text-muted'}`}
          >
            {cap.active ? 'aan' : 'uit'}
          </button>
          <button onClick={onDelete} className="text-faint hover:text-cross shrink-0 p-1" aria-label="Verwijder budgetplafond">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {cap.active && (
        <>
          <div className="h-1.5 w-full rounded-full bg-line overflow-hidden mt-3">
            <div className={`h-full rounded-full ${over ? 'bg-cross' : 'bg-prjct'}`} style={{ width: `${pct * 100}%` }} />
          </div>
          <div className="flex items-center justify-between gap-3 mt-1.5">
            <span className={`text-xs ${over ? 'text-cross font-medium' : 'text-faint'}`}>
              {eur0(spent)} uitgegeven deze maand{over ? ` — ${eur0(spent - cap.monthlyMax)} over budget` : ''}
            </span>
            {!over && <span className="text-xs text-faint">nog {eur0(cap.monthlyMax - spent)}</span>}
          </div>
        </>
      )}
    </div>
  )
}

function NewBudgetCapForm({
  existing,
  onSubmit,
  onCancel,
}: {
  existing: string[]
  onSubmit: (category: string, monthlyMax: number) => void
  onCancel: () => void
}) {
  const available = TX_CATEGORIES.filter((c) => c !== 'Internal transfer' && c !== 'Client income' && !existing.includes(c))
  const [category, setCategory] = useState<string>(available[0] ?? '')
  const [max, setMax] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const val = parseFloat(max.replace(',', '.'))
    if (!category || isNaN(val) || val <= 0) return
    onSubmit(category, val)
  }

  return (
    <form onSubmit={submit} className="card p-4 space-y-3">
      <SectionTitle>Nieuw budgetplafond</SectionTitle>
      <div className="flex flex-wrap gap-2">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="flex-[2_1_160px] rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none">
          {available.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input value={max} onChange={(e) => setMax(e.target.value)} placeholder="Maximum per maand" required inputMode="decimal" className="flex-[1_1_140px] rounded-xl bg-sunken border border-line px-3 py-2 text-sm outline-none focus:border-prjct/60" />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-ghost !py-1.5">Annuleer</button>
        <button type="submit" className="btn-primary !py-1.5"><Plus className="h-4 w-4" /> Toevoegen</button>
      </div>
    </form>
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
