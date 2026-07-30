// ── HEYRA · propose a structured action from free text ──────────────────────
// Turns "factuur voor project Buurtkaart is betaald" into a confirm-ready
// ActionCard. The model's job is deliberately narrow — pick WHICH kind of
// action and WHICH entity was named — never to invent the actual data on the
// card. Entity resolution (resolveEntity.ts) and field values/previous values
// both come straight from live `store` data, matching the "no data, no
// invented series" honesty rule used throughout heyra/cards.ts. This also
// keeps the tool schema small and cheap: the FIELD SHAPE per kind is a fixed
// template (buildFields below), not something the model invents per call.
//
// Card-template caching: when `values` carries a key buildFields()'s baseline
// doesn't cover (e.g. a discount on an invoice), it's never silently dropped
// — withExtraFields() below always unions it onto the card — but its
// label/type only gets GUESSED once. Every later occurrence of that same key
// for the same kind reuses the cached label/type (card_templates table, via
// store.recordCardTemplateUsage) instead of re-guessing it, and seenCount
// tracks how often it recurs.

import { askBrainTool, type BrainTool } from '../brainClient'
import { resolveProject, resolveClient, resolveTask, resolveInvoiceForProject } from './resolveEntity'
import { resolveByRegistryKey } from '../contextRegistry'
import type { useStore } from '../../store'
import type { ActionCard, ActionField, ActionKind, CardTemplate, EntityRef } from './types'

type Store = ReturnType<typeof useStore.getState>

/** The subset of ActionKind this tool can propose — informational kinds (chart/search/project_summary) come from their own agents, and client_intake/capture_idea keep their existing bespoke draft flows. */
const PROPOSABLE_KINDS = [
  'create_task', 'update_task', 'complete_task',
  'update_project_status', 'log_project_activity',
  'complete_project_task', 'update_project_task', 'update_project_milestone',
  'mark_invoice_paid', 'update_invoice_status', 'create_invoice',
  'create_client', 'update_client',
] as const satisfies readonly ActionKind[]
type ProposableKind = (typeof PROPOSABLE_KINDS)[number]

type EntityTable = 'project' | 'client' | 'task' | 'invoice' | 'project_task' | 'project_milestone' | 'none'

/**
 * Which table each kind's entity lives in is intrinsic to the action itself
 * (mark_invoice_paid always targets an invoice) — deriving it here instead of
 * asking the model for it removes a whole class of possible model mistakes
 * (e.g. naming the project instead of the invoice) and keeps the tool schema
 * smaller. Kinds absent from this map (create_task, create_client) legitimately
 * have no target entity.
 */
const KIND_ENTITY_TABLE: Partial<Record<ProposableKind, EntityTable>> = {
  update_task: 'task',
  complete_task: 'task',
  update_project_status: 'project',
  log_project_activity: 'project',
  complete_project_task: 'project_task',
  update_project_task: 'project_task',
  update_project_milestone: 'project_milestone',
  mark_invoice_paid: 'invoice',
  update_invoice_status: 'invoice',
  create_invoice: 'project', // the project the new invoice belongs to
  update_client: 'client',
}

const PROPOSE_ACTION_TOOL: BrainTool = {
  name: 'propose_action',
  description:
    "Propose one concrete action HEYRA should take on Rick's own OSLIFE data, based on what he just said. Only call this when the message clearly describes something that happened or an instruction to change a record — never for a question or a vague remark.",
  input_schema: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: [...PROPOSABLE_KINDS] },
      title: { type: 'string', description: 'Short Dutch card title, e.g. "Factuur bijwerken"' },
      description: { type: 'string', description: 'One short Dutch sentence describing what will happen' },
      entityMention: {
        type: 'string',
        description: 'The exact free-text name Rick used for the project/client/task/invoice/project-task/project-milestone this action targets — verbatim from his message, never an id. Empty string for create_task/create_client, which have no target.',
      },
      values: {
        type: 'object',
        description: 'Only the NEW values Rick is asserting, keyed by field name (e.g. {"status":"paid"} or {"title":"Bel de klant terug","due":"2026-07-25","domain":"prjct"}). Do not include unchanged data.',
        additionalProperties: true,
      },
    },
    required: ['kind', 'title', 'entityMention', 'values'],
  },
}

