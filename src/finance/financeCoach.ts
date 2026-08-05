// ── HEYRA · financial coach persona ──────────────────────────────────────────
// Same assistant, different hat: askBrain() gets a coach-flavoured system
// prompt plus a grounded facts block built entirely from real store numbers —
// same "never invent a euro figure" rule as heyra/agents/financeAgent.ts.
// This is a plain helper (not a chat Agent) since it's triggered from the
// Budget tab's "ververs advies" button, not routed through Heyra chat.

import type { Transaction, Payment, Subscription, Holding, BalanceCheckpoint, BudgetCap, Cadence } from '../types'
import type { BrainTool } from '../heyra/brainClient'
import { TODAY } from '../domains'
import { OPENING_BALANCE } from '../mockData'
import { computeBalance, realTransactions } from './balance'
import { monthStats, prevMonthKey } from './stats'

/** Rick's call beats the date heuristic: an explicit Payment.urgent override
 *  (set from the Te-betalen tab or the coach's plan) always wins. With no
 *  override, "urgent" defaults to overdue or due within 3 days. */
export function effectiveUrgent(p: Payment, today = TODAY): boolean {
  if (p.urgent !== null && p.urgent !== undefined) return p.urgent
  return !!p.due && p.due <= isoDaysFromNow(3, today)
}

function monthlyAmount(amount: number, cadence: Cadence): number {
  switch (cadence) {
    case 'weekly': return (amount * 52) / 12
    case 'monthly': return amount
    case 'quarterly': return amount / 3
    case 'yearly': return amount / 12
  }
}

