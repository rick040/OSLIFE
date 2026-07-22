// ── HEYRA · agent router ──────────────────────────────────────────────────────
// Brain-first: every message goes through one combined askBrain() call that
// picks the handling agent AND classifies it (domain/kind/sentiment/summary) in
// a single round trip — real language understanding instead of substring luck.
// detectAgentRuleBased() (the old keyword pre-filter) plus understand.ts's
// classify() only kick in as the fallback when the brain call fails (offline,
// no ANTHROPIC_API_KEY, timeout) — HEYRA must never break without a brain.

import { detectSkill, isOpenLoopQuery, SKILLS } from './skills'
import { classify, validateClassification, type Classification } from '../understand'
import { askBrain } from './brainClient'
import { parseBrainJson } from './brainJson'
import { transcript, type ConversationMemory } from './memory'
import { runTaskAgent } from './agents/taskAgent'
import { runProjectAgent } from './agents/projectAgent'
import { runChartAgent } from './agents/chartAgent'
import { runSearchAgent } from './agents/searchAgent'
import { runClientIntakeAgent } from './agents/clientIntakeAgent'
import { runIdeaAgent } from './agents/ideaAgent'
import { runFinanceAgent } from './agents/financeAgent'
import { runSignalAgent } from './agents/signalAgent'
import { runBriefingAgent } from './agents/briefingAgent'
import { runChatAgent } from './agents/chatAgent'
import { runAssistantAgent } from './agents/assistantAgent'
import { proposeAction } from './actions/proposeAction'
import type { AgentResult, Agent, Store } from './agents/types'
import type { AgentId } from './skills'
import type { StructuredItem } from '../types'

// A message classified as a transaction ("de factuur is betaald") or an event
// ("project X is klaar") plausibly describes something HEYRA should act on —
// everything else (notes, vents, links, questions) never triggers the extra
// propose_action brain call, so this stays cheap on the common case.
const ACTION_TRIGGER_KINDS: StructuredItem['kind'][] = ['transaction', 'event']

const BRIEFING_RE = /briefing|dagbriefing|hoe sta ik ervoor|samenvatting van (mijn )?dag|overzicht van (mijn )?dag/
const ENERGY_RE = /moe|slaap|energie|uitgeput|tired/
// No vendor/client names belong in shared routing logic — this used to hardcode
// a specific payee ('van dijk'), which both leaked test data into the fallback
// path and couldn't generalize to any other vendor.
const MONEY_RE = /factuur|betaald|geld|uitgaven|betalen/

const AGENTS: Record<AgentId, Agent> = {
  task: runTaskAgent,
  project: runProjectAgent,
  chart: runChartAgent,
  search: runSearchAgent,
  clientIntake: runClientIntakeAgent,
  idea: runIdeaAgent,
  finance: runFinanceAgent,
  signal: runSignalAgent,
  briefing: runBriefingAgent,
  chat: runChatAgent,
  assistant: runAssistantAgent,
}

// Skills that get their own dedicated card/handling and therefore never open a
// loop themselves — everything else (chat, finance, signal, briefing) falls
// under the old "chat bucket" that detectSkill() used to gate openThread on.
// `assistant` joins them: a general/creative question ("leg X uit", "schrijf een
// skill") is not a life-loop and must never pollute Rick's open loops — it's
// still captured, just without opening a thread. `idea` gets its own lifecycle
// entirely in Strategie HQ (business_ideas), so it doesn't open one either.
const CAPTURE_ONLY_AGENTS: AgentId[] = ['task', 'project', 'chart', 'search', 'clientIntake', 'idea', 'assistant']

/** The old keyword-scored router — now used only as the fallback when the brain is unavailable. */
export function detectAgentRuleBased(input: string): { agent: AgentId; trigger: string | null } {
  const pre = detectSkill(input)
  if (pre.skill !== 'chat') return { agent: pre.skill, trigger: pre.trigger }

  const t = input.toLowerCase()
  if (isOpenLoopQuery(input)) return { agent: 'chat', trigger: null }
  if (BRIEFING_RE.test(t)) return { agent: 'briefing', trigger: 'briefing' }
  if (ENERGY_RE.test(t)) return { agent: 'signal', trigger: 'energie' }
  if (MONEY_RE.test(t)) return { agent: 'finance', trigger: 'geld' }
  return { agent: 'chat', trigger: null }
}

