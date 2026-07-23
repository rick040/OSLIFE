// ── HEYRA · dynamic suggestions ───────────────────────────────────────────────
// Two jobs:
//  1. contextualSuggestions() — the chips shown before you've said anything,
//     built from what's actually true in your memory today (a project deadline,
//     an overdue loop, a payment due, an unread important email, ...).
//  2. followUpSuggestions() — after HEYRA answers, chips for a natural next
//     question, based on the topic of what you just asked.
// Both are plain rule-based scoring over live store data — same philosophy as
// understand.ts: transparent and instant, swappable for an LLM later.

import type {
  Project,
  Thread,
  Payment,
  EmailItem,
  Habit,
  DogReminder,
  Client,
  Checkin,
  Goal,
  Milestone,
  Domain,
} from '../types'
import { DOMAIN_META, TODAY, fmtDate, daysBetween } from '../domains'
import type { ActionKind } from './actions/types'
import { askBrain } from './brainClient'
import { parseBrainJson } from './brainJson'

export type Topic =
  | 'open-loops'
  | 'energy'
  | 'money'
  | 'task-note'
  | 'task-draft'
  | 'vent'
  | 'domain'
  | 'generic'
  | 'project'
  | 'search'
  | 'chart'
  | 'clientIntake'
  | 'idea'
  | 'briefing'

/** The slice of store state suggestions read from. Store satisfies this shape. */
export interface HeyraContext {
  projects: Project[]
  threads: Thread[]
  payments: Payment[]
  emails: EmailItem[]
  habits: Habit[]
  dogReminders: DogReminder[]
  clients: Client[]
  checkins: Checkin[]
  goals: Goal[]
  milestones: Milestone[]
}

interface Candidate {
  text: string
  score: number
}

function push(list: Candidate[], text: string, score: number) {
  if (!list.some((c) => c.text === text)) list.push({ text, score })
}

// A chip that was already shown recently gets its score cut sharply rather
// than removed outright — a still-true suggestion ("nog 1 factuur open") can
// resurface once nothing else outranks it, but a repeat no longer dominates
// every turn. This is the fix for "it gives the same suggestions every time".
const REPEAT_PENALTY = 0.15

function rank(candidates: Candidate[], exclude: string[] | undefined, limit: number): string[] {
  return candidates
    .map((c) => (exclude?.includes(c.text) ? { ...c, score: c.score * REPEAT_PENALTY } : c))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.text)
}

