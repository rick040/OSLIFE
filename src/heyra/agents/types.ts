// ── HEYRA · agent contract ────────────────────────────────────────────────────
// Every agent under heyra/agents/ implements run(input, ctx) → AgentResult with
// this exact shape, so Heyra.tsx keeps rendering TaskCard/SearchResultCard/
// DataVizCard/ProjectCard exactly as it does today — only the routing changed.

import type { useStore } from '../../store'
import type { TaskDraft, Project, StructuredItem } from '../../types'
import type { SearchCardData, ChartCardData, ClientIntakeDraft } from '../cards'
import type { Topic } from '../suggestions'
import type { ConversationMemory } from '../memory'
import type { AgentId } from '../skills'

export type Store = ReturnType<typeof useStore.getState>

export interface AgentContext {
  store: Store
  memory: ConversationMemory
  /** The resolved classification for this message (domain/kind/sentiment/summary), built by routeMessage() before this agent ever runs — never a placeholder. */
  item: StructuredItem
}

export interface AgentResult {
  /** Empty string means "no confident answer" — the router falls through to chatAgent. */
  text: string
  topic: Topic
  draft?: TaskDraft
  search?: SearchCardData
  chart?: ChartCardData
  project?: Project
  clientIntake?: ClientIntakeDraft
  /** Updates memory.lastEntity when this exchange settled on a named project/client. */
  entity?: string | null
  /** True when the reply text came from the brain rather than the rule-based fallback. */
  fromBrain?: boolean
}

export type Agent = (input: string, ctx: AgentContext) => Promise<AgentResult>

export interface AgentDetection {
  agent: AgentId
  trigger: string | null
}
