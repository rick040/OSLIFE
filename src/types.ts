// ── Core domain model for OSLIFE ─────────────────────────────────────────────

export type Domain = 'parkingyou' | 'prjct' | 'buurtkaart' | 'personal' | 'cross'

export type ItemKind =
  | 'task'
  | 'note'
  | 'vent'
  | 'link'
  | 'voice'
  | 'transaction'
  | 'event'
  | 'health'
  | 'email'
  | 'idea'

export type Sentiment = 'positive' | 'neutral' | 'negative' | 'stressed'

export type CaptureSource = 'capture' | 'chat' | 'voice' | 'link' | 'task' | 'sense'

/** Layer 1 output: a raw, undifferentiated item. */
export interface RawItem {
  id: string
  text: string
  source: CaptureSource
  createdAt: string // ISO
}

/** Layer 2 output: a structured, findable, domain-tagged record. */
export interface StructuredItem extends RawItem {
  domain: Domain
  kind: ItemKind
  sentiment: Sentiment
  summary: string
}

// ── Braindump v2: universal capture → Markdown log ───────────────────────────

/** What kind of thing was shared/captured — drives the ingest branch + grid icon. */
export type BraindumpSourceKind =
  | 'text'
  | 'link'
  | 'image'
  | 'pdf'
  | 'youtube'
  | 'instagram'
  | 'pinterest'
  | 'video'
  | 'audio'
  | 'file'

export type BraindumpStatus = 'pending' | 'processing' | 'ready' | 'failed'

/**
 * One saved braindump item. Inserted `pending` the instant it's shared, then
 * enriched (markdown/summary/domain/kind/tags/thumb) to `ready` by the
 * braindump-ingest edge function (and the worker for media). `markdown` is the
 * lightweight "MD file" that Heyra and OSLife read as context.
 */
export interface BraindumpEntry {
  id: string
  createdAt: string // ISO
  sourceKind: BraindumpSourceKind
  status: BraindumpStatus
  title: string | null
  sourceUrl: string | null
  markdown: string | null
  summary: string | null
  domain: Domain | null
  kind: ItemKind | null
  sentiment: Sentiment | null
  tags: string[]
  thumbUrl: string | null
  meta: Record<string, unknown>
  error: string | null
}

/** Raw payload the share sheet / capture box hands to store.braindumpCapture(). */
export interface BraindumpInput {
  sourceKind: BraindumpSourceKind
  title?: string | null
  sourceUrl?: string | null
  /** Plain text (selected text / a pasted note) when there's no file/url. */
  text?: string | null
  /** Storage path of an already-uploaded file (image/pdf/media). */
  storagePath?: string | null
  /** Optional user hint at capture time. */
  domain?: Domain | null
}

// ── Layer 3: REMEMBER (three separate stores) ────────────────────────────────

export interface Essential {
  id: string
  domain: Domain
  label: string
  value: string
}

export interface Thread {
  id: string
  domain: Domain
  title: string
  owedTo: string // who it's owed to / from
  due: string | null // ISO date
  status: 'open' | 'closed'
  createdAt: string
}

export interface Pattern {
  id: string
  domain: Domain
  text: string
  confidence: number // 0..1
  lastReinforced: string // ISO date
  trend?: 'up' | 'down' | 'flat'
}

// ── Event spine · universal metadata envelope (PM-201 Slice 0) ────────────────
// The life-domain axis is distinct from the business `Domain` above: `Domain`
// tags which venture a record belongs to (parkingyou/prjct/…); `LifeDomain`
// tags which life area a signal feeds (health/finance/…). One signal can carry
// several LifeDomains (signal multiplexing).

export type LifeDomain =
  | 'health'
  | 'finance'
  | 'work'
  | 'relationships'
  | 'home_admin'
  | 'behaviour'
  | 'pet'
  | 'calendar'
  | 'mindset'
  | 'learning'
  | 'cross'

/** Two-tier sensitivity. `geheim` never leaves for cloud-AI / external processing. */
export type Tier = 'normaal' | 'geheim'

/** Provenance class carried by every event. */
export type EventSource =
  | 'sensor'
  | 'import'
  | 'manual'
  | 'inferred'
  | 'assistant'
  | 'external'
  | 'system'

/** Lifecycle of an observed/inferred fact (inference_with_confirmation). */
export type RecordStatus =
  | 'observed'
  | 'inferred'
  | 'confirmed'
  | 'rejected'
  | 'superseded'

/** The universal metadata envelope every record and event carries. */
export interface Envelope {
  id: string
  userId: string
  type: string
  domains: LifeDomain[]
  occurredAt: string // ISO — when it happened in the world
  recordedAt: string // ISO — when the system learned it
  source: EventSource
  sourceDetail?: string | null
  sourceRef?: string | null
  confidence: number // 0..1
  status: RecordStatus
  derivedFrom: string[] // lineage: event ids this was derived from
  ruleId?: string | null
  tags: string[]
  tier: Tier
  validFrom?: string | null
  validTo?: string | null
}