/** Suggestions shown before the conversation starts, sourced from live data. `exclude` (chips shown in the last several turns) deprioritizes repeats without hard-banning them. */
export function contextualSuggestions(ctx: HeyraContext, exclude?: string[]): string[] {
  const c: Candidate[] = []

  // 1. Project deadlines today / very soon — the highest-signal prompt.
  const liveProjects = ctx.projects.filter((p) => p.status !== 'done' && p.deadline)
  for (const p of liveProjects) {
    const dd = daysBetween(TODAY, p.deadline!)
    if (dd < 0) continue // overdue projects surface as loops below
    if (dd === 0) push(c, `Wat moet er nog gedaan worden voor ${p.name} (deadline vandaag)?`, 100)
    else if (dd <= 2) push(c, `Wat moet er nog gedaan worden voor ${p.name} (deadline ${fmtDate(p.deadline)})?`, 90 - dd)
  }

  // 2. Overdue open loops (captured tasks, or project/lead loops past due).
  const overdue = ctx.threads
    .filter((t) => t.status === 'open' && t.due && daysBetween(t.due, TODAY) > 0)
    .sort((a, b) => daysBetween(b.due!, TODAY) - daysBetween(a.due!, TODAY))
  if (overdue.length) {
    const t = overdue[0]
    push(c, `"${t.title}" staat al ${daysBetween(t.due!, TODAY)}d te laat — wat nu?`, 95)
  }

  // 3. Blocked projects.
  const blocked = ctx.projects.filter((p) => p.status === 'blocked')
  if (blocked.length) {
    push(c, blocked.length === 1
      ? `Waarom staat ${blocked[0].name} geblokkeerd?`
      : `Welke ${blocked.length} projecten staan geblokkeerd?`, 80)
  }

  // 4. Payments due soon / overdue.
  const openPayments = ctx.payments.filter((p) => p.status === 'open' && p.due)
  const outgoing = openPayments
    .filter((p) => p.direction === 'outgoing')
    .sort((a, b) => a.due!.localeCompare(b.due!))
  if (outgoing.length) {
    const soon = outgoing.filter((p) => daysBetween(TODAY, p.due!) <= 3)
    if (soon.length === 1) push(c, `Moet ik ${soon[0].payee} nog betalen (€${soon[0].amount})?`, 85)
    else if (soon.length > 1) push(c, `Welke betalingen moet ik deze week nog doen?`, 82)
  }
  const incoming = openPayments.filter((p) => p.direction === 'incoming' && daysBetween(p.due!, TODAY) > 0)
  if (incoming.length) push(c, `Wie moet mij nog betalen?`, 70)

  // 5. Unread, flagged-important email.
  const importantUnread = ctx.emails.filter((e) => e.unread && e.important)
  if (importantUnread.length) {
    push(c, importantUnread.length === 1
      ? `Wat staat er in de mail van ${importantUnread[0].from}?`
      : `Wat staat er in mijn inbox dat aandacht nodig heeft?`, 75)
  }

  // 6. High-potential leads worth a follow-up.
  const hotLeads = ctx.clients.filter((cl) => (cl.clientStatus === 'Lead' || cl.clientStatus === 'Prospect') && cl.potentie === 'Hoog')
  if (hotLeads.length) push(c, `Moet ik ${hotLeads[0].name} nog opvolgen?`, 65)

  // 7. Habits not done today.
  const openHabits = ctx.habits.filter((h) => !h.doneToday)
  if (openHabits.length >= 2) push(c, `Welke gewoontes moet ik vandaag nog afronden?`, 55)

  // 8. Dog reminders due soon.
  const dueReminders = ctx.dogReminders.filter((r) => !r.done && daysBetween(TODAY, r.due) <= 3)
  if (dueReminders.length) push(c, `Wat moet ik nog regelen voor Kyra (${dueReminders[0].title})?`, 60)

  // 9. Goals / milestones due soon.
  const dueMilestones = ctx.milestones.filter((m) => !m.done && m.due && daysBetween(TODAY, m.due) >= 0 && daysBetween(TODAY, m.due) <= 7)
  if (dueMilestones.length) {
    const g = ctx.goals.find((x) => x.id === dueMilestones[0].goalId)
    push(c, `Hoe dicht zit ik bij ${g ? g.title : 'die mijlpaal'} (${dueMilestones[0].title})?`, 58)
  }

  // 10. Low felt energy from today's check-in.
  const today = ctx.checkins.find((k) => k.date === TODAY)
  if (today && today.energy <= 2) push(c, `Waarom voel ik me vandaag zo moe?`, 62)

  // Fallbacks so the bar is never empty on a quiet day.
  push(c, 'Wat staat er nog open bij klanten?', 10)
  push(c, 'Hoe staat het met mijn Noordster-doelen?', 8)

  return rank(c, exclude, 4)
}

// ── follow-ups ────────────────────────────────────────────────────────────────

function domainOpenCount(ctx: HeyraContext, domain: Domain): number {
  return ctx.threads.filter((t) => t.status === 'open' && t.domain === domain).length
}

