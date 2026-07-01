// ── HEYRA agent · Klant-intake ────────────────────────────────────────────────
// Paste a raw client message (WhatsApp/email/Fiverr) and this agent extracts
// client + project info and drafts a reply in Rick's tone, returned as an
// editable ClientIntakeDraft — nothing is written to the CRM here. The brain
// only ever gets to *suggest* a match against real client names; the final
// existing-client decision is made in code (askBrain can't invent a client).

import { askBrain } from '../brainClient'
import type { Agent } from './types'
import type { ClientIntakeDraft } from '../cards'
import type { Channel } from '../../types'

function guessChannel(text: string): Channel {
  const t = text.toLowerCase()
  if (t.includes('fiverr')) return 'fiverr'
  if (/\[\d{1,2}[/-]\d{1,2}[/-]\d{2,4},?\s*\d{1,2}:\d{2}/.test(text) || /\d{1,2}:\d{2}\s*-\s*[\w ]+:/.test(text)) return 'whatsapp'
  return 'email'
}

function guessLanguage(text: string): 'nl' | 'en' {
  const t = ` ${text.toLowerCase()} `
  const nlHits = [' de ', ' het ', ' een ', ' ik ', ' jij ', ' wij ', ' niet ', ' graag ', ' alsjeblieft ', 'hoi ', ' hallo'].filter((w) => t.includes(w)).length
  const enHits = [' the ', ' hello', ' hi ', ' please', ' thanks', ' would ', ' could you', ' i am ', " i'm "].filter((w) => t.includes(w)).length
  return enHits > nlHits ? 'en' : 'nl'
}

function extractEmail(text: string): string | null {
  const m = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)
  // trailing sentence punctuation ("...test@example.com. Thanks!") isn't part
  // of the address — strip it rather than swallowing it into the match.
  return m ? m[0].replace(/[.,;:!?]+$/, '') : null
}

function extractBudget(text: string): number | null {
  const m = text.match(/(?:€|eur)\s?([\d.,]{2,})/i) ?? text.match(/([\d.,]{2,})\s?(?:€|eur)/i)
  if (!m) return null
  const n = Number(m[1].replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

function guessClientName(text: string): string {
  const m = text.match(/\b(?:ik ben|mijn naam is|this is|my name is)\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)?)/i)
  return m ? m[1].trim() : 'Nieuwe klant'
}

function fallbackReply(language: 'nl' | 'en', name: string): string {
  const greetName = name === 'Nieuwe klant' ? '' : ` ${name}`
  return language === 'nl'
    ? `Hoi${greetName},\n\nLeuk dat je contact opneemt! Ik heb even gekeken naar wat je zoekt en ik denk dat ik je goed kan helpen.\n\nOm een goed voorstel te kunnen maken heb ik nog een paar dingen nodig: kun je iets meer vertellen over je wensen, timing en budget?\n\nGroet,\nRick`
    : `Hi${greetName},\n\nThanks for reaching out! I'd love to help with this.\n\nCould you share a bit more about what you need, your timeline, and your budget so I can put together a proposal?\n\nBest,\nRick`
}

function fallbackExtraction(input: string): ClientIntakeDraft {
  const language = guessLanguage(input)
  const clientName = guessClientName(input)
  return {
    sourceText: input,
    language,
    clientName,
    email: extractEmail(input),
    matchedClientId: null,
    projectType: [],
    budgetGuess: extractBudget(input),
    deadlineGuess: null,
    deliverables: [],
    reply: fallbackReply(language, clientName),
    channelGuess: guessChannel(input),
    fromBrain: false,
  }
}

/** Pulls the first fenced ```json block (or the whole reply) and parses it. Returns null on any malformed output — callers fall back to the rule-based draft. */
function parseExtraction(raw: string): Record<string, unknown> | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : raw
  try {
    const parsed = JSON.parse(candidate.trim())
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : []
}