const SYSTEM = `Je bent de actie-detectielaag van HEYRA (OSLIFE). Rick praat tegen je; als hij iets meldt dat een wijziging in zijn eigen data betekent — een factuur is betaald, een taak is klaar, een project is verplaatst naar een andere status, een nieuwe klant of taak moet worden aangemaakt, OF een voortgangsupdate op een lopend project (bv. "ik heb de preview naar de klant gestuurd", "het logo is af", "het telefoontje met Kim is geweest") — roep dan propose_action aan met de juiste kind.

Als Rick EXPLICIET één specifieke projecttaak of -mijlpaal noemt (een naam die duidelijk overeenkomt met een bestaande taak/mijlpaal van dat project, niet zomaar een algemene opmerking) en zegt dat die klaar is of aangepast moet worden: gebruik "complete_project_task" (taak is klaar), "update_project_task" (titel/datum/prioriteit van een taak aanpassen), of "update_project_milestone" (voortgang % of afronden van een mijlpaal). entityMention is dan de naam van de TAAK/MIJLPAAL zelf, niet het project. Bij twijfel welke taak/mijlpaal precies bedoeld wordt, of als het gewoon een algemene update is die niet overduidelijk één bestaande taak afvinkt: gebruik in plaats daarvan "log_project_activity" — dat is de veiligere route, want die zoekt zelf (en alleen bij een duidelijke match) naar de juiste taak/mijlpaal in plaats van er zelf een te moeten raden.

Voor een voortgangsupdate die niet expliciet een factuur/klant/taakveld noemt EN niet duidelijk één specifieke taak/mijlpaal is: gebruik kind "log_project_activity". entityMention is dan de naam van het PROJECT (niet de taak of het losse woord uit de update), values.body is Ricks update in zijn eigen woorden (bijna letterlijk overgenomen) — het systeem herkent daarna zelf of dit een bestaande taak of mijlpaal van dat project afrondt, jij hoeft dat niet zelf te bepalen.

Voor de overige kinds: entityMention is letterlijk de naam die Rick noemt voor het project/klant/taak/factuur, en values bevat alleen de nieuwe waarden. Verzin nooit een bedrag, datum of status die niet expliciet genoemd is. Als het bericht geen concrete actie beschrijft, roep de tool niet aan.`

interface RawProposal {
  kind: ProposableKind
  title: string
  description?: string
  entityMention: string
  values: Record<string, unknown>
}

function isProposableKind(v: unknown): v is ProposableKind {
  return typeof v === 'string' && (PROPOSABLE_KINDS as readonly string[]).includes(v)
}

function field(key: string, label: string, type: ActionField['type'], value: unknown, opts: Partial<ActionField> = {}): ActionField {
  return { key, label, type, value, editable: true, ...opts }
}

/** First-time guess at a label/type for a values-key buildFields() doesn't already cover — only ever used once per key per kind; every later occurrence reuses whatever card_templates cached from the first guess (see withExtraFields). */
function guessFieldMeta(key: string, value: unknown): { label: string; type: ActionField['type'] } {
  const label = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
  if (typeof value === 'number') return { label, type: 'number' }
  if (typeof value === 'boolean') return { label, type: 'boolean' }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return { label, type: 'date' }
  return { label, type: 'text' }
}

/**
 * Unions any `values` key the baseline template doesn't cover onto the card
 * (never silently dropped) and resolves each one's label/type from the
 * cached template when it's recurred before, falling back to a one-time
 * guess otherwise. Returns which keys were newly seen/reused so the caller
 * can persist the (possibly updated) cache — cheap, no store write on the
 * common case where nothing extra was said.
 */
function withExtraFields(
  kind: ProposableKind,
  values: Record<string, unknown>,
  baseline: ActionField[],
  cached: CardTemplate | undefined,
): { fields: ActionField[]; seen: { key: string; label: string; type: ActionField['type'] }[] } {
  const covered = new Set(baseline.map((f) => f.key))
  const extraKeys = Object.keys(values).filter((k) => !covered.has(k))
  if (!extraKeys.length) return { fields: baseline, seen: [] }

  const seen: { key: string; label: string; type: ActionField['type'] }[] = []
  const extraFields = extraKeys.map((key) => {
    const remembered = cached?.extraFields.find((f) => f.key === key)
    const { label, type } = remembered ?? guessFieldMeta(key, values[key])
    seen.push({ key, label, type })
    return field(key, label, type, values[key])
  })
  return { fields: [...baseline, ...extraFields], seen }
}

