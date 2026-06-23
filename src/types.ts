// ── Core domain model for RICK-OS ────────────────────────────────────────────

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
}

export interface Habit {
  id: string
  name: string
  streak: number
  doneToday: boolean
  emoji: string
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

// ── Behaviour sense: screen time + app usage ─────────────────────────────────

export interface AppUse {
  name: string
  minutes: number
  category: 'work' | 'social' | 'media' | 'comms'
}

export interface ScreenDay {
  date: string // ISO date
  totalMinutes: number
  pickups: number // times the phone was unlocked
  focusMinutes: number // time in work/creative apps
  distractMinutes: number // time in social/media apps
  topApps: AppUse[]
}

// ── Behaviour sense: location / most-visited places ──────────────────────────

export interface PlaceVisit {
  name: string
  domain: Domain
  minutes: number
}

export interface LocationDay {
  date: string // ISO date
  timeHome: number // minutes
  timeOut: number // minutes (work sites, errands)
  timeCommute: number // minutes driving/travelling
  distanceKm: number
  places: PlaceVisit[]
}

// ── Behaviour sense: calendar load / meetings ────────────────────────────────

export interface MeetingDay {
  date: string // ISO date
  count: number
  minutes: number
  fragmented: boolean // many short meetings broke up the day
}

// ── Behaviour sense: music / listening (mood proxy) ──────────────────────────

export interface MusicDay {
  date: string // ISO date
  minutes: number
  topGenre: string
  tempo: number // avg BPM
  valence: number // 0..1, higher = brighter/happier
}

// ── Projects (mirrors a Notion projects database) ────────────────────────────

export type ProjectStatus = 'lead' | 'active' | 'review' | 'blocked' | 'done'

export interface Project {
  id: string
  name: string
  client: string
  domain: Domain
  status: ProjectStatus
  deadline: string | null // ISO date
  progress: number // 0..1
  value: number // EUR
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
}
