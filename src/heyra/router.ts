// ── HEYRA · agent router ──────────────────────────────────────────────────────
// Brain-first: every message goes through one combined askBrain() call that
// picks the handling agent AND classifies it (domain/kind/sentiment/summary) in
// a single round trip — real language understanding instead of substring luck.
// detectAgentRuleBased() (the old keyword pre-filter) plus understand.ts's
// classify() only kick in as the fallback when the brain call fails (offline,
// no ANTHROPIC_API_KEY, timeout) — HEYRA must never break without a brain.

import { detectSkill, SKILLS } from './skills'
import { classify, validateClassification, type Classification } from '../understand'
import { askBrain } from './brainClient'
import { parseBrainJson } from './brainJson'
import { transcript, type ConversationMemory } from './memory'
import { runTaskAgent } from './agents/taskAgent'
import { runProjectAgent } from './agents/projectAgent'
import { runChartAgent } from './agents/chartAgent'
import { runSearchAgent } from './agents/searchAgent'
import { runClientIntakeAgent } from './agents/clientIntakeAgent'
import { runFinanceAgent } from './agents/financeAgent'
import { runSignalAgent } from './agents/signalAgent'
import { runBriefingAgent } from './agents/briefingAgent'
import { runChatAgent } from './agents/chatAgent'
import type { AgentResult, Agent, Store } from './agents/types'
import type { AgentId } from './skills'
import type { StructuredItem } from '../types'

const OPEN_LOOP_RE = /open|owe|loop|todo|to do|klant|staat/
const BRIEFING_RE = /briefing|dagbriefing|hoe sta ik ervoor|samenvatting van (mijn )?dag|overzicht van (mijn )?dag/
const ENERGY_RE = /moe|slaap|energie|uitgeput|tired/
const MONEY_RE = /factuur|betaald|van dijk|geld|uitgaven|betalen/

const AGENTS: Record<AgentId, Agent> = {
  task: runTaskAgent,
  project: runProjectAgent,
  chart: runChartAgent,
  search: runSearchAgent,
  clientIntake: runClientIntakeAgent,
  finance: runFinanceAgent,
  signal: runSignalAgent,
  briefing: runBriefingAgent,
  chat: runChatAgent,
}

// Skills that get their own dedicated card/handling and therefore never open a
// loop themselves — everything else (chat, finance, signal, briefing) falls
// under the old "chat bucket" that detectSkill() used to gate openThread on.
const CAPTURE_ONLY_AGENTS: AgentId[] = ['task', 'project', 'chart', 'search', 'clientIntake']

/** The old keyword-scored router — now used only as the fallback when the brain is unavailable. */
export function detectAgentRuleBased(input: string): { agent: AgentId; trigger: string | null } {
  const pre = detectSkill(input)
  if (pre.skill !== 'chat') return { agent: pre.skill, trigger: pre.trigger }

  const t = input.toLowerCase()
  if (OPEN_LOOP_RE.test(t)) return { agent: 'chat', trigger: null }
  if (BRIEFING_RE.test(t)) return { agent: 'briefing', trigger: 'briefing' }
  if (ENERGY_RE.test(t)) return { agent: 'signal', trigger: 'energie' }
  if (MONEY_RE.test(t)) return { agent: 'finance', trigger: 'geld' }
  return { agent: 'chat', trigger: null }
}

const ROUTE_SYSTEM = `Je bent de intent- en classificatielaag van HEYRA (OSLIFE). Gegeven een berichttekst en het recente gesprek:

1. Kies EXACT één functie die het bericht het beste afhandelt uit:
${Object.values(SKILLS).map((s) => `- ${s.id}: ${s.blurb}`).join('\n')}
Let op: als het bericht een instructie bevat die een los geplakt stuk tekst omvat (klantbericht, mail, chatlog), negeer losse woorden die toevallig in dat geplakte stuk voorkomen (zoals "stuur" of "bellen" in de tekst van een klant zelf) — kijk naar Ricks ECHTE intentie, niet naar losse woorden.

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

  if (detection.agent === 'project' && !result.text) {
    result = await runChatAgent(input, agentCtx)
    return { agent: 'chat', trigger: null, result, item, openThread, fromBrain: detection.fromBrain }
  }

  return { agent: detection.agent, trigger: detection.trigger, result, item, openThread, fromBrain: detection.fromBrain }
}
