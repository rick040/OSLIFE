// ── HEYRA agent · Assistent (vrije kennis & maakwerk) ─────────────────────────
// The chatAgent (memoryContext) is deliberately locked to Rick's own OSLIFE data
// and refuses anything outside the snapshot — right for "hoe ziet mijn week
// eruit", wrong for "leg X uit" or "schrijf een skill voor me". This agent is the
// missing half: a full general-purpose assistant *inside* Life OS, so Rick no
// longer has to leave for claude.ai to ask a general question, draft an email,
// write a skill/prompt, brainstorm or get an explanation. It answers from the
// model's own knowledge, and folds in a light personal context (learned facts +
// the running conversation) so replies stay personal without pretending to have
// live access to anything it doesn't. Brain-first, like every other agent: on any
// brain failure it returns a short honest fallback and never throws.

import { askBrain } from '../brainClient'
import { transcript } from '../memory'
import { renderLearnedFacts } from '../learning'
import type { Agent } from './types'

export const ASSISTANT_SYSTEM_PROMPT =
  `Je bent HEYRA in assistent-modus — een volwaardige, capabele AI-assistent (zoals Claude) die binnen OSLIFE (Life OS) leeft. ` +
  `Rick gebruikt je hier zodat hij NIET meer naar claude.ai hoeft: beantwoord open vragen, leg dingen uit, brainstorm mee, schrijf teksten/e-mails/berichten, stel prompts of "skills" (instructie-documenten in Markdown) op, help met code, en denk strategisch mee. ` +
  `Put vrij uit je eigen kennis — je bent hier NIET beperkt tot Ricks opgeslagen data (dat doet de geheugen-modus al). ` +
  `Je krijgt soms een klein blokje persoonlijke context (wat HEYRA over Rick heeft geleerd + het lopende gesprek); gebruik dat om je toon en antwoord passend te maken, maar leun er niet op als de vraag algemeen is. ` +
  `Doe niet alsof je live toegang hebt tot zijn claude.ai-account, e-mail, agenda of andere systemen die je niet hebt — als je iets niet kunt zien, zeg dat kort en bied aan wat je wél kunt doen. ` +
  `Schrijf standaard Nederlands en informeel, direct en bruikbaar; als Rick in een andere taal schrijft, volg die taal. ` +
  `Wees zo lang als nodig maar niet langer: een korte vraag krijgt een kort antwoord, een schrijfopdracht krijgt het volledige stuk.`

export const runAssistantAgent: Agent = async (input, ctx) => {
  const { store, memory } = ctx

  const learned = renderLearnedFacts(store.learnedFacts)
  const contextParts = [
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
