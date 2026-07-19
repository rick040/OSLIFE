// ── HEYRA agent · Assistent (vrije kennis & maakwerk, nu wél gegrond) ─────────
// The chatAgent (memoryContext) is deliberately locked to Rick's own OSLIFE data
// and refuses anything outside the snapshot — right for "hoe ziet mijn week
// eruit", wrong for "leg X uit" or "schrijf een skill voor me". This agent is the
// missing half: a full general-purpose assistant *inside* Life OS, so Rick no
// longer has to leave for claude.ai to ask a general question, draft an email,
// write a skill/prompt, brainstorm or get an explanation.
//
// It now ALSO gets the same real-data grounding chatAgent uses (the memory
// snapshot + semantic/graph recall) — the two agents used to split "your real
// data" and "reasoned prose" between them, so "schrijf een follow-up mail over
// het te late website-project" produced a generic template with placeholders
// instead of using the real client name/deadline sitting in the store. It's
// still a full general-purpose assistant for anything unrelated to Rick's own
// data — the system prompt is explicit that the snapshot is there to use WHEN
// relevant, not a constraint like chatAgent's. Brain-first, like every other
// agent: on any brain failure it returns a short honest fallback and never
// throws.

import { askBrain } from '../brainClient'
import { transcript } from '../memory'
import { renderLearnedFacts } from '../learning'
import { buildMemorySnapshot, buildRecallSection } from './memoryContext'
import type { Agent } from './types'

export const ASSISTANT_SYSTEM_PROMPT =
  `Je bent HEYRA in assistent-modus — een volwaardige, capabele AI-assistent (zoals Claude) die binnen OSLIFE (Life OS) leeft. ` +
  `Rick gebruikt je hier zodat hij NIET meer naar claude.ai hoeft: beantwoord open vragen, leg dingen uit, brainstorm mee, schrijf teksten/e-mails/berichten, stel prompts of "skills" (instructie-documenten in Markdown) op, help met code, en denk strategisch mee. ` +
  `Je bent hier NIET beperkt tot algemene kennis: je krijgt ook een echte momentopname van Ricks OSLIFE-data (open loops, projecten, klanten, betalingen, mijlpalen) en soms relevante herinneringen uit het geheugen. GEBRUIK die echte gegevens zodra de vraag erom vraagt — bv. een follow-up e-mail over een specifiek project gebruikt de echte klantnaam en deadline uit de momentopname, geen placeholder. Verzin nooit een naam, bedrag of datum die niet in de gegeven data staat; ontbreekt iets, zeg dat kort en vraag door of vul het generiek in. ` +
  `Voor vragen die niets met Ricks eigen data te maken hebben (uitleg, brainstorm, code, algemene kennis) put je gewoon vrij uit je eigen kennis, zoals altijd — de momentopname is dan gewoon niet relevant en mag genegeerd worden. ` +
  `Je krijgt ook een klein blokje persoonlijke context (wat HEYRA over Rick heeft geleerd + het lopende gesprek); gebruik dat om je toon en antwoord passend te maken. ` +
  `Doe niet alsof je live toegang hebt tot zijn claude.ai-account, e-mail, agenda of andere systemen die je niet hebt — als je iets niet kunt zien, zeg dat kort en bied aan wat je wél kunt doen. ` +
  `Schrijf standaard Nederlands en informeel, direct en bruikbaar; als Rick in een andere taal schrijft, volg die taal. ` +
  `Wees zo lang als nodig maar niet langer: een korte vraag krijgt een kort antwoord, een schrijfopdracht krijgt het volledige stuk.`

export const runAssistantAgent: Agent = async (input, ctx) => {
  const { store, memory } = ctx

  const learned = renderLearnedFacts(store.learnedFacts)
  const snapshot = buildMemorySnapshot(store)
  const recall = await buildRecallSection(input)
  const contextParts = [
    `Momentopname van OSLIFE (gebruik als relevant, negeer anders):\n${snapshot}`,
    recall || null,
    learned || null,
    memory.turns.length ? `Lopende gesprek:\n${transcript(memory)}` : null,
  ].filter(Boolean)
  const context = contextParts.length ? `${contextParts.join('\n\n')}\n\n` : ''

  const brainText = await askBrain(
    ASSISTANT_SYSTEM_PROMPT,
    `${context}Vraag/opdracht van Rick:\n"""\n${input}\n"""`,
    { maxTokens: 1200 },
  )

  return {
    text:
      brainText ??
      'Ik kan die nu even niet beantwoorden — mijn brein is onbereikbaar (offline of geen API-sleutel ingesteld). Probeer het zo nog eens.',
    topic: 'generic',
    fromBrain: !!brainText,
  }
}