/** One row of the append-only `events` log. */
export interface EventRecord extends Envelope {
  seq: number
  payload: Record<string, unknown>
  dedupKey?: string | null
}

/** A `type_registry` entry: per-type domains, sensitivity, projection & contract. */
export interface TypeRegistryEntry {
  type: string
  label: string
  defaultDomains: LifeDomain[]
  defaultTier: Tier
  projectionTable?: string | null
  fieldContract: Record<string, unknown>
  version: number
  active: boolean
  updatedAt: string
}

// ── Inference engine (PM-201 Slice 1) ─────────────────────────────────────────

export type InferenceDecision = 'confirm' | 'reject'

/**
 * A pending inference awaiting the user's confirm/reject. It is an `events` row
 * with status='inferred'; the run_inference() rules produce these and
 * confirm_inference() resolves them (inference_with_confirmation).
 */
export interface InferredItem {
  id: string
  ruleId: string | null
  type: string
  domains: LifeDomain[]
  confidence: number
  /** Human-facing confirm prompt, from payload.question. */
  question: string
  occurredAt: string // ISO
  payload: Record<string, unknown>
}

// ── Passive-sensed substance ─────────────────────────────────────────────────

export interface DayLog {
  date: string // ISO date (YYYY-MM-DD)
  sleepHours: number
  energy: number // 1..5
  mood: number // 1..5
  note?: string
}

export interface Transaction {
  id: string
  date: string
  amount: number // EUR, negative = spend
  merchant: string
  category: string
  domain: Domain
  note?: string // per-transaction free-text ("add more info")
  autoTagged?: boolean // true once HEYRA/Haiku has categorised this row
}

/**
 * Vendor cache entry — HEYRA's "learn once, reuse forever" categorisation memory.
 * Keyed by a normalised merchant name (vendorKey). The first time a merchant
 * appears it's looked up (Haiku + web search) and stored here; every later
 * transaction from the same vendor is tagged instantly from this cache.
 */
export interface VendorTag {
  vendorKey: string // normalised lookup key
  vendorName: string // last-seen human-readable merchant
  category: string
  domain: Domain
  info: string // what the vendor is (from web search) + any notes
  source: 'ai' | 'manual' | 'rule'
  confidence: number // 0..1
  updatedAt: string // ISO
}

export interface Habit {
  id: string
  name: string
  streak: number
  doneToday: boolean
  emoji: string
  color?: string // hex accent
  history?: string[] // ISO dates the habit was completed
}

// ── Health (Fit / Samsung Health style sense) ────────────────────────────────

export interface HealthDay {
  date: string // ISO date
  steps: number
  stepGoal: number
  sleepHours: number
  restingHR: number // bpm
  activeMinutes: number
  energy: number // 1..5
  mood: number // 1..5
}

// ── Daily check-in: the felt signal (energy/mood) no sensor captures ─────────

export interface Checkin {
  date: string // ISO date (YYYY-MM-DD)
  energy: number // 1..5
  mood: number // 1..5
  note?: string | null
}

// ── Proactive Telegram notifications ─────────────────────────────────────────

export interface NotificationPrefs {
  telegramChatId: number | null
  telegramUsername: string | null
  linkedAt: string | null
  morningBriefing: boolean
  eveningCheckin: boolean
  habitReminders: boolean
  urgentAlerts: boolean
  morningTime: string // 'HH:MM'
  eveningTime: string // 'HH:MM'
  habitTime: string // 'HH:MM'
  quietHoursStart: string | null // 'HH:MM'
  quietHoursEnd: string | null // 'HH:MM'
}

// ── Behaviour sense: screen time + app usage ─────────────────────────────────

export interface AppUse {
  name: string
  minutes: number
  category: 'work' | 'social' | 'media' | 'comms' | 'other'
}

export interface ScreenDay {
  date: string // ISO date
  totalMinutes: number
  pickups: number // times the phone was unlocked
  focusMinutes: number // time in work/creative apps
  distractMinutes: number // time in social/media apps
  topApps: AppUse[]
}

// ── Behaviour sense: calendar load / meetings ────────────────────────────────

export interface MeetingDay {
  date: string // ISO date
  count: number
  minutes: number
  fragmented: boolean // many short meetings broke up the day
}

// ── Projects (mirrors a Notion projects database) ────────────────────────────

export type ProjectStatus = 'lead' | 'active' | 'review' | 'blocked' | 'done'

export type Priority = 'High' | 'Medium' | 'Low'

