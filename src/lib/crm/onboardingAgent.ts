// ── Onboarding-wizard · AI project intake ────────────────────────────────────
// Given a raw client message, drafts a full project setup — client/project
// basics, scope, deliverables, milestones, an acceptance checklist and a
// proposal — for the onboarding wizard to review before anything is written
// to the CRM. Runs on HEYRA's Haiku brain (askBrain → heyra-brain edge
// function); on any brain failure it falls back to the same regex extraction
// clientIntakeAgent uses, so the wizard is always usable, brain or no brain.

import { askBrain } from '../../heyra/brainClient'
import { parseBrainJson } from '../../heyra/brainJson'
import {
  guessChannel, guessLanguage, extractEmail, extractBudget, guessClientName,
} from '../../heyra/agents/clientIntakeAgent'
import { templateTasksFor } from './projectTemplates'
import { PROJECT_TYPE_OPTIONS } from '../../components/crm'
import type { Channel, Client } from '../../types'

export interface OnboardingMilestone {
  title: string
  /** Days from project start — kept relative since the brain doesn't know the real start date. */
  offsetDays: number
}

/** A full editable project-setup draft, reviewed step by step before anything is committed. */
export interface OnboardingDraft {
  sourceText: string
  language: 'nl' | 'en'
  clientName: string
  email: string | null
  matchedClientId: string | null
  projectType: string[]
  budgetGuess: number | null
  deadlineGuess: string | null // ISO date, best-effort
  scope: string
  deliverables: string[]
  tasks: string[]
  acceptanceCriteria: string[]
  milestones: OnboardingMilestone[]
  proposalText: string
  reply: string
  channelGuess: Channel
  fromBrain: boolean
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : []
}

function asMilestones(v: unknown): OnboardingMilestone[] {
  if (!Array.isArray(v)) return []
  return v
    .map((m) => {
      if (!m || typeof m !== 'object') return null
      const title = typeof (m as Record<string, unknown>).title === 'string' ? (m as Record<string, unknown>).title as string : ''
      const offsetDays = Number((m as Record<string, unknown>).offsetDays)
      if (!title.trim()) return null
      return { title: title.trim(), offsetDays: Number.isFinite(offsetDays) && offsetDays >= 0 ? Math.round(offsetDays) : 7 }
    })
    .filter((m): m is OnboardingMilestone => m !== null)
}

function fallbackProposal(language: 'nl' | 'en', name: string, deliverables: string[], budget: number | null): string {
  const list = deliverables.length ? deliverables.map((d) => `- ${d}`).join('\n') : (language === 'nl' ? '- (nog te bepalen)' : '- (to be defined)')
  return language === 'nl'
    ? `Voorstel voor ${name}\n\nDeliverables:\n${list}\n\nIndicatie: ${budget != null ? `€${budget.toLocaleString('nl-NL')}` : 'nog te bepalen'}`
    : `Proposal for ${name}\n\nDeliverables:\n${list}\n\nEstimate: ${budget != null ? `€${budget.toLocaleString('nl-NL')}` : 'to be determined'}`
}

function fallbackReply(language: 'nl' | 'en', name: string): string {
  const greetName = name === 'Nieuwe klant' ? '' : ` ${name}`
  return language === 'nl'
    ? `Hoi${greetName},\n\nBedankt voor je bericht! Ik heb een voorstel voor je klaargezet — laat me weten of dit aansluit bij wat je zoekt.\n\nGroet,\nRick`
    : `Hi${greetName},\n\nThanks for your message! I've put together a proposal — let me know if this matches what you're looking for.\n\nBest,\nRick`
}

function fallbackDraft(input: string): OnboardingDraft {
  const language = guessLanguage(input)
  const clientName = guessClientName(input)
  const budgetGuess = extractBudget(input)
  return {
    sourceText: input,
    language,
    clientName,
    email: extractEmail(input),
    matchedClientId: null,
    projectType: [],
    budgetGuess,
    deadlineGuess: null,
    scope: '',
    deliverables: [],
    tasks: [],
    acceptanceCriteria: [],
    milestones: [],
    proposalText: fallbackProposal(language, clientName, [], budgetGuess),
    reply: fallbackReply(language, clientName),
    channelGuess: guessChannel(input),
    fromBrain: false,
  }
}

/**
 * Parses a raw client message into a full onboarding draft. Never throws —
 * on a brain miss or malformed reply it returns the regex-only fallback so
 * the wizard can always move forward with something to edit.
 */
