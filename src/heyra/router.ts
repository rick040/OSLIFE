// ── HEYRA · agent router ──────────────────────────────────────────────────────
// Replaces the inline if/else chain that used to live in Heyra.tsx#send(). Keeps
// detectSkill() (heyra/skills.ts) as the instant, offline-safe pre-filter for
// task/project/chart/search, then reproduces the exact trigger order the old
// answer() used inside the remaining "chat" bucket (open-loops > energy/signal
// > money/finance > task/vent/generic in chatAgent), with one addition: an
// explicit "briefing" trigger ahead of energy. No LLM call is needed to choose
// an agent — the keyword pre-filter is already precise enough; the brain is
// spent inside the agents themselves (finance/signal/project), where grounded
// synthesis actually adds value.

import { detectSkill } from './skills'
import { runTaskAgent } from './agents/taskAgent'
import { runProjectAgent } from './agents/projectAgent'
import { runChartAgent } from './agents/chartAgent'
import { runSearchAgent } from './agents/searchAgent'
import { runClientIntakeAgent } from './agents/clientIntakeAgent'
import { runFinanceAgent } from './agents/financeAgent'
import { runSignalAgent } from './agents/signalAgent'
import { runBriefingAgent } from './agents/briefingAgent'
import { runChatAgent } from './agents/chatAgent'
import type { AgentContext, AgentResult, Agent } from './agents/types'
import type { AgentId } from './skills'

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

/** Decide which agent should handle this message — mirrors the trigger precedence Heyra.tsx used to hardcode. */
export function detectAgent(input: string): { agent: AgentId; trigger: string | null } {
  const pre = detectSkill(input)
  if (pre.skill !== 'chat') return { agent: pre.skill, trigger: pre.trigger }

  const t = input.toLowerCase()
  if (OPEN_LOOP_RE.test(t)) return { agent: 'chat', trigger: null }
  if (BRIEFING_RE.test(t)) return { agent: 'briefing', trigger: 'briefing' }
  if (ENERGY_RE.test(t)) return { agent: 'signal', trigger: 'energie' }
  if (MONEY_RE.test(t)) return { agent: 'finance', trigger: 'geld' }
  return { agent: 'chat', trigger: null }
}

/** Route + run. If the project agent comes back empty (no match), falls through to chatAgent — same behavior as the old inline `if (project) {...} // else fall through`. */
export async function routeMessage(input: string, ctx: AgentContext): Promise<{ agent: AgentId; trigger: string | null; result: AgentResult }> {
  const detection = detectAgent(input)
  let result = await AGENTS[detection.agent](input, ctx)

  if (detection.agent === 'project' && !result.text) {
    result = await runChatAgent(input, ctx)
    return { agent: 'chat', trigger: null, result }
  }

  return { ...detection, result }
}
