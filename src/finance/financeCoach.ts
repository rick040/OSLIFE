// ── HEYRA · financial coach persona ──────────────────────────────────────────
// Same assistant, different hat: askBrain() gets a coach-flavoured system
// prompt plus a grounded facts block built entirely from real store numbers —
// same "never invent a euro figure" rule as heyra/agents/financeAgent.ts.
// This is a plain helper (not a chat Agent) since it's triggered from the
// Budget tab's "ververs advies" button, not routed through Heyra chat.

import type { Transaction, Payment, Subscription, Holding, BalanceCheckpoint, BudgetCap, Cadence } from '../types'
import { TODAY } from '../domains'
import { OPENING_BALANCE } from '../mockData'
import { computeBalance, realTransactions } from './balance'
import { monthStats, prevMonthKey } from './stats'

function monthlyAmount(amount: number, cadence: Cadence): number {
  switch (cadence) {
    case 'weekly': return (amount * 52) / 12
    case 'monthly': return amount
    case 'quarterly': return amount / 3
    case 'yearly': return amount / 12
  }
}

function isoDaysFromNow(days: number): string {
  const d = new Date(TODAY + 'T00:00:00')
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
      (within30.length ? ` ${within30.length} vervalt binnen 30 dagen: ${within30.slice(0, 3).map((p) => `${p.payee} €${p.amount} (${p.due})`).join(', ')}.` : ''),
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