export const runClientIntakeAgent: Agent = async (input, ctx) => {
  const clientNames = ctx.store.clients.map((c) => c.name)

  const system = `Je bent het "Klant-intake" brein van HEYRA, voor Rick van Mierlo (PRJCT Agency, KvK 89078802, Geldrop/Eindhoven). Rick plakt een ruw klantbericht (WhatsApp, e-mail of Fiverr) en jij:
1. Herkent de taal: Nederlands voor lokale klanten, Engels voor Fiverr/internationale klanten.
2. Haalt klantnaam, e-mail, projecttype(n), budget- en deadline-indicaties eruit.
3. Stelt een deliverable/taken-opsplitsing voor, maar ALLEEN als er echt een project bedoeld wordt — bij een simpele prijsvraag laat je deliverables leeg.
4. Schrijft een antwoord in Rick's toon: persoonlijk, warm-professioneel, geen corporate jargon, korte alinea's, "je/jij" (nooit "u"), eindigend met "Groet,\\nRick" (of "Best,\\nRick" in het Engels). Sluit af met een concrete volgende stap of vraag.
5. Check of dit mogelijk een bestaande klant is uit deze lijst: ${clientNames.length ? clientNames.join(', ') : '(nog geen klanten bekend)'}. Vul "looksLikeExistingClient" ALLEEN met een naam die letterlijk in die lijst staat als je zeker weet dat het dezelfde klant is, anders null. Verzin nooit een naam die niet in de lijst staat.

Antwoord ALLEEN met een fenced \`\`\`json blok, geen andere tekst, exact dit schema (gebruik null waar iets niet bekend is):
{"language":"nl"|"en","clientName":string,"email":string|null,"projectType":string[],"budgetGuess":number|null,"deadlineGuess":string|null,"deliverables":string[],"reply":string,"looksLikeExistingClient":string|null}`

  const guess = await askBrain(system, `Klantbericht:\n"""\n${input}\n"""`, { maxTokens: 900, timeoutMs: 12000 })

  let draft: ClientIntakeDraft | null = null

  if (guess) {
    const parsed = parseExtraction(guess)
    const reply = parsed && typeof parsed.reply === 'string' ? parsed.reply.trim() : ''
    if (reply) {
      const claimedExisting = typeof parsed!.looksLikeExistingClient === 'string' ? parsed!.looksLikeExistingClient.trim().toLowerCase() : null
      const claimedName = typeof parsed!.clientName === 'string' ? parsed!.clientName.trim() : ''
      const matchTarget = claimedExisting || claimedName.toLowerCase()
      const matched = matchTarget ? ctx.store.clients.find((c) => c.name.trim().toLowerCase() === matchTarget) ?? null : null

      draft = {
        sourceText: input,
        language: parsed!.language === 'en' ? 'en' : 'nl',
        clientName: claimedName || guessClientName(input),
        email: typeof parsed!.email === 'string' && parsed!.email.trim() ? parsed!.email.trim() : extractEmail(input),
        matchedClientId: matched?.id ?? null,
        projectType: asStringArray(parsed!.projectType),
        budgetGuess: typeof parsed!.budgetGuess === 'number' ? parsed!.budgetGuess : extractBudget(input),
        deadlineGuess: typeof parsed!.deadlineGuess === 'string' ? parsed!.deadlineGuess : null,
        deliverables: asStringArray(parsed!.deliverables),
        reply,
        channelGuess: guessChannel(input),
        fromBrain: true,
      }
    }
  }

  if (!draft) draft = fallbackExtraction(input)

  return {
    text: draft.fromBrain
      ? `Klantbericht verwerkt${draft.matchedClientId ? ` — dit lijkt ${draft.clientName}, een bestaande klant` : ''}. Check de kaart, pas aan waar nodig, en zet 'm door naar de CRM.`
      : `Ik heb dit als klantbericht opgepakt (zonder brein beschikbaar — check en vul de kaart aan waar nodig).`,
    topic: 'domain',
    clientIntake: draft,
    entity: draft.clientName,
  }
}