/** Suggested next questions, based on the topic of the exchange that just happened. `exclude` (chips shown in the last several turns) deprioritizes repeats without hard-banning them. */
export function followUpSuggestions(
  topic: Topic,
  ctx: HeyraContext,
  extra?: {
    domain?: Domain
    title?: string
    projectName?: string
    searchQuery?: string
    chartTitle?: string
    clientName?: string
  },
  exclude?: string[],
): string[] {
  const c: Candidate[] = []

  switch (topic) {
    case 'open-loops': {
      const overdue = ctx.threads.filter((t) => t.status === 'open' && t.due && daysBetween(t.due, TODAY) > 0)
      if (overdue.length) push(c, `Welke loop staat het langst open?`, 90)
      const byDomain = new Map<Domain, number>()
      for (const t of ctx.threads.filter((t) => t.status === 'open')) {
        byDomain.set(t.domain, (byDomain.get(t.domain) ?? 0) + 1)
      }
      const top = [...byDomain.entries()].sort((a, b) => b[1] - a[1])[0]
      if (top) push(c, `Wat staat er open bij ${DOMAIN_META[top[0]].label}?`, 80)
      push(c, `Herinner me aan de belangrijkste loop`, 60)
      break
    }
    case 'money': {
      push(c, `Welke facturen zijn nog niet betaald?`, 90)
      push(c, `Hoeveel heb ik deze maand uitgegeven?`, 75)
      const incoming = ctx.payments.filter((p) => p.status === 'open' && p.direction === 'incoming')
      if (incoming.length) push(c, `Wie moet mij nog betalen?`, 70)
      break
    }
    case 'energy': {
      push(c, `Hoe was mijn slaap deze week?`, 85)
      push(c, `Wat kan ik vandaag beter plannen?`, 70)
      break
    }
    case 'vent': {
      const domain = extra?.domain
      if (domain) push(c, `Wat staat er nog meer open bij ${DOMAIN_META[domain].label}?`, 85)
      push(c, `Zie je hier een patroon in?`, 65)
      break
    }
    case 'task-draft': {
      const domain = extra?.domain
      if (domain) push(c, `Wat staat er nog meer open bij ${DOMAIN_META[domain].label}?`, 85)
      push(c, `Nog een taak toevoegen`, 70)
      push(c, `Wat is mijn eerstvolgende deadline?`, 60)
      break
    }
    case 'task-note': {
      push(c, `Wat staat er nog meer open?`, 80)
      push(c, `Zet er ook een deadline op`, 65)
      break
    }
    case 'project': {
      const name = extra?.projectName
      if (name) {
        push(c, `Wat is de volgende mijlpaal voor ${name}?`, 85)
        push(c, `Hoeveel uur heb ik al aan ${name} besteed?`, 75)
        push(c, `Maak een factuur voor ${name}`, 65)
      }
      break
    }
    case 'search': {
      const q = extra?.searchQuery
      push(c, q ? `Zoek breder naar "${q}"` : 'Zoek breder', 70)
      push(c, 'Laat alles zien in Geheugen', 55)
      break
    }
    case 'chart': {
      const title = extra?.chartTitle
      push(c, title ? `Vergelijk ${title.toLowerCase()} met vorige week` : 'Vergelijk met vorige week', 80)
      push(c, 'Laat dit over een langere periode zien', 60)
      break
    }
    case 'clientIntake': {
      const name = extra?.clientName
      if (name) {
        push(c, `Staat ${name} al in het CRM?`, 80)
        push(c, `Wat is de status van ${name}?`, 65)
      }
      break
    }
    case 'idea': {
      push(c, 'Welke ideeën staan er nog als "idee" in Strategie HQ?', 80)
      push(c, 'Wat is de haalbaarheidsscore van mijn laatste idee?', 65)
      break
    }
    case 'briefing': {
      push(c, 'Wat is de belangrijkste loop nu?', 85)
      push(c, 'Hoe staat het met mijn financiën?', 70)
      push(c, 'Waarom voel ik me zo?', 60)
      break
    }
    case 'domain':
    default: {
      const domain = extra?.domain
      if (domain) {
        const n = domainOpenCount(ctx, domain)
        if (n > 0) push(c, `Wat staat er nog open bij ${DOMAIN_META[domain].label}?`, 80)
        push(c, `Hoe gaat het over het algemeen met ${DOMAIN_META[domain].label}?`, 60)
      }
      push(c, `Wat staat er nog open bij klanten?`, 40)
      break
    }
  }

  return rank(c, exclude, 3)
}