/** Builds the ActionCard's fields from LIVE store data + the model's proposed new values — never from model-guessed current state. One builder per proposable kind, mirroring registry.ts's one-handler-per-kind shape. Returns null when a required entity/value is missing. */
function buildFields(
  kind: ProposableKind,
  store: Store,
  entity: EntityRef | null,
  values: Record<string, unknown>,
): ActionField[] | null {
  switch (kind) {
    case 'create_task': {
      const title = values.title
      if (typeof title !== 'string' || !title.trim()) return null
      return [
        field('title', 'Titel', 'text', title),
        field('domain', 'Domein', 'select', values.domain ?? 'cross'),
        field('due', 'Datum', 'date', values.due ?? null),
        field('priority', 'Prioriteit', 'select', values.priority ?? 'Medium', { options: ['High', 'Medium', 'Low'] }),
      ]
    }
    case 'update_task':
    case 'complete_task': {
      if (!entity) return null
      const t = store.threads.find((x) => x.id === entity.id)
      if (!t) return null
      if (kind === 'complete_task') {
        return [field('status', 'Status', 'select', 'closed', { previousValue: t.status, editable: false })]
      }
      const fields: ActionField[] = []
      if ('title' in values) fields.push(field('title', 'Titel', 'text', values.title, { previousValue: t.title }))
      if ('due' in values) fields.push(field('due', 'Datum', 'date', values.due, { previousValue: t.due }))
      if ('status' in values) fields.push(field('status', 'Status', 'select', values.status, { previousValue: t.status }))
      return fields.length ? fields : null
    }
    case 'update_project_status': {
      if (!entity) return null
      const p = store.projects.find((x) => x.id === entity.id)
      if (!p || typeof values.status !== 'string') return null
      return [field('status', 'Status', 'select', values.status, {
        previousValue: p.status,
        options: ['lead', 'active', 'review', 'blocked', 'done'],
      })]
    }
    case 'log_project_activity': {
      if (!entity) return null
      const body = values.body
      if (typeof body !== 'string' || !body.trim()) return null
      return [field('body', 'Activiteit', 'longtext', body)]
    }
    case 'complete_project_task': {
      if (!entity) return null
      const t = store.projectTasks.find((x) => x.id === entity.id)
      if (!t) return null
      // previousValue/editable mirror complete_task's pattern exactly — the
      // dispatch handler (registry.ts) calls store.toggleProjectTask(id, true),
      // which itself handles recurrence (a recurring task rolls its due date
      // forward instead of just flipping done), so this card only confirms
      // the intent, never the mechanics.
      return [field('done', 'Status', 'boolean', true, { previousValue: t.done, editable: false })]
    }
    case 'update_project_task': {
      if (!entity) return null
      const t = store.projectTasks.find((x) => x.id === entity.id)
      if (!t) return null
      const fields: ActionField[] = []
      if ('name' in values) fields.push(field('name', 'Titel', 'text', values.name, { previousValue: t.name }))
      if ('dueDate' in values) fields.push(field('dueDate', 'Datum', 'date', values.dueDate, { previousValue: t.dueDate }))
      if ('priority' in values) {
        fields.push(field('priority', 'Prioriteit', 'select', values.priority, { previousValue: t.priority, options: ['High', 'Medium', 'Low'] }))
      }
      return fields.length ? fields : null
    }
    case 'update_project_milestone': {
      if (!entity) return null
      const m = store.projectMilestones.find((x) => x.id === entity.id)
      if (!m) return null
      const fields: ActionField[] = []
      if ('done' in values) fields.push(field('done', 'Status', 'boolean', values.done, { previousValue: m.done }))
      if ('progress' in values) fields.push(field('progress', 'Voortgang', 'number', values.progress, { previousValue: m.progress }))
      if ('dueDate' in values) fields.push(field('dueDate', 'Datum', 'date', values.dueDate, { previousValue: m.dueDate }))
      return fields.length ? fields : null
    }
    case 'mark_invoice_paid': {
      if (!entity) return null
      const inv = store.projectInvoices.find((x) => x.id === entity.id)
      if (!inv) return null
      return [
        field('status', 'Status', 'select', 'paid', { previousValue: inv.status, editable: false }),
        field('amount', 'Bedrag', 'currency', inv.amount, { editable: false }),
        ...(inv.dueOn ? [field('dueOn', 'Vervaldatum', 'date', inv.dueOn, { editable: false })] : []),
      ]
    }
    case 'update_invoice_status': {
      if (!entity) return null
      const inv = store.projectInvoices.find((x) => x.id === entity.id)
      if (!inv || typeof values.status !== 'string') return null
      return [field('status', 'Status', 'select', values.status, {
        previousValue: inv.status,
        options: ['draft', 'sent', 'paid', 'overdue'],
      })]
    }
    case 'create_invoice': {
      if (!entity) return null // the project this invoice belongs to
      if (typeof values.amount !== 'number' && typeof values.amount !== 'string') return null
      return [
        field('number', 'Factuurnummer', 'text', values.number ?? ''),
        field('amount', 'Bedrag', 'currency', Number(values.amount) || 0),
        field('dueOn', 'Vervaldatum', 'date', values.dueOn ?? null),
        field('note', 'Notitie', 'longtext', values.note ?? null),
      ]
    }
    case 'create_client': {
      const name = values.name
      if (typeof name !== 'string' || !name.trim()) return null
      return [
        field('name', 'Naam', 'text', name),
        field('domain', 'Domein', 'select', values.domain ?? 'prjct'),
        field('clientStatus', 'Status', 'select', values.clientStatus ?? 'Lead', {
          options: ['Active', 'Lead', 'Prospect', 'Planned', 'Inactive', 'Past'],
        }),
        field('email', 'E-mail', 'text', values.email ?? null),
      ]
    }
    case 'update_client': {
      if (!entity) return null
      const c = store.clients.find((x) => x.id === entity.id)
      if (!c) return null
      const fields: ActionField[] = []
      if ('clientStatus' in values) fields.push(field('clientStatus', 'Status', 'select', values.clientStatus, { previousValue: c.clientStatus }))
      if ('email' in values) fields.push(field('email', 'E-mail', 'text', values.email, { previousValue: c.email }))
      if ('website' in values) fields.push(field('website', 'Website', 'text', values.website, { previousValue: c.website }))
      return fields.length ? fields : null
    }
  }
}