function isoDaysFromNow(days: number, from = TODAY): string {
  const d = new Date(from + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export const FINANCE_COACH_SYSTEM = `Je bent HEYRA — dezelfde assistent als altijd, maar nu met de pet van financieel coach op. Je krijgt een feitenblok met Rick's echte cijfers (saldo, uitgaven, abonnementen, openstaande betalingen). Verzin GEEN bedragen, data of namen die niet in de gegevens staan — alles moet direct te herleiden zijn tot een gegeven feit.

Schrijf kort Nederlands, ADHD-vriendelijk: 3 tot 5 losse punten als markdown-bullets (\`- \`), elk één concreet, direct bruikbaar punt (geen inleiding, geen opsomming van wat je ziet zonder advies). Zet het kernbedrag of kerngetal van elk punt in **vet**. Focus op, in deze volgorde van urgentie:
- betalingen die te laat zijn of binnen enkele dagen vervallen — wat, hoeveel, wanneer, en of het saldo dat dekt
- een budgetplafond dat deze maand overschreden is of bijna overschreden dreigt te worden
- iets dat opvalt in de uitgaven (stijging, een categorie die er uitspringt)
- abonnementen die het bekijken waard zijn (te veel, hoge stapeling)
- één concrete actie om meer opzij te zetten of grip te houden

Geen open deuren ("let op je uitgaven"). Alleen zeggen wat je kunt onderbouwen met de gegeven feiten.`

export interface FinanceCoachInput {
  transactions: Transaction[]
  payments: Payment[]
  subscriptions: Subscription[]
  holdings: Holding[]
  balanceCheckpoints: BalanceCheckpoint[]
  budgetCaps: BudgetCap[]
}

/** Builds the grounded facts prompt the coach reasons over — no LLM call here. */
export function buildFinanceCoachPrompt(input: FinanceCoachInput): { system: string; prompt: string } {
  const { balance } = computeBalance(input.transactions, input.balanceCheckpoints, OPENING_BALANCE)

  const thisMonth = TODAY.slice(0, 7)
  const lastMonth = prevMonthKey(thisMonth)
  const { earned: earnedThis, spent: spentThis, byCategory: topCategories } = monthStats(input.transactions, thisMonth)
  const { spent: spentLast } = monthStats(input.transactions, lastMonth)

  const activeSubs = input.subscriptions.filter((s) => s.active)
  const subsMonthly = activeSubs.reduce((a, s) => a + monthlyAmount(s.amount, s.cadence), 0)

  const openOutgoing = input.payments.filter((p) => p.status === 'open' && p.direction === 'outgoing')
  const overdue = openOutgoing.filter((p) => p.due && p.due < TODAY)
  const within30 = openOutgoing.filter((p) => p.due && p.due >= TODAY && p.due <= isoDaysFromNow(30))
  const urgentFlagged = openOutgoing.filter((p) => effectiveUrgent(p))
  const outgoingTotal = openOutgoing.reduce((a, p) => a + p.amount, 0)
  const safeToSpend = balance - outgoingTotal

  const spentByCategory = new Map<string, number>()
  realTransactions(input.transactions)
    .filter((t) => t.date.slice(0, 7) === thisMonth && t.amount < 0)
    .forEach((t) => spentByCategory.set(t.category, (spentByCategory.get(t.category) ?? 0) + Math.abs(t.amount)))
  const overBudget = input.budgetCaps
    .filter((b) => b.active && b.monthlyMax > 0)
    .map((b) => ({ ...b, spent: spentByCategory.get(b.category) ?? 0 }))
    .filter((b) => b.spent > b.monthlyMax)

  const facts = [
    `Huidig saldo: €${Math.round(balance)}. Vrij besteedbaar na aftrek van nog te betalen: €${Math.round(safeToSpend)}.`,
    `Deze maand: €${Math.round(earnedThis)} binnengekomen, €${Math.round(spentThis)} uitgegeven.` +
      (spentLast > 0 ? ` Vorige maand was €${Math.round(spentLast)} uitgegeven.` : ' Geen vergelijking met vorige maand beschikbaar.'),
    topCategories.length
      ? `Grootste uitgavecategorieën deze maand: ${topCategories.slice(0, 3).map((c) => `${c.cat} €${c.v}`).join(', ')}.`
      : 'Nog geen gecategoriseerde uitgaven deze maand.',
    `Abonnementen: ${activeSubs.length} actief, samen €${Math.round(subsMonthly)} per maand (€${Math.round(subsMonthly * 12)} per jaar).`,
    `Nog te betalen: ${openOutgoing.length} openstaand, totaal €${Math.round(outgoingTotal)}.` +
      (overdue.length ? ` ${overdue.length} daarvan te laat: ${overdue.slice(0, 3).map((p) => `${p.payee} €${p.amount} (verviel ${p.due})`).join(', ')}.` : '') +
      (within30.length ? ` ${within30.length} vervalt binnen 30 dagen: ${within30.slice(0, 3).map((p) => `${p.payee} €${p.amount} (${p.due})`).join(', ')}.` : '') +
      (urgentFlagged.length ? ` Rick markeerde ${urgentFlagged.length} als urgent (inclusief handmatige overrides).` : ''),
  ]
  if (overBudget.length) {
    facts.push(
      `Budgetplafond overschreden: ${overBudget.map((b) => `${b.category} €${Math.round(b.spent)} van €${Math.round(b.monthlyMax)}`).join(', ')}.`,
    )
  }
  if (input.holdings.length) {
    facts.push(`Beleggingen: ${input.holdings.length} positie(s) in de tracker (koersdetails niet in dit feitenblok).`)
  }

  return { system: FINANCE_COACH_SYSTEM, prompt: facts.join('\n') }
}

// ── Plan: a structured, per-payment action list Rick can act on directly ────
// Separate from the prose advice above — this is what "genereer een plan" /
// "help mee bepalen welke betalingen urgent zijn en hoe we dit oplossen"
// actually needs: concrete items tied to real payment ids (so the UI can
// offer a "Betaald"/"Urgent"/"Kan wachten" button per item), not a paragraph.

export type FinancePlanAction = 'pay_now' | 'wait' | 'ask_extension' | 'partial' | 'move_money' | 'follow_up'

export interface FinancePlanItem {
  paymentId: string
  action: FinancePlanAction
  reasoning: string
}

export const FINANCE_PLAN_SYSTEM = `Je bent HEYRA, financieel coach. Je krijgt een lijst met openstaande betalingen (elk met een echt id-veld) plus Ricks saldo en vrij besteedbaar bedrag. Stel voor elke betaling die aandacht nodig heeft één actie voor uit exact deze opties:
- pay_now: nu betalen — urgent en het saldo dekt het
- wait: kan wachten, ondanks de urgentie-vlag geen actie nodig
- ask_extension: uitstel vragen — te laat of urgent, maar het saldo dekt het niet
- partial: gedeeltelijk betalen als volledig nu niet lukt
- move_money: eerst geld overboeken tussen Ricks eigen rekeningen voordat dit betaald kan worden
- follow_up: alleen bij een bedrag dat Rick nog moet ONTVANGEN — opvolgen bij de klant

Gebruik uitsluitend de payment_id's uit de gegeven lijst, verzin er geen bij. Onderbouw elke keuze in één korte Nederlandse zin met een concreet gegeven feit (bedrag, datum of saldo) — geen open deuren. Sla een betaling over als er echt niets te doen valt.`

export const FINANCE_PLAN_TOOL: BrainTool = {
  name: 'propose_finance_plan',
  description: "Concreet actieplan voor Rick's openstaande betalingen, gebaseerd op de gegeven betalingen en saldo.",
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            payment_id: { type: 'string', description: 'Het exacte id-veld uit de gegeven lijst met betalingen.' },
            action: {
              type: 'string',
              enum: ['pay_now', 'wait', 'ask_extension', 'partial', 'move_money', 'follow_up'],
            },
            reasoning: { type: 'string', description: 'Eén korte Nederlandse zin die de keuze onderbouwt met een gegeven feit.' },
          },
          required: ['payment_id', 'action', 'reasoning'],
        },
      },
    },
    required: ['items'],
  },
}

