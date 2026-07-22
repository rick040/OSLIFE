// ── HEYRA · dynamic action-card contract ─────────────────────────────────────
// Replaces the closed per-kind optional fields that used to live on Msg
// (Heyra.tsx) and AgentResult (agents/types.ts) — draft/search/chart/project/
// clientIntake/ideaDraft — with one generic shape any agent can populate and
// one generic component (ActionCardView) can render. Adding a new action kind
// is now a registry entry (registry.ts) + an ActionKind literal, not a new
// component + a new render block in Heyra.tsx.

import type { SearchCardData, ChartCardData } from '../cards'

export type ActionFieldType =
  | 'text'
  | 'longtext'
  | 'number'
  | 'currency'
  | 'date'
  | 'select'
  | 'boolean'
  | 'entity-ref'
  | 'list'

export interface ActionField {
  key: string
  label: string
  type: ActionFieldType
  value: unknown
  /** Set on mutating cards so ActionCardView can render a "sent → paid" style diff. */
  previousValue?: unknown
  /** Only meaningful for type: 'select'. */
  options?: string[]
  editable: boolean
  required?: boolean
}

/** A resolved target row — the thing an action reads or writes. */
export interface EntityRef {
  table: 'projects' | 'project_invoices' | 'clients' | 'tasks' | 'project_tasks' | 'project_activity'
  id: string
  /** Display name shown in the card header/chip, e.g. the project or client name. */
  label: string
}

export type ActionKind =
  | 'create_task'
  | 'update_task'
  | 'complete_task'
  | 'update_project_status'
  | 'log_project_activity'
  | 'mark_invoice_paid'
  | 'update_invoice_status'
  | 'create_invoice'
  | 'create_client'
  | 'update_client'
  | 'client_intake'
  | 'capture_idea'
  // Informational, non-mutating — no Confirm/Cancel footer.
  | 'search_result'
  | 'chart'
  | 'project_summary'

export type ActionCardStatus = 'proposed' | 'confirmed' | 'dispatched' | 'failed' | 'dismissed'

export type ActionRenderHint = 'diff' | 'list' | 'table' | 'chart' | 'summary'

export interface ActionCard {
  id: string
  kind: ActionKind
  /** Cache key for the card-template system (Phase 4) — usually just `kind`, occasionally `${kind}:${domain}` when a domain needs a different field set. */
  templateKey: string
  title: string
  description?: string | null
  /** The resolved target row. Null when unresolved — see `candidates`. */
  entity?: EntityRef | null
  /** Populated instead of `entity` when free text matched more than one plausible row — ActionCardView renders a disambiguation list. */
  candidates?: EntityRef[]
  fields: ActionField[]
  /** True → renders a Confirm/Cancel footer and requires a tap before any store write. Never bypassed, even after disambiguation. */
  mutating: boolean
  status: ActionCardStatus
  error?: string | null
  renderHint: ActionRenderHint
  /** renderHint: 'chart' — reuses the existing DataVizCard verbatim. */
  chartData?: ChartCardData | null
  /** renderHint: 'table' — reuses the existing SearchResultCard verbatim. */
  searchResults?: SearchCardData | null
  createdAt: string
}