// ── action-card-driven follow-ups ────────────────────────────────────────────
// After a confirmed action card actually dispatches, a natural next-step chip
// tied to what just happened is a much stronger signal than the generic
// topic-based follow-ups above — ties suggestion variety directly to the
// action system instead of being a wholly separate guess.
const ACTION_FOLLOWUP: Partial<Record<ActionKind, (entityLabel?: string | null) => string>> = {
  mark_invoice_paid: () => 'Nog een factuur bijwerken?',
  update_invoice_status: () => 'Nog een factuur bijwerken?',
  create_invoice: (label) => (label ? `Factuur versturen voor ${label}?` : 'Nog een factuur aanmaken?'),
  create_task: () => 'Nog een taak toevoegen?',
  update_task: () => 'Nog een taak bijwerken?',
  complete_task: () => 'Nog een taak afronden?',
  update_project_status: (label) => (label ? `Wat is de volgende stap voor ${label}?` : 'Wat is de volgende stap?'),
  log_project_activity: (label) => (label ? `Nog een update loggen voor ${label}?` : 'Nog een update loggen?'),
  create_client: (label) => (label ? `Project koppelen aan ${label}?` : 'Nog een klant toevoegen?'),
  update_client: () => 'Nog een klant bijwerken?',
}

/** A follow-up chip for right after a confirmed action card dispatches — null for kinds with no natural next step (informational cards, which never dispatch anyway). */
export function actionFollowUpSuggestion(kind: ActionKind, entityLabel?: string | null): string | null {
  return ACTION_FOLLOWUP[kind]?.(entityLabel) ?? null
}

// ── brain-grounded follow-ups ─────────────────────────────────────────────────
// followUpSuggestions() above is topic-shaped ("money" always offers the same
// three templates) — it never actually reads what HEYRA just said, so two
// different money answers get the same chips. This asks the brain for 2-3
// follow-ups grounded in the EXACT exchange that just happened — same
// null-safe, best-effort contract as every other brain call in this app
// (askBrain resolves null on any failure), so callers keep the rule-based
// result showing immediately and only swap in the real ones once they land.

const BRAIN_FOLLOWUP_SYSTEM = `Je bent HEYRA (OSLIFE). Je krijgt het laatste bericht van Rick en jouw eigen antwoord daarop. Bedenk 2 tot 3 korte, natuurlijke vervolgvragen of acties die Rick nu zou willen — gebaseerd op EXACT wat jij net zei, niet algemene vragen over het onderwerp. Als je antwoord bijvoorbeeld een specifiek aantal, naam of datum noemt, verwijs daar dan naar. Max 8 woorden per suggestie, in het Nederlands. Verzin geen feiten die niet in het gesprek staan. Als er niets zinnigs op te volgen is, geef een lege lijst.

Antwoord ALLEEN met een fenced \`\`\`json blok:
{"suggestions":["...","..."]}`

/**
 * Asks the brain for follow-ups grounded in this specific exchange. Returns
 * null on any brain failure/malformed response (never an error) and [] when
 * the brain genuinely has nothing to add — both cases mean "keep whatever
 * rule-based suggestions are already showing".
 */
export async function brainFollowUps(
  userText: string,
  heyraText: string,
  exclude: string[] = [],
): Promise<string[] | null> {
  const prompt =
    `Rick: ${userText}\nHEYRA: ${heyraText}` +
    (exclude.length ? `\n\n(Vermijd suggesties die hier al op lijken: ${exclude.join(' | ')})` : '')

  const raw = await askBrain(BRAIN_FOLLOWUP_SYSTEM, prompt, { maxTokens: 150, timeoutMs: 3500 })
  if (!raw) return null

  const parsed = parseBrainJson(raw)
  const list = parsed && Array.isArray((parsed as { suggestions?: unknown }).suggestions)
    ? (parsed as { suggestions: unknown[] }).suggestions
    : null
  if (!list) return null

  return list
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0 && s.trim().length <= 80)
    .map((s) => s.trim())
    .slice(0, 3)
}