/** HEYRA Taakmaker draft — a parsed, editable task before it is committed. */
export interface TaskDraft {
  title: string
  due: string | null // ISO date YYYY-MM-DD
  time: string | null // HH:MM (24h), optional
  domain: Domain
  priority: Priority
  notes?: string
}

export interface Project {
  id: string
  name: string
  client: string
  domain: Domain
  status: ProjectStatus
  deadline: string | null // ISO date — the project due date
  progress: number // 0..1 (derived from tasks/milestones)
  value: number // EUR — project price
  type?: string[] // Website, Branding, Logo, Social Media, ...
  priority?: Priority
  clientId?: string | null // FK → clients.id (the connected client)
  startDate?: string | null // ISO date
  deliverables?: string[]
  scope?: string | null // free-text project scope
  notes?: string | null
  archived?: boolean
  notionUrl?: string
  notionId?: string // Notion page id (= projects.external_id) — legacy write-back
}

// ── Project template: milestones / tasks / hours / invoices / activity ────────

export type Recurrence = 'daily' | 'weekly' | 'monthly'

export interface ProjectMilestone {
  id: string
  projectId: string
  title: string
  dueDate: string | null // ISO date
  progress: number // 0..1
  done: boolean
}

export interface ProjectTask {
  id: string
  projectId: string
  name: string
  done: boolean
  dueDate?: string | null
  priority?: Priority | null
  recurrence?: Recurrence | null // null = one-time
  recurEvery?: number // every N periods (default 1)
  lastDoneOn?: string | null // ISO date a recurring task last completed
}

export interface HourEntry {
  id: string
  projectId: string
  date: string // ISO date
  hours: number
  note?: string | null
  billable: boolean
  billed: boolean // true once an invoice has drawn from this entry
}

