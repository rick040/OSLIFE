// ── Core domain model for OSLIFE ─────────────────────────────────────────────

import type { LearningCategory } from './heyra/learning'

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

export type BraindumpStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'duplicate'

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

export type WikiStatus = 'suggested' | 'confirmed' | 'rejected'

/**
 * A curated "Kennisbank" entry distilled from a braindump capture — Claude
 * flags the odd braindump (an idea worth stealing, an interesting post) as
 * `suggested` during ingest; the user confirms/rejects it in the Kennisbank
 * view. Only `confirmed` entries get materialised as a real .md file in the
 * vault. Mirrors InferredItem's suggest-then-confirm shape.
 *
 * `category` sorts the learning itself (life lesson, way of living, business
 * system/practice, implementation idea, pet) — set by Claude at ingest time.
 * On confirm, store.resolveWikiEntry() turns the takeaway into a permanent
 * LearnedFact under this same category (src/heyra/learning.ts), so HEYRA's
 * advice keeps drawing on it long after the Kennisbank card scrolls by.
 */
export interface WikiEntry {
  id: string
  createdAt: string // ISO
  status: WikiStatus
  title: string
  transcript: string
  takeaway: string
  application: string
  category: LearningCategory | null
  domain: Domain | null
  tags: string[]
  sourceUrl: string | null
  braindumpEntryId: string | null
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
  /** Written to meta.source — e.g. 'heyra-voice' so a raw voice exchange is distinguishable from a typed one in Geheugen/search_memory() results, without a dedicated column. */
  sourceTag?: string
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
  priority?: Priority | null
  notes?: string | null
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

// ── Slice 2 domains: mensen/relaties, huis & admin, gezondheidsdossier ─────────

export type PersonKind = 'network' | 'business' | 'both'

/** A person in the network/business graph. Client becomes a role on this. */
export interface Person {
  id: string
  displayName: string
  kind: PersonKind
  emails: string[]
  phones: string[]
  birthday: string | null
  cadenceDays: number | null
  lastInteractionAt: string | null
  clientId: string | null
  notes: string | null
  tier: Tier
}

export type InteractionChannel = 'mail' | 'whatsapp' | 'call' | 'in_person' | 'fiverr'

/** One contact moment with a person. owedReply feeds the open-loops. */
export interface Interaction {
  id: string
  personId: string | null
  channel: InteractionChannel
  direction: 'in' | 'out'
  summary: string | null
  owedReply: boolean
  occurredAt: string // ISO
}

export type AdminCategory =
  | 'insurance'
  | 'contract'
  | 'warranty'
  | 'vehicle'
  | 'house'
  | 'subscription_admin'
  | 'document'

/** A home/admin item to track: contracts, warranties, renewals. */
export interface AdminItem {
  id: string
  title: string
  category: AdminCategory
  provider: string | null
  renewalOn: string | null // ISO date
  noticePeriodDays: number | null
  amount: number | null
  cancellable: boolean
  notes: string | null
  tier: Tier
}

export type HealthConditionStatus = 'active' | 'monitoring' | 'resolved'

/** A tracked medical file, for Rick or Kyra. Promoted by P1 or added by hand. */
export interface HealthCondition {
  id: string
  subject: string // 'rick' | 'kyra'
  label: string
  openedAt: string // ISO date
  status: HealthConditionStatus
  notes: string | null
  tier: Tier
}

/**
 * A scheduled medication reminder (PM-072 Fase 2). reminderTimes fires a
 * Telegram message every day at each time — there's no native Android app for
 * AlarmManager, so this reuses the existing notify-tick/Telegram channel.
 */
export interface Medication {
  id: string
  healthConditionId: string | null
  name: string
  dosage: string | null
  scheduleNote: string | null
  reminderTimes: string[] // 'HH:MM', local/Amsterdam time
  active: boolean
  tier: Tier
}

/**
 * A per-category monthly spending cap (generic pattern engine, R11). Created
 * automatically when confirming a `budget_cap_suggestion` inference, but
 * editable afterwards like any other setting — the rule only proposes the
 * starting number.
 */
export interface BudgetCap {
  id: string
  category: string
  monthlyMax: number
  active: boolean
  sourceRuleId: string | null
  tier: Tier
}

/**
 * A versioned entry in Rick's living profile — the confirm-gated replacement
 * path for what `heyra_memory`/LearnedFact does today (see heyra/learning.ts):
 * every new value for the same `key` supersedes the previous one instead of
 * silently overwriting it, so the profile has an audit trail. Only the
 * current (non-superseded) version is fetched into the store.
 */
export interface ProfileFact {
  id: string
  key: string
  label: string
  value: Record<string, unknown>
  version: number
  confidence: number
  sourceRuleId: string | null
  sourceIds: string[]
  tier: Tier
  createdAt: string
}

// ── Memory & retrieval (PM-201 Slice 3) ───────────────────────────────────────

/** A rolled-up digest of a period (nightly build_summaries). */
export interface MemorySummary {
  id: string
  period: string // day | week | month | quarter
  periodStart: string // ISO date
  domain: string
  text: string
  eventCount: number
  tier: Tier
}

/** One retrieval hit from search_memory (tier=normaal only). */
export interface MemoryHit {
  id: string
  source: string // braindump | interaction | summary
  title: string
  snippet: string
  ts: string // ISO
  rank: number
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

// ── Projects (native CRM — full in-app CRUD, no external sync) ───────────────

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
  notionUrl?: string // legacy — external link kept for projects created back when this synced from Notion
  notionId?: string // legacy id (= projects.external_id); local-<uuid> for projects created in-app
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

/** A running project-hours stopwatch — client-only (persisted to localStorage via the store's persist middleware), never synced to Supabase. Stopping it writes a real HourEntry. */
export interface ActiveTimer {
  projectId: string
  projectName: string
  startedAt: string // ISO
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

// ── CRM: clients (native — full in-app CRUD, no external sync) ───────────────
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
  researchNote?: string | null // cached one-line "what does this company do" (enrich-client)
  researchedAt?: string | null // ISO — when researchNote was last fetched
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
  iban?: string | null // counterparty IBAN, for manually-added bills
  paymentLink?: string | null // pasted payment/checkout URL
  note?: string | null // free-text (what this is, invoice number, …)
}

// ── Investments: lightweight owned-holdings tracker ──────────────────────────
// Scoped deliberately to what's actually owned — never a general market feed.
// currentPrice/asOf are filled in client-side from stock-quote and never persisted.

export interface Holding {
  id: string
  ticker: string // Stooq symbol, e.g. "AAPL.US", "ASML.NL"
  name: string | null // friendly label, e.g. "Apple"
  shares: number
  costBasis: number // price paid per share, in `currency`
  currency: 'EUR' | 'USD' | 'GBP'
  purchaseDate: string // ISO date
  notes: string | null
  // Fallback for tickers Stooq doesn't carry (e.g. some European ETPs/ETNs) —
  // a price you type in yourself, in `currency`. Live quotes always win when
  // available; this only fills the gap when stock-quote comes back empty.
  manualPrice: number | null
  manualPriceAt: string | null // ISO date it was last set
}

export interface HoldingQuote {
  price: number | null // latest price, in `currency`
  currency: 'EUR' | 'USD' | 'GBP'
  asOf: string | null
}

// ── Manually-corrected account balance (drift fix) ───────────────────────────
// The running balance is opening-balance + sum(transactions), which drifts once
// transactions predate the import history. A checkpoint pins the *real* balance
// at a point in time; balance = latest checkpoint + transactions strictly after it.

export interface BalanceCheckpoint {
  id: string
  amount: number // EUR, the real balance at `asOf`
  asOf: string // ISO date
  note: string | null
  createdAt: string // ISO
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

export interface EmailReminder {
  text: string
  date: string | null // 'YYYY-MM-DD'
}

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
  body?: string | null
  aiSummary?: string | null
  aiTakeaways?: string[]
  aiReminders?: EmailReminder[]
  aiSummarizedAt?: string | null
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

// ── Strategie HQ: business ideas (voice/text → full elaborated analysis) ─────

export type IdeaSource = 'voice' | 'text'
export type IdeaElaborationStatus = 'pending' | 'processing' | 'ready' | 'failed'
export type IdeaLifecycleStatus = 'idea' | 'active' | 'parked' | 'archived'
export type ImpactLevel = 'low' | 'medium' | 'high'

export interface IdeaMilestone {
  title: string
  due: string | null // relative period label ("Maand 1"), not a strict ISO date — the idea isn't committed yet
  done: boolean
}

export interface RevenuePoint {
  period: string // e.g. "Maand 1"
  amount: number // EUR
}

export interface IdeaCost {
  label: string
  amount: number // EUR
}

export interface IdeaFinancials {
  investmentNeeded: number | null // EUR
  revenueProjection: RevenuePoint[]
  costs: IdeaCost[]
  breakEven: string | null // description or period
  notes: string | null
}

export interface IdeaRisk {
  risk: string
  impact: ImpactLevel
  mitigation: string | null
}

export interface IdeaOpportunity {
  opportunity: string
  potential: ImpactLevel
}

export interface IdeaSwot {
  strengths: string[]
  weaknesses: string[]
  opportunities: string[]
  threats: string[]
}

/**
 * One business idea on Strategie HQ. Captured as a voice note or typed text
 * (`rawInput`), then elaborated by the idea-elaborate edge function into a
 * full strategic write-up — `markdown` is the complete document; every other
 * analysis field is the same content pulled out into structured data for the
 * UI's visualizations. `elaborationStatus` tracks that pipeline; `status` is
 * the separate, user-managed lifecycle stage.
 */
export interface BusinessIdea {
  id: string
  createdAt: string
  updatedAt: string
  source: IdeaSource
  rawInput: string | null
  elaborationStatus: IdeaElaborationStatus
  error: string | null
  status: IdeaLifecycleStatus
  title: string
  overview: string | null
  domain: Domain
  tags: string[]
  feasibilityScore: number | null
  feasibilityReasoning: string | null
  timeline: string | null
  milestones: IdeaMilestone[]
  financials: IdeaFinancials
  risks: IdeaRisk[]
  opportunities: IdeaOpportunity[]
  swot: IdeaSwot
  markdown: string | null
  tier: Tier
}