/**
 * Resolves the entity a proposal refers to, hierarchically for invoices
 * (project first, then invoices scoped to it — see resolveEntity.ts).
 * project_task/project_milestone go through the context registry
 * (contextRegistry.ts) instead of another hand-written branch here — see
 * that file's header comment for why project/client/task/invoice stay
 * hand-wired while these two don't.
 */
function resolveMentionedEntity(table: EntityTable, mention: string, store: Store): { entity: EntityRef | null; candidates: EntityRef[] } {
  if (table === 'none' || !mention.trim()) return { entity: null, candidates: [] }
  if (table === 'project') return resolveProject(mention, store)
  if (table === 'client') return resolveClient(mention, store)
  if (table === 'task') return resolveTask(mention, store)
  if (table === 'project_task') return resolveByRegistryKey('project_tasks', mention, store) ?? { entity: null, candidates: [] }
  if (table === 'project_milestone') return resolveByRegistryKey('project_milestones', mention, store) ?? { entity: null, candidates: [] }
  // invoice: resolve the project first so invoice ambiguity never compounds with project ambiguity.
  const project = resolveProject(mention, store)
  if (project.entity) return resolveInvoiceForProject(mention, project.entity.id, store)
  // Project itself unresolved/ambiguous — surface that instead of guessing an invoice.
  return project
}

/**
 * Proposes one ActionCard from free text, or null when the brain is
 * unavailable, didn't call the tool (nothing actionable), or the proposal
 * didn't have enough to build a real card. Null-safe like askBrain()/
 * askBrainTool() — callers should treat null as "no action to propose", not
 * an error.
 */
export async function proposeAction(input: string, store: Store): Promise<ActionCard | null> {
  const toolUse = await askBrainTool(SYSTEM, input, PROPOSE_ACTION_TOOL, { maxTokens: 400 })
  if (!toolUse || toolUse.name !== 'propose_action') return null

  const raw = toolUse.input as Partial<RawProposal>
  if (!isProposableKind(raw.kind)) return null
  if (typeof raw.title !== 'string' || !raw.title.trim()) return null
  const values = raw.values && typeof raw.values === 'object' ? raw.values : {}

  const entityTable = KIND_ENTITY_TABLE[raw.kind] // undefined → 'none', no entity needed (create_task/create_client)
  const entityRequired = entityTable !== undefined
  const { entity, candidates } = resolveMentionedEntity(entityTable ?? 'none', raw.entityMention ?? '', store)

  if (entityRequired && !entity && candidates.length === 0) return null

  const fields = entity ? buildFields(raw.kind, store, entity, values) : entityRequired ? null : buildFields(raw.kind, store, null, values)
  if (!fields && candidates.length === 0) return null

  // Union any values-key the baseline template didn't cover onto the card —
  // never silently dropped — reusing a cached label/type when this key has
  // recurred before for this kind (see withExtraFields).
  let finalFields = fields ?? []
  if (fields) {
    const cached = store.cardTemplates.find((t) => t.templateKey === raw.kind)
    const { fields: withExtra, seen } = withExtraFields(raw.kind, values, fields, cached)
    finalFields = withExtra
    if (seen.length) store.recordCardTemplateUsage(raw.kind, raw.kind, seen)
  }

  const hasDiff = finalFields.some((f) => f.previousValue !== undefined && f.previousValue !== f.value)

  return {
    id: crypto.randomUUID(),
    kind: raw.kind,
    templateKey: raw.kind,
    title: raw.title.trim(),
    description: raw.description?.trim() || null,
    entity,
    candidates: candidates.length ? candidates : undefined,
    fields: finalFields,
    mutating: true,
    status: 'proposed',
    renderHint: hasDiff ? 'diff' : 'list',
    createdAt: new Date().toISOString(),
  }
}