const PLAN_ACTION_HORIZON_DAYS = 14

/** Payments worth putting in front of the model for a plan: open, and either
 *  urgent (flag or date heuristic), overdue, or due soon — capped so the
 *  prompt stays small and the model isn't asked to plan around routine bills. */
function planCandidates(payments: Payment[]): Payment[] {
  const horizon = isoDaysFromNow(PLAN_ACTION_HORIZON_DAYS)
  return payments
    .filter((p) => p.status === 'open')
    .filter((p) => effectiveUrgent(p) || (p.due && p.due <= horizon))
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
    .slice(0, 8)
}

/** Builds the grounded prompt + tool for a structured payment plan — a
 *  separate askBrainTool() call from the prose advice above. */
export function buildFinancePlanPrompt(
  input: FinanceCoachInput,
): { system: string; prompt: string; tool: BrainTool } | null {
  const candidates = planCandidates(input.payments)
  if (!candidates.length) return null

  const { balance } = computeBalance(input.transactions, input.balanceCheckpoints, OPENING_BALANCE)
  const openOutgoing = input.payments.filter((p) => p.status === 'open' && p.direction === 'outgoing')
  const outgoingTotal = openOutgoing.reduce((a, p) => a + p.amount, 0)
  const safeToSpend = balance - outgoingTotal

  const lines = [
    `Huidig saldo: €${Math.round(balance)}. Vrij besteedbaar na aftrek van alle nog te betalen bedragen: €${Math.round(safeToSpend)}.`,
    'Betalingen om een plan voor te maken:',
    ...candidates.map((p) => {
      const richting = p.direction === 'incoming' ? 'te ontvangen van' : 'te betalen aan'
      const wanneer = p.due ? (p.due < TODAY ? `${p.due} (te laat)` : p.due) : 'geen datum'
      const urgentie = effectiveUrgent(p) ? 'urgent' : 'normaal'
      return `id=${p.id} | ${richting} ${p.payee} | €${p.amount} | vervalt ${wanneer} | urgentie: ${urgentie}`
    }),
  ]

  return { system: FINANCE_PLAN_SYSTEM, prompt: lines.join('\n'), tool: FINANCE_PLAN_TOOL }
}