const ROUTE_SYSTEM = `Je bent de intent- en classificatielaag van HEYRA (OSLIFE). Gegeven een berichttekst en het recente gesprek:

1. Kies EXACT één functie die het bericht het beste afhandelt uit:
${Object.values(SKILLS).map((s) => `- ${s.id}: ${s.blurb}`).join('\n')}
Let op: als het bericht een instructie bevat die een los geplakt stuk tekst omvat (klantbericht, mail, chatlog), negeer losse woorden die toevallig in dat geplakte stuk voorkomen (zoals "stuur" of "bellen" in de tekst van een klant zelf) — kijk naar Ricks ECHTE intentie, niet naar losse woorden.

Onderscheid chat vs assistant scherp:
- chat = vragen die ALLEEN uit Ricks eigen opgeslagen leven/data te beantwoorden zijn (zijn projecten, loops, betalingen, agenda, gewoontes) — bv. "hoe ziet mijn week eruit?", "wat staat er open bij Buurtkaart?".
- assistant = algemene kennis, uitleg, brainstorm, advies, of maakwerk dat NIET uit zijn opgeslagen data komt — bv. "leg X uit", "schrijf een e-mail/skill/prompt voor me", "hoe pak ik Y aan?", "help me met deze code". Kies assistant zodra het antwoord van algemene kennis of schrijf-/denkwerk afhangt in plaats van van Ricks eigen rijen.

2. Classificeer het bericht zelf:
- domain: parkingyou, prjct, buurtkaart, personal, of cross
- kind: task, note, vent, link, voice, transaction, event, health, email, of idea
- sentiment: positive, neutral, negative, of stressed
- summary: korte natuurlijke samenvatting (max ~12 woorden), geen letterlijke kopie

Antwoord ALLEEN met een fenced \`\`\`json blok, geen andere tekst:
{"agent":"...","reason":"<max 6 woorden>","domain":"...","kind":"...","sentiment":"...","summary":"..."}`

interface BrainRouteResult {
  agent: AgentId
  trigger: string | null
  classification: Classification
}

async function resolveWithBrain(input: string, memory: ConversationMemory): Promise<BrainRouteResult | null> {
  const guess = await askBrain(
    ROUTE_SYSTEM,
    `Gesprek tot nu toe:\n${transcript(memory)}\n\nNieuw bericht:\n"""\n${input}\n"""`,
    { maxTokens: 250, timeoutMs: 4000 },
  )
  if (!guess) return null

  const parsed = parseBrainJson(guess)
  if (!parsed) return null

  const agent = typeof parsed.agent === 'string' ? (parsed.agent as AgentId) : null
  if (!agent || !(agent in AGENTS)) return null

  const classification = validateClassification(parsed)
  if (!classification) return null

  const reason = typeof parsed.reason === 'string' && parsed.reason.trim() ? parsed.reason.trim() : null
  return { agent, trigger: reason, classification }
}

/** Brain-first agent + classification decision, falling back to the rule-based router on any failure. */
export async function detectAgent(
  input: string,
  memory: ConversationMemory,
): Promise<{ agent: AgentId; trigger: string | null; classification: Classification; fromBrain: boolean }> {
  const brainGuess = await resolveWithBrain(input, memory)
  if (brainGuess) return { ...brainGuess, fromBrain: true }

  const ruleBased = detectAgentRuleBased(input)
  return { ...ruleBased, classification: classify(input, 'chat'), fromBrain: false }
}

/**
 * Route + run. Resolves the agent and its classification together (never a
 * placeholder item — chatAgent branches on item.kind/item.sentiment before it
 * ever reaches its own brain call, so a stale classification could produce a
 * wrong canned reply with no later correction). Fires the capture() write with
 * the already-known classification so it doesn't spend a second brain call
 * re-classifying the same text.
 */
export async function routeMessage(
  input: string,
  ctx: { store: Store; memory: ConversationMemory },
): Promise<{
  agent: AgentId
  trigger: string | null
  result: AgentResult
  item: StructuredItem
  openThread: boolean
  fromBrain: boolean
}> {
  const detection = await detectAgent(input, ctx.memory)
  const openThread = !CAPTURE_ONLY_AGENTS.includes(detection.agent)

  const item: StructuredItem = {
    id: crypto.randomUUID(),
    text: input,
    source: 'chat',
    createdAt: new Date().toISOString(),
    ...detection.classification,
  }

  void ctx.store.capture(input, 'chat', { openThread }, detection.classification)

  const agentCtx = { store: ctx.store, memory: ctx.memory, item }
  let result = await AGENTS[detection.agent](input, agentCtx)

  let agent = detection.agent
  let trigger = detection.trigger
  if (detection.agent === 'project' && !result.text) {
    result = await runChatAgent(input, agentCtx)
    agent = 'chat'
    trigger = null
  }

  // Independent of which agent answered conversationally: a transaction/event
  // classification may ALSO describe a concrete action HEYRA can propose
  // (mark an invoice paid, close a task, ...) — attach it alongside whatever
  // the agent already said rather than replacing it.
  if (ACTION_TRIGGER_KINDS.includes(item.kind)) {
    const card = await proposeAction(input, ctx.store)
    if (card) result = { ...result, cards: [...(result.cards ?? []), card] }
  }

  return { agent, trigger, result, item, openThread, fromBrain: detection.fromBrain }
}