/** Owner-scoped app settings — a single row per user (global hourly rate, …). */
export interface AppSettings {
  hourlyRate: number // EUR per hour, used to invoice unbilled hours
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue'

export interface Invoice {
  id: string
  projectId: string
  number: string
  amount: number // EUR
  status: InvoiceStatus
  issuedOn?: string | null
  dueOn?: string | null
  paidOn?: string | null
  note?: string | null
}

export type ActivityLink = 'task' | 'milestone'

export interface ActivityEntry {
  id: string
  projectId: string
  body: string
  createdAt: string // ISO
  linkType?: ActivityLink | null
  linkId?: string | null
  action?: 'completed' | 'progress' | 'linked' | null
}

// ── CRM: clients (mirrors Notion Clients DB) ─────────────────────────────────
export type ClientStatus = 'Active' | 'Lead' | 'Prospect' | 'Planned' | 'Inactive' | 'Past'

export interface Client {
  id: string
  name: string
  domain: Domain
  clientStatus: ClientStatus | null
  potentie?: 'Hoog' | 'Middel' | 'Laag' | null
  scope?: number | null // EUR potential
  firstContact?: string | null // ISO date
  email?: string | null
  website?: string | null
  lastContactedAt?: string | null // ISO — bumped when a message links to the client
  followUpCycleDays?: number // cadence the follow-up health dot measures against
  aliases?: string[] // sender emails and/or domains that map inbound mail to this client (learned in-app)
}

// ── CRM: unified client messages (email / fiverr / whatsapp) ─────────────────
export type Channel = 'email' | 'fiverr' | 'whatsapp'

export type MessageSource = 'manual' | 'gmail' | 'whatsapp_import' | 'fiverr'

export interface Message {
  id: string
  contact: string
  contactKey: string // groups messages into a conversation
  clientId?: string | null
  projectId?: string | null
  projectName?: string | null
  channel: Channel
  direction: 'in' | 'out'
  subject?: string | null
  snippet: string
  body?: string | null
  ts: string // ISO
  unread: boolean
  source?: MessageSource
  externalId?: string | null
}

// ── North Star: high-level goals + milestones ────────────────────────────────

export interface Goal {
  id: string
  title: string
  metric: string // e.g. "EUR", "kg", "clients"
  target: number
  current: number
  deadline: string // ISO date
  domain: Domain
}

export interface Milestone {
  id: string
  goalId: string | null
  title: string
  done: boolean
  due: string | null // ISO date
}

/**
 * A goal HEYRA proposes but Rick hasn't accepted yet. Distilled from what the
 * brain has learned (learned facts, patterns, live projects/finance). Lives only
 * in the North Star "voorstellen" tray until accepted (→ becomes a real Goal) or
 * dismissed. `rationale` is the one-line "why this, why now".
 */
export interface GoalProposal {
  id: string
  title: string
  metric: string
  target: number
  current: number
  deadline: string // ISO date
  domain: Domain
  rationale: string
  source: 'ai' | 'rule'
}

// ── Dagplanner: an AI-proposed / calendar block on a specific day ─────────────

export type PlanBlockKind =
  | 'event' // an existing calendar appointment (fixed, source='calendar')
  | 'focus' // deep work in the learned energy peak
  | 'routine' // a habit / recurring ritual (morning routine, dog walk, workout)
  | 'break' // rest / recharge
  | 'meal' // lunch / dinner
  | 'admin' // shallow work: mail, invoices, calls
  | 'wind-down' // evening slow-down to protect tomorrow's sleep
  | 'personal' // personal / flexible time

/**
 * One block in the weekly day-plan preview. Calendar events are pulled in
 * (`source:'calendar'`, always `locked`); everything else is proposed by the
 * planner (rule-based or brain) and stays `locked:false` until Rick locks it,
 * which writes it back to `day_blocks` (the app's calendar mirror).
 */
export interface PlanBlock {
  id: string
  date: string // YYYY-MM-DD
  title: string
  domain: Domain
  start: string // HH:MM
  end: string // HH:MM
  rationale: string
  kind: PlanBlockKind
  source: 'calendar' | 'ai' | 'rule'
  locked: boolean
}

// ── Outstanding payments (logged in a dedicated Google Calendar) ─────────────

export type PaymentDirection = 'incoming' | 'outgoing' // incoming = owed TO Rick
export type PaymentStatus = 'open' | 'paid'

export interface Payment {
  id: string
  payee: string // who pays / gets paid (counterparty)
  amount: number // EUR, always positive; direction carries the sign meaning
  due: string | null // ISO date
  direction: PaymentDirection
  status: PaymentStatus
  domain: Domain
  source: string // 'calendar' | 'manual' | ...
  externalId?: string // google event id, for dedup
}

// ── Kyra: dog tracker ────────────────────────────────────────────────────────
export type DogKind =
  | 'walk'
  | 'food'
  | 'water'
  | 'pee'
  | 'poop'
  | 'play'
  | 'treat'
  | 'training'
  | 'vet'
  | 'weight'
  | 'note'

export interface DogEntry {
  id: string
  kind: DogKind
  at: string // ISO datetime
  durationMin?: number | null
  distanceKm?: number | null
  weightKg?: number | null
  note?: string | null
  photo?: string | null // data URL
  location?: string | null
  poopConsistency?: 1 | 2 | 3 | 4 | 5 | null // 1=vloeibaar..5=droog
  trainingType?: string | null
}

export type DogMedicalType = 'vaccine' | 'vet' | 'medication' | 'condition' | 'weight'

export interface DogMedical {
  id: string
  type: DogMedicalType
  date: string // ISO date
  title: string
  note?: string | null
  photo?: string | null // data URL (scan, foto)
  nextDue?: string | null // ISO date
}

export interface DogReminder {
  id: string
  title: string
  due: string // ISO date
  kind: DogKind | 'vet' | 'med' | 'other'
  done: boolean
}

export interface DogProfile {
  name: string
  breed: string
  birthdate: string // ISO date
  weightKg: number
  vet: string
  photo?: string | null
}

// ── Subscriptions (recurring spend) ──────────────────────────────────────────
export type Cadence = 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export interface Subscription {
  id: string
  name: string
  amount: number // EUR per cadence period
  cadence: Cadence
  nextCharge: string | null // ISO date
  active: boolean
  category: string
  domain: Domain
  notes?: string
}

// ── Inbox (most important Gmail threads) ─────────────────────────────────────

export interface EmailItem {
  id: string
  from: string
  subject: string
  snippet: string
  receivedAt: string // ISO
  unread: boolean
  important: boolean
  domain: Domain
  importance?: 'high' | 'med' | 'low' | null
  threadId?: string | null
  labels?: string[]
}

// ── Layer 5/6: SURFACE + ACT ──────────────────────────────────────────────────

export interface Block {
  id: string
  title: string
  domain: Domain
  start: string // "HH:MM"
  end: string
  status: 'planned' | 'done' | 'skipped'
  rationale: string // why the planner put it here (learned rhythm)
}

export interface Nudge {
  id: string
  text: string
  domain: Domain
  reason: string
}

// ── REFLECT digest ────────────────────────────────────────────────────────────

export interface Correlation {
  id: string
  title: string
  detail: string
  domains: Domain[]
  strength: number // 0..1
  evidence: string
}

export interface Anomaly {
  id: string
  title: string
  detail: string
  domain: Domain
}

export interface ReflectDigest {
  ranAt: string
  correlations: Correlation[]
  anomalies: Anomaly[]
  reinforced: { patternId: string; from: number; to: number }[]
  decayed: { patternId: string; from: number; to: number }[]
  /** Brain-synthesized prescriptive summary of THIS pass's correlations/anomalies — filled in async after the digest itself, never blocks the UI. Undefined until the brain call resolves (or is unavailable). */
  narrative?: string
}