export async function runOnboardingAnalysis(input: string, clients: Client[]): Promise<OnboardingDraft> {
  const clientNames = clients.map((c) => c.name)
  const types = PROJECT_TYPE_OPTIONS.join(', ')

  const system = `Je bent het "Klant-onboarding" brein van HEYRA, voor Rick van Mierlo (PRJCT Agency, KvK 89078802, Geldrop/Eindhoven). Rick plakt een ruw klantbericht (WhatsApp, e-mail of Fiverr) en jij zet dit om in een compleet, bewerkbaar projectvoorstel:
1. Herken de taal: Nederlands voor lokale klanten, Engels voor Fiverr/internationale klanten.
2. Haal klantnaam, e-mail, projecttype(n) (kies uit: ${types}), budget- en deadline-indicaties eruit.
3. Schrijf een korte scope-omschrijving (2-3 zinnen): wat het project inhoudt en wat er NIET bij hoort.
4. Stel een concrete deliverables-lijst voor (wat wordt er opgeleverd) — alleen als er echt een project bedoeld wordt, niet bij een simpele prijsvraag.
5. Splits de deliverables uit naar een taken-lijst (concrete werkstappen).
6. Stel 3-6 mijlpalen voor met titel + aantal dagen vanaf de startdatum (offsetDays), realistisch voor dit type project.
7. Stel een korte acceptatie-/testchecklist voor: waar moet op gecontroleerd worden vóór oplevering (bv. "Werkt op mobiel", "Alle links werken", "Klant heeft content goedgekeurd").
8. Schrijf een voorstel-tekst (proposalText) in Rick's toon: scope, deliverables en prijsindicatie, klaar om als offerte te sturen.
9. Schrijf een kort antwoord (reply) aan de klant in Rick's toon: persoonlijk, warm-professioneel, geen corporate jargon, "je/jij" (nooit "u"), eindigend met "Groet,\\nRick" (of "Best,\\nRick" in het Engels).
10. Check of dit een bestaande klant is uit deze lijst: ${clientNames.length ? clientNames.join(', ') : '(nog geen klanten bekend)'}. Vul "looksLikeExistingClient" ALLEEN met een naam die letterlijk in die lijst staat, anders null. Verzin nooit een naam die niet in de lijst staat.

Antwoord ALLEEN met een fenced \`\`\`json blok, geen andere tekst, exact dit schema (gebruik null of [] waar iets niet bekend is):
{"language":"nl"|"en","clientName":string,"email":string|null,"projectType":string[],"budgetGuess":number|null,"deadlineGuess":string|null,"scope":string,"deliverables":string[],"tasks":string[],"acceptanceCriteria":string[],"milestones":[{"title":string,"offsetDays":number}],"proposalText":string,"reply":string,"looksLikeExistingClient":string|null}`

  const guess = await askBrain(system, `Klantbericht:\n"""\n${input}\n"""`, { maxTokens: 1600, timeoutMs: 16000 })

  if (guess) {
    const parsed = parseBrainJson(guess)
    const reply = parsed && typeof parsed.reply === 'string' ? parsed.reply.trim() : ''
    if (reply) {
      const claimedExisting = typeof parsed!.looksLikeExistingClient === 'string' ? parsed!.looksLikeExistingClient.trim().toLowerCase() : null
      const claimedName = typeof parsed!.clientName === 'string' ? parsed!.clientName.trim() : ''
      const matchTarget = claimedExisting || claimedName.toLowerCase()
      const matched = matchTarget ? clients.find((c) => c.name.trim().toLowerCase() === matchTarget) ?? null : null
      const language = parsed!.language === 'en' ? 'en' : 'nl'
      const deliverables = asStringArray(parsed!.deliverables)
      const budgetGuess = typeof parsed!.budgetGuess === 'number' ? parsed!.budgetGuess : extractBudget(input)
      const proposalText = typeof parsed!.proposalText === 'string' && parsed!.proposalText.trim()
        ? parsed!.proposalText.trim()
        : fallbackProposal(language, claimedName || guessClientName(input), deliverables, budgetGuess)

      return {
        sourceText: input,
        language,
        clientName: claimedName || guessClientName(input),
        email: typeof parsed!.email === 'string' && parsed!.email.trim() ? parsed!.email.trim() : extractEmail(input),
        matchedClientId: matched?.id ?? null,
        projectType: asStringArray(parsed!.projectType),
        budgetGuess,
        deadlineGuess: typeof parsed!.deadlineGuess === 'string' ? parsed!.deadlineGuess : null,
        scope: typeof parsed!.scope === 'string' ? parsed!.scope.trim() : '',
        deliverables,
        tasks: asStringArray(parsed!.tasks),
        acceptanceCriteria: asStringArray(parsed!.acceptanceCriteria),
        milestones: asMilestones(parsed!.milestones),
        proposalText,
        reply,
        channelGuess: guessChannel(input),
        fromBrain: true,
      }
    }
  }

  return fallbackDraft(input)
}

/** Deduped union of the AI's task breakdown, its deliverables, and the standard template for the chosen project type(s) — the wizard's starting task list. */
export function mergedTaskList(draft: OnboardingDraft): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of [...draft.tasks, ...draft.deliverables, ...templateTasksFor(draft.projectType)]) {
    const key = t.trim().toLowerCase()
    if (key && !seen.has(key)) {
      seen.add(key)
      out.push(t.trim())
    }
  }
  return out
}

/** Turns milestone offsets into absolute ISO due dates given a real project start date. */
export function resolveMilestoneDates(milestones: OnboardingMilestone[], startDateIso: string): { title: string; dueDate: string }[] {
  const start = new Date(`${startDateIso}T00:00:00`)
  return milestones.map((m) => {
    const d = new Date(start)
    d.setDate(d.getDate() + m.offsetDays)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { title: m.title, dueDate: iso }
  })
}
