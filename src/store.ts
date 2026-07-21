import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  StructuredItem,
  Essential,
  Thread,
  Pattern,
  DayLog,
  Transaction,
  Habit,
  Block,
  Nudge,
  ReflectDigest,
  CaptureSource,
  Domain,
  HealthDay,
  Project,
  Goal,
  Milestone,
  EmailItem,
  Payment,
  ScreenDay,
  MeetingDay,
  Checkin,
  NotificationPrefs,
  Client,
  Message,
  Subscription,
  DogEntry,
  DogMedical,
  DogReminder,
  DogProfile,
  TaskDraft,
  ProjectMilestone,
  ProjectTask,
  HourEntry,
  Invoice,
  ActivityEntry,
  VendorTag,
  BraindumpEntry,
  BraindumpInput,
  AppSettings,
  GoalProposal,
  PlanBlock,
  InferredItem,
  InferenceDecision,
  WikiEntry,
  Person,
  Interaction,
  AdminItem,
  HealthCondition,
  MemorySummary,
  BusinessIdea,
  IdeaSource,
  Holding,
  HoldingQuote,
  BalanceCheckpoint,
} from './types'
import { vendorKey, isUntagged, isTransfer } from './finance/categories'
import { categorizeVendor } from './heyra/agents/vendorAgent'
import { analyzeActivity } from './lib/crm/activityAnalyzer'
import type { ActivityAnalysis } from './lib/crm/activityAnalyzer'
import { unbilledBillableHours, sumHours, invoiceAmountFromHours } from './lib/crm/invoicing'
import { parseWhatsapp } from './lib/crm/whatsapp'
import { classifyWithBrain, type Classification } from './understand'
import { invokeBraindumpIngest } from './lib/braindump'
import type { ClaudeImportRecord } from './lib/claudeImport'
import { runReflect, computeCorrelations, computeAnomalies, buildNarrativePrompt, NARRATIVE_SYSTEM_PROMPT } from './reflect'
import { askBrain } from './heyra/brainClient'
import { buildFinanceCoachPrompt } from './finance/financeCoach'
import { extractFacts, mergeFacts, type LearnedFact } from './heyra/learning'
import { proposeGoals as proposeGoalsAI } from './heyra/goals'
import { buildWeekPlan, weekDates } from './heyra/planner'
import {
  deriveEssentials,
  deriveThreads,
  deriveDayLogs,
  deriveDeadlines,
  deriveBaselinePatterns,
  applyCheckins,
  buildNudge,
} from './derive'
import { today, habitStreak, DOMAIN_META, KIND_LABEL } from './domains'
import { logKey } from './cleaning/gamify'
import * as mock from './mockData'
import {
  supabase,
  fetchHealthDays,
  fetchTransactions,
  fetchPayments,
  fetchEmails,
  fetchMeetingDays,
  fetchBlocks,
  fetchHabits,
  fetchSubscriptions,
  fetchGoals,
  createGoalRow,
  updateGoalRow,
  deleteGoalRow,
  fetchBlocksRange,
  insertDayBlock,
  fetchDogEntries,
  fetchBrainState,
  fetchLearnedFacts,
  persistLearnedFacts,
  fetchScreenDays,
  fetchProjects,
  fetchClients,
  fetchCheckins,
  upsertCheckin,
  fetchNotificationPrefs,
  upsertNotificationPrefs,
  persistBrainState,
  persistPaymentStatus,
  deletePaymentRow,
  persistBlockStatus,
  isDbId,
  insertFinanceTx,
  updateFinanceTxRow,
  deleteFinanceTxRow,
  applyCategoryToTxIds,
  fetchVendorTags,
  upsertVendorTag,
  deleteVendorTag as deleteVendorTagRow,
  fetchBraindumpEntries,
  insertBraindumpEntry,
  insertReadyBraindumpEntries,
  deleteBraindumpEntryRow,
  resetBraindumpEntryRow,
  persistEmailRead,
  persistAllEmailsRead,
  createHabitRow,
  softDeleteHabitRow,
  persistHabitTick,
  fetchCleaningLog,
  persistCleaningTick,
  createSubscriptionRow,
  updateSubscriptionRow,
  deleteSubscriptionRow,
  createPaymentRow,
  fetchHoldings,
  createHoldingRow,
  deleteHoldingRow,
  fetchStockQuotes,
  fetchBalanceCheckpoints,
  createBalanceCheckpointRow,
  deleteBalanceCheckpointRow,
  createDogEntryRow,
  deleteDogEntryRow,
  updateDogEntryRow,
  createClientRow,
  updateClientRow,
  deleteClientRow,
  createProjectRow,
  updateProjectRow,
  deleteProjectRow,
  fetchMilestones,
  createMilestoneRow,
  updateMilestoneRow,
  deleteMilestoneRow,
  fetchProjectTaskRows,
  createProjectTaskRow,
  updateProjectTaskRow,
  deleteProjectTaskRow,
  fetchHours,
  createHourRow,
  deleteHourRow,
  markHoursBilled,
  fetchInvoices,
  createInvoiceRow,
  updateInvoiceRow,
  deleteInvoiceRow,
  fetchActivity,
  createActivityRow,
  deleteActivityRow,
  fetchClientMessages,
  createMessageRow,
  insertMessages,
  markMessagesReadRow,
  deleteMessageRow,
  fetchAppSettings,
  upsertAppSettings,
  fetchPendingInferences,
  confirmInference,
  fetchWikiEntries,
  confirmWikiEntry,
  materializeWikiEntry,
  fetchPeople,
  createPersonRow,
  updatePersonRow,
  deletePersonRow,
  fetchInteractions,
  createInteractionRow,
  fetchAdminItems,
  createAdminItemRow,
  updateAdminItemRow,
  deleteAdminItemRow,
  fetchHealthConditions,
  fetchSummaries,
  forgetRecord as forgetRecordApi,
  fetchBusinessIdeas,
  insertBusinessIdeaRow,
  updateBusinessIdeaRow,
  deleteBusinessIdeaRow,
  invokeIdeaElaborate,
} from './lib/supabase'

// The single Realtime channel opened by loadLiveData(). Held at module scope so
// a repeat loadLiveData() (e.g. on every auth TOKEN_REFRESHED) tears the previous
// channel down instead of leaking a new 22-handler subscription each time.
let liveChannel: ReturnType<typeof supabase.channel> | null = null

interface ActivitySignal {
  id: string
  ts: string
  text: string
  domain: Domain
  loop: 'fast' | 'slow'
}

interface State {
  items: StructuredItem[]
  essentials: Essential[]
  threads: Thread[]
  patterns: Pattern[]
  dayLogs: DayLog[]
  transactions: Transaction[]
  habits: Habit[]
  /** `${onDate}__${taskKey}` → done, for the ADHD-proof cleaning schedule. */
  cleaningLog: Record<string, boolean>
  blocks: Block[]
  nudge: Nudge
  lastDigest: ReflectDigest | null
  reflectCount: number
  planAdapted: boolean
  activity: ActivitySignal[]
  healthDays: HealthDay[]
  checkins: Checkin[]
  notificationPrefs: NotificationPrefs | null
  screenDays: ScreenDay[]
  meetingDays: MeetingDay[]
  projects: Project[]
  clients: Client[]
  messages: Message[]
  projectMilestones: ProjectMilestone[]
  projectTasks: ProjectTask[]
  projectHours: HourEntry[]
  projectInvoices: Invoice[]
  projectActivity: ActivityEntry[]
  goals: Goal[]
  milestones: Milestone[]
  goalProposals: GoalProposal[]
  proposingGoals: boolean
  /** Set when the last proposeGoals() attempt threw; cleared on the next attempt/success. Lets the UI say *why* the button produced nothing instead of just going quiet. */
  lastGoalProposalError: string | null
  weekPlan: PlanBlock[]
  weekPlanAt: string | null
  planningWeek: boolean
  /** Same idea as lastGoalProposalError, for generateWeekPlan(). */
  lastPlanError: string | null
  emails: EmailItem[]
  payments: Payment[]
  subscriptions: Subscription[]
  holdings: Holding[]
  balanceCheckpoints: BalanceCheckpoint[]
  /** Latest price per holding ticker (from the last refreshStockQuotes() call). */
  stockQuotes: Record<string, HoldingQuote>
  fx: { EURUSD: number | null; EURGBP: number | null }
  loadingQuotes: boolean
  financeCoach: { text: string; generatedAt: string } | null
  financeCoachLoading: boolean
  dogProfile: DogProfile
  dogEntries: DogEntry[]
  dogMedical: DogMedical[]
  dogReminders: DogReminder[]
  learnedFacts: LearnedFact[]
  vendorTags: VendorTag[]
  braindumpEntries: BraindumpEntry[]
  inferences: InferredItem[]
  wikiEntries: WikiEntry[]
  people: Person[]
  interactions: Interaction[]
  adminItems: AdminItem[]
  healthConditions: HealthCondition[]
  summaries: MemorySummary[]
  businessIdeas: BusinessIdea[]
  settings: AppSettings
  dataSource: 'mock' | 'live'
  isLoading: boolean

  // HEYRA learns as we speak — distil durable facts from one exchange, merge
  // them into the persisted set and return only the genuinely NEW facts so the
  // UI can surface "onthouden: …". Best-effort: brain failure ⇒ [] , no throw.
  learnFromExchange: (userText: string, heyraText: string) => Promise<LearnedFact[]>
  forgetLearnedFact: (id: string) => void

  // INTAKE → UNDERSTAND → REMEMBER
  capture: (
    text: string,
    source: CaptureSource,
    opts?: { openThread?: boolean },
    precomputed?: Classification,
  ) => Promise<StructuredItem>

  // Braindump v2 — universal capture. Inserts a `pending` row (optimistic temp
  // id → real id), then fires the server-side ingest pipeline that converts the
  // shared thing into a Markdown note. Best-effort; returns the real row or null.
  braindumpCapture: (input: BraindumpInput) => Promise<BraindumpEntry | null>
  deleteBraindumpEntry: (id: string) => void
  retryBraindumpEntry: (id: string) => void
  // Import a parsed claude.ai chat export as `ready` knowledge entries so HEYRA
  // can search/reference past Claude conversations. Skips ones already imported
  // (matched on meta.conversationId) so re-uploading the same export is safe.
  importClaudeConversations: (records: ClaudeImportRecord[]) => Promise<{ imported: number; skipped: number }>

  // Strategie HQ — business ideas. A voice note or typed text becomes a
  // `pending` row (optimistic temp id → real id), then idea-elaborate fills
  // in the full analysis server-side. Best-effort, same shape as braindump.
  captureBusinessIdea: (input: { title: string; source: IdeaSource; rawInput: string; domain?: BusinessIdea['domain'] }) => Promise<BusinessIdea | null>
  updateBusinessIdea: (id: string, patch: Partial<BusinessIdea>) => void
  deleteBusinessIdea: (id: string) => void
  retryIdeaElaboration: (id: string) => void
  toggleIdeaMilestone: (id: string, index: number) => void

  // HEYRA Taakmaker — commit a parsed task draft as an open loop (thread)
  addTask: (draft: TaskDraft) => string

  // ACT (fast loop, writes outcomes back as signals)
  closeThread: (id: string) => void
  reopenThread: (id: string) => void
  updateThread: (id: string, patch: Partial<Thread>) => void
  deleteThread: (id: string) => void
  tickHabit: (id: string) => void
  addHabit: (name: string, emoji: string, color?: string) => void
  deleteHabit: (id: string) => void
  /** Flip one cleaning-schedule task for a date (defaults to today). */
  toggleCleaningTask: (taskKey: string, onDate?: string) => void
  completeBlock: (id: string) => void
  skipBlock: (id: string) => void
  resetBlock: (id: string) => void
  moveBlock: (id: string, dir: -1 | 1) => void
  acceptPlan: () => void

  // INTAKE (felt signal) → energy/mood check-in, feeds REFLECT
  logCheckin: (energy: number, mood: number, note?: string) => void

  // Proactive Telegram notifications — settings written from SettingsModal
  setNotificationPrefs: (p: Partial<NotificationPrefs>) => void

  // REFLECT (slow loop)
  runNightlyReflect: () => void

  // LIVE DATA
  loadLiveData: () => Promise<void>

  // Inference engine (Slice 1): load the pending review queue and resolve one.
  loadInferences: () => Promise<void>
  resolveInference: (id: string, decision: InferenceDecision) => Promise<void>

  // Kennisbank: load the wiki suggest-queue and resolve one. On confirm, the
  // entry also gets materialised as a real .md file in the vault.
  loadWikiEntries: () => Promise<void>
  resolveWikiEntry: (id: string, decision: InferenceDecision) => Promise<void>

  // Slice 2 domains: mensen/relaties, huis & admin.
  addPerson: (p: Omit<Person, 'id'>) => void
  updatePerson: (id: string, patch: Partial<Person>) => void
  deletePerson: (id: string) => void
  logInteraction: (i: Omit<Interaction, 'id'>) => void
  addAdminItem: (a: Omit<AdminItem, 'id'>) => void
  updateAdminItem: (id: string, patch: Partial<AdminItem>) => void
  deleteAdminItem: (id: string) => void

  // Recht op vergeten (Slice 4): hard-delete + tombstone via forget().
  forgetRecord: (table: string, id: string) => void
  // Rebuild the REMEMBER layer (essentials/threads/dayLogs/baseline patterns)
  // and today's nudge from whatever live data is currently loaded.
  recomputeBrain: () => void

  // North Star + Inbox
  toggleMilestone: (id: string) => void
  addGoalMilestone: (goalId: string, title: string, due?: string | null) => void
  deleteGoalMilestone: (id: string) => void
  // North Star goals — manual CRUD + brain-proposed goals Rick accepts/dismisses.
  addGoal: (goal: Omit<Goal, 'id'>) => string
  updateGoal: (id: string, patch: Partial<Omit<Goal, 'id'>>) => void
  deleteGoal: (id: string) => void
  proposeGoals: () => Promise<void>
  acceptGoalProposal: (id: string) => void
  dismissGoalProposal: (id: string) => void
  // Dagplanner — generate/lock/dismiss the weekly day plan.
  generateWeekPlan: () => Promise<void>
  lockPlanBlock: (id: string) => void
  dismissPlanBlock: (id: string) => void
  markEmailRead: (id: string) => void
  markAllEmailsRead: () => void

  // CRM — clients
  addClient: (client: Omit<Client, 'id'>) => void
  updateClient: (id: string, patch: Partial<Client>) => void
  deleteClient: (id: string) => void
  // Learn an inbox sender→client mapping in-app (adds the address + its company
  // domain to the client's aliases so future mail auto-attributes). No Notion.
  linkSenderToClient: (clientId: string, senderAddr: string) => void

  // CRM — messages (unified inbox)
  markConversationRead: (contactKey: string) => void
  addMessage: (msg: Omit<Message, 'id'>) => void
  deleteMessage: (id: string) => void
  importWhatsapp: (
    raw: string,
    meNames: string[],
    opts?: { clientId?: string | null; projectId?: string | null; contact?: string },
  ) => Promise<{ imported: number; total: number }>

  // Projects (native CRUD)
  updateProject: (id: string, patch: Partial<Project>) => void
  addProject: (project: Omit<Project, 'id'>) => void
  deleteProject: (id: string) => void

  // Create a project and immediately seed its template tasks. Like
  // createClientIntake this awaits the project insert first so the child task
  // inserts attach to a real Supabase id (addProject's temp id would race).
  createProjectWithTemplate: (project: Omit<Project, 'id'>, taskNames: string[]) => Promise<string | null>

  // HEYRA Klant-intake: create/reuse a client, optionally create a project +
  // its task breakdown, and log the source message — all awaited in sequence
  // so tasks are only inserted once the project has a real Supabase id
  // (addProject/addProjectTask are fire-and-forget and would race on a temp id).
  createClientIntake: (input: {
    client: Omit<Client, 'id'> | null
    existingClientId: string | null
    project: Omit<Project, 'id'> | null
    tasks: string[]
    message: Omit<Message, 'id'>
  }) => Promise<{ clientId: string | null; projectId: string | null }>

  // Project template: milestones / tasks / hours / invoices / activity
  addMilestone: (projectId: string, m: Omit<ProjectMilestone, 'id' | 'projectId'>) => void
  updateMilestone: (id: string, patch: Partial<ProjectMilestone>) => void
  deleteMilestone: (id: string) => void
  addProjectTask: (projectId: string, task: Omit<ProjectTask, 'id' | 'projectId'>) => void
  toggleProjectTask: (taskId: string, done: boolean) => void
  deleteProjectTask: (id: string) => void
  addHours: (projectId: string, h: Omit<HourEntry, 'id' | 'projectId'>) => void
  deleteHours: (id: string) => void
  addInvoice: (projectId: string, inv: Omit<Invoice, 'id' | 'projectId'>) => void
  updateInvoice: (id: string, patch: Partial<Invoice>) => void
  deleteInvoice: (id: string) => void
  // One-click invoice: draft an invoice from a project's unbilled billable hours
  // at the global rate, then flag those hours billed.
  generateInvoiceFromHours: (projectId: string) => void

  // App settings — the global hourly rate used by generateInvoiceFromHours.
  setHourlyRate: (rate: number) => void
  logActivity: (projectId: string, body: string) => ActivityAnalysis
  deleteActivity: (id: string) => void

  // Money
  addTransactions: (txns: Transaction[]) => void
  importTransactions: (txns: Transaction[]) => Promise<{ inserted: number; duplicates: number }>
  markPaymentPaid: (id: string) => void
  // Manually add a bill/invoice to "Te betalen" (payee/amount/due/IBAN/link/note).
  addPayment: (payment: Omit<Payment, 'id' | 'status' | 'source'>) => void
  // Remove an outstanding (or any) payment entirely — from the store and the DB.
  deletePayment: (id: string) => void

  // Investments — a scoped tracker for stocks/ETFs actually owned, never a
  // general market feed. Prices are fetched only for held tickers.
  addHolding: (holding: Omit<Holding, 'id'>) => void
  deleteHolding: (id: string) => void
  refreshStockQuotes: () => Promise<void>

  // Manual balance checkpoint — pins the real account balance at a point in
  // time so the running balance stops drifting from whatever it was seeded
  // from; balance = latest checkpoint + transactions strictly after it.
  addBalanceCheckpoint: (amount: number, asOf: string, note?: string | null) => void
  deleteBalanceCheckpoint: (id: string) => void

  // Finance coach — HEYRA wearing its "financial coach" hat: a grounded,
  // narrative read on spending/subscriptions/bills, generated on demand
  // (never auto-polled) from real store facts only.
  refreshFinanceCoach: () => Promise<void>
  // Remove a single transaction — from the store and the DB. Handy to clear
  // demo/seed rows that shouldn't count toward the balance.
  deleteTransaction: (id: string) => void
  // Manual per-transaction edit (category/domain/note/merchant). By default a
  // category/domain change also teaches the vendor cache so future transactions
  // from the same merchant tag themselves.
  updateTransaction: (
    id: string,
    patch: Partial<Pick<Transaction, 'category' | 'domain' | 'note' | 'merchant'>>,
    opts?: { learnVendor?: boolean },
  ) => void
  // HEYRA/Haiku auto-tagger: cache-first, only web-searches merchants it has
  // never seen, then remembers the verdict in vendor_tags. Best-effort & idempotent.
  autoTagTransactions: () => Promise<void>
  // Create/replace a vendor-cache entry by hand. `reapply` rewrites every past
  // transaction from that vendor (used from the Vendors manager).
  setVendorTag: (
    key: string,
    patch: Partial<Omit<VendorTag, 'vendorKey' | 'updatedAt'>>,
    opts?: { reapply?: boolean },
  ) => void
  deleteVendorTag: (key: string) => void

  // Kyra
  logDog: (entry: Omit<DogEntry, 'id' | 'at'> & { at?: string }) => void
  deleteDogEntry: (id: string) => void
  updateDogEntry: (id: string, patch: Partial<Omit<DogEntry, 'id'>>) => void
  addDogMedical: (m: Omit<DogMedical, 'id'>) => void
  deleteDogMedical: (id: string) => void
  toggleDogReminder: (id: string) => void

  // Subscriptions
  addSubscription: (sub: Omit<Subscription, 'id'>) => void
  toggleSubscription: (id: string) => void
  deleteSubscription: (id: string) => void

  resetDemo: () => void
}

const seed = () => ({
  items: mock.seedItems,
  essentials: mock.essentials,
  threads: mock.threads,
  patterns: mock.patterns,
  dayLogs: mock.dayLogs,
  transactions: mock.transactions,
  habits: mock.habits,
  cleaningLog: {} as Record<string, boolean>,
  blocks: mock.blocks,
  nudge: mock.initialNudge,
  lastDigest: null,
  reflectCount: 0,
  planAdapted: false,
  activity: [] as ActivitySignal[],
  healthDays: mock.healthDays,
  checkins: [] as Checkin[],
  notificationPrefs: null as NotificationPrefs | null,
  screenDays: mock.screenDays,
  meetingDays: mock.meetingDays,
  projects: mock.projects,
  clients: mock.clients,
  messages: mock.messages,
  projectMilestones: [] as ProjectMilestone[],
  projectTasks: [] as ProjectTask[],
  projectHours: [] as HourEntry[],
  projectInvoices: [] as Invoice[],
  projectActivity: [] as ActivityEntry[],
  goals: mock.goals,
  milestones: mock.milestones,
  goalProposals: [] as GoalProposal[],
  proposingGoals: false,
  lastGoalProposalError: null as string | null,
  weekPlan: [] as PlanBlock[],
  weekPlanAt: null as string | null,
  planningWeek: false,
  lastPlanError: null as string | null,
  emails: mock.emails,
  payments: mock.payments,
  subscriptions: mock.subscriptions,
  holdings: mock.holdings,
  balanceCheckpoints: mock.balanceCheckpoints,
  stockQuotes: {} as Record<string, HoldingQuote>,
  fx: { EURUSD: null, EURGBP: null } as { EURUSD: number | null; EURGBP: number | null },
  loadingQuotes: false,
  financeCoach: null as { text: string; generatedAt: string } | null,
  financeCoachLoading: false,
  dogProfile: mock.dogProfile,
  dogEntries: mock.dogEntries,
  dogMedical: mock.dogMedical,
  dogReminders: mock.dogReminders,
  learnedFacts: [] as LearnedFact[],
  vendorTags: [] as VendorTag[],
  braindumpEntries: [] as BraindumpEntry[],
  inferences: [] as InferredItem[],
  wikiEntries: [] as WikiEntry[],
  people: [] as Person[],
  interactions: [] as Interaction[],
  adminItems: [] as AdminItem[],
  healthConditions: [] as HealthCondition[],
  summaries: [] as MemorySummary[],
  businessIdeas: [] as BusinessIdea[],
  settings: { hourlyRate: 0 } as AppSettings,
  dataSource: 'mock' as const,
  isLoading: true,
})

// ── Persisted-state rehydration ──────────────────────────────────────────────
// Fields that fall back to seeded demo data when the persisted value is an
// empty (or absent) array — stops a stale/empty localStorage payload from
// painting a blank screen.
const SEED_WHEN_EMPTY = [
  'healthDays', 'emails', 'transactions', 'meetingDays', 'projects', 'clients',
  'messages', 'goals', 'milestones', 'payments', 'subscriptions', 'dogEntries',
  'dogMedical', 'dogReminders', 'blocks', 'habits', 'essentials', 'patterns',
  'screenDays',
] as const
// Non-array (or length-agnostic) fields seeded when the persisted value is falsy.
const SEED_WHEN_FALSY = ['threads', 'nudge', 'dogProfile'] as const
// App-owned slices with no demo fallback — default to an empty array when absent
// (an empty result genuinely means "none yet").
const EMPTY_WHEN_FALSY = [
  'projectMilestones', 'projectTasks', 'projectHours', 'projectInvoices',
  'projectActivity', 'checkins', 'learnedFacts', 'vendorTags', 'braindumpEntries',
  'goalProposals', 'weekPlan', 'businessIdeas', 'wikiEntries',
  'holdings', 'balanceCheckpoints',
] as const

/**
 * Repair a rehydrated persisted state in place: seed the demo-backed slices that
 * came back empty, default the app-owned slices, and normalise the two scalar
 * fields. Extracted so the fallback rules live in one list instead of ~30
 * hand-written guards.
 */
export function applyPersistDefaults(
  state: Record<string, any>,
  seeded: Record<string, any>,
): void {
  for (const k of SEED_WHEN_EMPTY) if (!state[k]?.length) state[k] = seeded[k]
  for (const k of SEED_WHEN_FALSY) if (!state[k]) state[k] = seeded[k]
  for (const k of EMPTY_WHEN_FALSY) if (!state[k]) state[k] = []
  if (!state.cleaningLog) state.cleaningLog = {}
  if (state.notificationPrefs === undefined) state.notificationPrefs = null
  if (!state.settings) state.settings = seeded.settings
  if (!state.dataSource) state.dataSource = 'mock'
  // Transient flags never survive a reload — a page refresh mid-generation must
  // not leave a spinner stuck on.
  state.proposingGoals = false
  state.planningWeek = false
  state.loadingQuotes = false
  state.financeCoachLoading = false
  if (!state.stockQuotes) state.stockQuotes = {}
  if (state.financeCoach === undefined) state.financeCoach = null
  if (state.weekPlanAt === undefined) state.weekPlanAt = null
  if (state.lastGoalProposalError === undefined) state.lastGoalProposalError = null
  if (state.lastPlanError === undefined) state.lastPlanError = null
}

/** Guard so overlapping auto-tag runs (load + realtime) don't double-work. */
let autoTagRunning = false

const uid = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1000)}`

function pushSignal(activity: ActivitySignal[], s: Omit<ActivitySignal, 'id' | 'ts'>): ActivitySignal[] {
  return [{ id: uid('sig'), ts: new Date().toISOString(), ...s }, ...activity].slice(0, 30)
}

/** True for threads derived live from projects/clients (not worth persisting). */
const isDerivedThreadId = (id: string) => /^thr-(prj|cli)-/.test(id)

/** Only persist closed-state and captured threads — derived ones come from projects. */
function persistableThreads(threads: Thread[]): Thread[] {
  return threads.filter((t) => t.status === 'closed' || !isDerivedThreadId(t.id))
}

// ── Optimistic-write micro-helpers ─────────────────────────────────────────────
// The actions below repeat three shapes: optimistic create (temp id swapped for
// the real Supabase id once the insert lands), patch-one-row, and filter-delete.
// These are factories taking the creator's `set`/`get`, so sites with extra
// logic (activity signals, multi-slice deletes, …) can keep their custom sets.

type IdRow = { id: string }
/** State slices holding arrays of id-addressable rows (the optimistic-write slices). */
type IdSliceKey = { [K in keyof State]: State[K] extends IdRow[] ? K : never }[keyof State]
type StoreSet = (partial: Partial<State> | ((s: State) => Partial<State>)) => void

/** Optimistic create, step 2: swap the temp id for the real Supabase id once the insert lands. */
const swapTempId = (set: StoreSet, slice: IdSliceKey, tempId: string) => (realId: string | null) => {
  if (!realId) return
  set((s) => ({ [slice]: (s[slice] as IdRow[]).map((x) => (x.id === tempId ? { ...x, id: realId } : x)) } as unknown as Partial<State>))
}

/** Optimistic patch: apply a partial onto one row of a slice. */
const patchSlice = (set: StoreSet, slice: IdSliceKey, id: string, patch: object) =>
  set((s) => ({ [slice]: (s[slice] as IdRow[]).map((x) => (x.id === id ? { ...x, ...patch } : x)) } as unknown as Partial<State>))

/** Optimistic delete: drop one row from a slice. */
const removeFromSlice = (set: StoreSet, slice: IdSliceKey, id: string) =>
  set((s) => ({ [slice]: (s[slice] as IdRow[]).filter((x) => x.id !== id) } as unknown as Partial<State>))

/** Push the persistable brain state (threads + patterns) to Supabase. */
const persistBrain = (get: () => State) =>
  void persistBrainState(persistableThreads(get().threads), get().patterns)

/**
 * Object-permanence follow-up: mark a client contacted "now" (optimistic +
 * persisted) whenever a message links to them, so the CRM health dot resets.
 * No-op when there's no client or the id isn't in the store.
 */
function touchClientContact(set: StoreSet, get: () => State, clientId: string | null | undefined): void {
  if (!clientId || !get().clients.some((c) => c.id === clientId)) return
  const now = new Date().toISOString()
  patchSlice(set, 'clients', clientId, { lastContactedAt: now })
  void updateClientRow(clientId, { lastContactedAt: now })
}

/**
 * Flip `sent` invoices whose due date has passed to `overdue` for display. The
 * notify-tick cron writes this back server-side; reconciling in-memory keeps the
 * status badges correct without waiting for the next tick.
 */
function reconcileInvoices(list: Invoice[]): Invoice[] {
  const day = today()
  return list.map((i) => (i.status === 'sent' && i.dueOn && i.dueOn < day ? { ...i, status: 'overdue' as const } : i))
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...seed(),

      capture: async (text, source, opts, precomputed) => {
        const c = precomputed ?? (await classifyWithBrain(text, source))
        const openThread = opts?.openThread !== false
        const item: StructuredItem = {
          id: uid('item'),
          text,
          source,
          createdAt: new Date().toISOString(),
          ...c,
        }
        set((s) => {
          // a captured task or vent with a "promise" shape opens a thread (REMEMBER)
          const threads = [...s.threads]
          if (c.kind === 'task' && openThread) {
            threads.unshift({
              id: uid('thr'),
              domain: c.domain,
              title: c.summary,
              owedTo: 'self (captured)',
              due: null,
              status: 'open',
              createdAt: new Date().toISOString(),
            })
          }
          return {
            items: [item, ...s.items],
            threads,
            activity: pushSignal(s.activity, {
              text: `Vastgelegd & geclassificeerd → ${DOMAIN_META[c.domain].label} · ${KIND_LABEL[c.kind]}`,
              domain: c.domain,
              loop: 'fast',
            }),
          }
        })
        // a new thread (owed loop) changes the persisted brain state
        if (c.kind === 'task' && openThread) persistBrain(get)
        return item
      },

      braindumpCapture: async (input) => {
        const rawText = input.text?.trim() || null
        const now = new Date().toISOString()
        // Optimistic row so the grid shows the item the instant it's captured.
        const tempId = uid('bd')
        const optimistic: BraindumpEntry = {
          id: tempId,
          createdAt: now,
          sourceKind: input.sourceKind,
          status: 'pending',
          title: input.title ?? null,
          sourceUrl: input.sourceUrl ?? null,
          markdown: null,
          summary: rawText ? rawText.slice(0, 140) : input.sourceUrl ?? null,
          domain: input.domain ?? null,
          kind: null,
          sentiment: null,
          tags: [],
          thumbUrl: null,
          meta: {},
          error: null,
        }
        set((s) => ({
          braindumpEntries: [optimistic, ...s.braindumpEntries],
          activity: pushSignal(s.activity, {
            text: `Braindump ontvangen → ${input.sourceKind}`,
            domain: input.domain ?? 'personal',
            loop: 'fast',
          }),
        }))

        // Stash the raw payload the edge function needs to enrich the row: raw
        // text goes in meta.rawText, an uploaded file's path in meta.storagePath,
        // and an optional domain hint in meta.domainHint.
        const meta: Record<string, unknown> = {}
        if (rawText) meta.rawText = rawText
        if (input.storagePath) meta.storagePath = input.storagePath
        if (input.domain) meta.domainHint = input.domain

        const row = await insertBraindumpEntry({
          sourceKind: input.sourceKind,
          title: input.title ?? null,
          sourceUrl: input.sourceUrl ?? null,
          meta,
        })
        if (!row) return null
        // Swap the temp row for the real one (keep the optimistic summary).
        set((s) => ({
          braindumpEntries: s.braindumpEntries.map((e) =>
            e.id === tempId ? { ...row, summary: row.summary ?? optimistic.summary } : e,
          ),
        }))
        void invokeBraindumpIngest(row.id)
        return row
      },

      deleteBraindumpEntry: (id) => {
        removeFromSlice(set, 'braindumpEntries', id)
        void deleteBraindumpEntryRow(id)
      },

      retryBraindumpEntry: (id) => {
        set((s) => ({
          braindumpEntries: s.braindumpEntries.map((e) =>
            e.id === id ? { ...e, status: 'pending', error: null } : e,
          ),
        }))
        void resetBraindumpEntryRow(id).then(() => invokeBraindumpIngest(id))
      },

      importClaudeConversations: async (records) => {
        if (!records.length) return { imported: 0, skipped: 0 }

        // Dedup against anything already imported from a Claude export, so
        // re-uploading a fresh export only adds the new conversations.
        const seen = new Set<string>()
        for (const e of get().braindumpEntries) {
          const cid = e.meta?.conversationId
          if (e.meta?.source === 'claude-export' && typeof cid === 'string') seen.add(cid)
        }
        const fresh = records.filter((r) => !seen.has(r.conversationId))
        if (!fresh.length) return { imported: 0, skipped: records.length }

        const rows = fresh.map((r) => ({
          title: r.title,
          markdown: r.markdown,
          summary: r.summary,
          // A general Claude chat isn't tied to one business area.
          domain: 'cross' as Domain,
          kind: 'note' as const,
          sentiment: 'neutral' as const,
          tags: r.tags,
          meta: {
            source: 'claude-export',
            conversationId: r.conversationId,
            messageCount: r.messageCount,
            claudeCreatedAt: r.createdAt,
            claudeUpdatedAt: r.updatedAt,
          },
        }))

        // Insert in chunks so a large export doesn't hit payload limits; prepend
        // each batch as it lands so the grid fills in progressively.
        const CHUNK = 50
        let imported = 0
        for (let i = 0; i < rows.length; i += CHUNK) {
          const inserted = await insertReadyBraindumpEntries(rows.slice(i, i + CHUNK))
          if (inserted.length) {
            imported += inserted.length
            set((s) => ({ braindumpEntries: [...inserted, ...s.braindumpEntries] }))
          }
        }
        if (imported) {
          set((s) => ({
            activity: pushSignal(s.activity, {
              text: `${imported} Claude-gesprek(ken) geïmporteerd in je kennis`,
              domain: 'cross',
              loop: 'fast',
            }),
          }))
        }
        return { imported, skipped: records.length - fresh.length }
      },

      captureBusinessIdea: async (input) => {
        const now = new Date().toISOString()
        const tempId = uid('idea')
        const optimistic: BusinessIdea = {
          id: tempId,
          createdAt: now,
          updatedAt: now,
          source: input.source,
          rawInput: input.rawInput,
          elaborationStatus: 'pending',
          error: null,
          status: 'idea',
          title: input.title,
          overview: null,
          domain: input.domain ?? 'cross',
          tags: [],
          feasibilityScore: null,
          feasibilityReasoning: null,
          timeline: null,
          milestones: [],
          financials: { investmentNeeded: null, revenueProjection: [], costs: [], breakEven: null, notes: null },
          risks: [],
          opportunities: [],
          swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
          markdown: null,
          tier: 'normaal',
        }
        set((s) => ({
          businessIdeas: [optimistic, ...s.businessIdeas],
          activity: pushSignal(s.activity, {
            text: `Nieuw idee vastgelegd → ${input.title}`,
            domain: input.domain ?? 'cross',
            loop: 'fast',
          }),
        }))

        const row = await insertBusinessIdeaRow(input)
        if (!row) {
          // Insert failed (offline, RLS, or the table isn't deployed yet) — flip
          // the optimistic row to failed instead of leaving it spinning forever
          // with no feedback and no real id to retry against.
          set((s) => ({
            businessIdeas: s.businessIdeas.map((x) =>
              x.id === tempId
                ? { ...x, elaborationStatus: 'failed', error: 'Opslaan is mislukt — controleer je verbinding en probeer opnieuw.' }
                : x,
            ),
          }))
          return null
        }
        set((s) => ({
          businessIdeas: s.businessIdeas.map((x) => (x.id === tempId ? row : x)),
        }))
        void invokeIdeaElaborate(row.id)
        return row
      },

      updateBusinessIdea: (id, patch) => {
        set((s) => ({
          businessIdeas: s.businessIdeas.map((x) => (x.id === id ? { ...x, ...patch } : x)),
        }))
        void updateBusinessIdeaRow(id, patch)
      },

      deleteBusinessIdea: (id) => {
        set((s) => ({ businessIdeas: s.businessIdeas.filter((x) => x.id !== id) }))
        void deleteBusinessIdeaRow(id)
      },

      retryIdeaElaboration: (id) => {
        // A non-DB id means the original insert never landed — there's no real
        // row for the edge function to work with, so retrying would just fail
        // silently again. Tell the user to delete and recapture instead.
        if (!isDbId(id)) {
          set((s) => ({
            businessIdeas: s.businessIdeas.map((x) =>
              x.id === id ? { ...x, error: 'Dit idee is nooit opgeslagen — verwijder het en probeer opnieuw.' } : x,
            ),
          }))
          return
        }
        set((s) => ({
          businessIdeas: s.businessIdeas.map((x) =>
            x.id === id ? { ...x, elaborationStatus: 'pending', error: null } : x,
          ),
        }))
        void invokeIdeaElaborate(id)
      },

      toggleIdeaMilestone: (id, index) => {
        const idea = get().businessIdeas.find((x) => x.id === id)
        if (!idea) return
        const milestones = idea.milestones.map((m, i) => (i === index ? { ...m, done: !m.done } : m))
        set((s) => ({
          businessIdeas: s.businessIdeas.map((x) => (x.id === id ? { ...x, milestones } : x)),
        }))
        void updateBusinessIdeaRow(id, { milestones })
      },

      learnFromExchange: async (userText, heyraText) => {
        const existing = get().learnedFacts
        const fresh = await extractFacts(userText, heyraText, existing)
        if (!fresh.length) return []
        const { merged, added } = mergeFacts(existing, fresh)
        if (!added.length) return []
        set({ learnedFacts: merged })
        void persistLearnedFacts(merged)
        return added
      },

      // Corrects a wrong/stale learned fact from the Geheugen screen — the only
      // way to remove one until now was implicitly (it just aged out past
      // MAX_FACTS). persistLearnedFacts writes the whole array (heyra_memory
      // is one JSONB row per user), so a filter + full rewrite is correct here.
      forgetLearnedFact: (id) => {
        set((s) => ({ learnedFacts: s.learnedFacts.filter((f) => f.id !== id) }))
        void persistLearnedFacts(get().learnedFacts)
      },

      addTask: (draft) => {
        const id = uid('thr')
        const due = draft.due ?? null
        set((s) => ({
          threads: [
            {
              id,
              domain: draft.domain,
              title: draft.title,
              owedTo: 'self (HEYRA)',
              due,
              status: 'open' as const,
              createdAt: new Date().toISOString(),
            },
            ...s.threads,
          ],
          activity: pushSignal(s.activity, {
            text: `Taak toegevoegd via HEYRA → ${DOMAIN_META[draft.domain].label}${draft.due ? ` · deadline ${draft.due.slice(5)}` : ''}`,
            domain: draft.domain,
            loop: 'fast',
          }),
        }))
        persistBrain(get)
        return id
      },

      closeThread: (id) => {
        set((s) => {
          const t = s.threads.find((x) => x.id === id)
          return {
            threads: s.threads.map((x) => (x.id === id ? { ...x, status: 'closed' } : x)),
            activity: t
              ? pushSignal(s.activity, { text: `Loop gesloten: ${t.title}`, domain: t.domain, loop: 'fast' })
              : s.activity,
          }
        })
        persistBrain(get)
      },

      reopenThread: (id) => {
        patchSlice(set, 'threads', id, { status: 'open' })
        persistBrain(get)
      },

      updateThread: (id, patch) => {
        patchSlice(set, 'threads', id, patch)
        persistBrain(get)
      },

      deleteThread: (id) => {
        // project/client loops are re-derived from live data on every recompute,
        // so hard-deleting one would just have it reappear — close it instead.
        if (isDerivedThreadId(id)) {
          get().closeThread(id)
          return
        }
        removeFromSlice(set, 'threads', id)
        persistBrain(get)
      },

      tickHabit: (id) => {
        const prev = get().habits.find((x) => x.id === id)
        if (!prev) return
        const day = today()
        const doneToday = !prev.doneToday
        set((s) => {
          const h = s.habits.find((x) => x.id === id)!
          const hist = new Set(h.history ?? [])
          if (doneToday) hist.add(day)
          else hist.delete(day)
          return {
            habits: s.habits.map((x) =>
              x.id === id
                ? {
                    ...x,
                    doneToday,
                    // Recompute from history, not ±1 — a real streak, not a tick counter.
                    streak: habitStreak(hist, day),
                    history: [...hist].sort(),
                  }
                : x,
            ),
            activity: pushSignal(s.activity, {
              text: `${doneToday ? 'Afgevinkt' : 'Teruggezet'}: ${h.name}`,
              domain: 'personal',
              loop: 'fast',
            }),
          }
        })
        void persistHabitTick(id, day, doneToday)
      },

      addHabit: (name, emoji, color) => {
        const tempId = uid('h')
        set((s) => ({
          habits: [
            ...s.habits,
            { id: tempId, name, emoji: emoji || '✅', color, streak: 0, doneToday: false, history: [] },
          ],
        }))
        void createHabitRow(name, emoji || '✅', color).then(swapTempId(set, 'habits', tempId))
      },

      deleteHabit: (id) => {
        removeFromSlice(set, 'habits', id)
        void softDeleteHabitRow(id)
      },

      toggleCleaningTask: (taskKey, onDate) => {
        const day = onDate ?? today()
        const key = logKey(day, taskKey)
        const done = !get().cleaningLog[key]
        set((s) => ({ cleaningLog: { ...s.cleaningLog, [key]: done } }))
        void persistCleaningTick(taskKey, day, done)
      },

      completeBlock: (id) => {
        set((s) => {
          const b = s.blocks.find((x) => x.id === id)
          return {
            blocks: s.blocks.map((x) => (x.id === id ? { ...x, status: 'done' } : x)),
            activity: b
              ? pushSignal(s.activity, { text: `Blok voltooid: ${b.title}`, domain: b.domain, loop: 'fast' })
              : s.activity,
          }
        })
        void persistBlockStatus(id, 'done')
      },

      skipBlock: (id) => {
        set((s) => {
          const b = s.blocks.find((x) => x.id === id)
          return {
            blocks: s.blocks.map((x) => (x.id === id ? { ...x, status: 'skipped' } : x)),
            activity: b
              ? pushSignal(s.activity, {
                  text: `Blok overgeslagen: ${b.title} (trainingssignaal)`,
                  domain: b.domain,
                  loop: 'fast',
                })
              : s.activity,
          }
        })
        void persistBlockStatus(id, 'skipped')
      },

      resetBlock: (id) => {
        set((s) => ({ blocks: s.blocks.map((x) => (x.id === id ? { ...x, status: 'planned' } : x)) }))
        void persistBlockStatus(id, 'planned')
      },

      moveBlock: (id, dir) =>
        set((s) => {
          const i = s.blocks.findIndex((x) => x.id === id)
          const j = i + dir
          if (i < 0 || j < 0 || j >= s.blocks.length) return {}
          const blocks = [...s.blocks]
          ;[blocks[i], blocks[j]] = [blocks[j], blocks[i]]
          return { blocks }
        }),

      acceptPlan: () =>
        set((s) => ({
          activity: pushSignal(s.activity, {
            text: 'Dagplan van vandaag geaccepteerd',
            domain: 'personal',
            loop: 'fast',
          }),
        })),

      logCheckin: (energy, mood, note) => {
        const day = today()
        set((s) => {
          const others = s.checkins.filter((c) => c.date !== day)
          return {
            checkins: [{ date: day, energy, mood, note: note ?? null }, ...others],
            activity: pushSignal(s.activity, {
              text: `Check-in: energie ${energy}/5 · stemming ${mood}/5`,
              domain: 'personal',
              loop: 'fast',
            }),
          }
        })
        void upsertCheckin({ date: day, energy, mood, note: note ?? null })
        // Felt signal feeds Reflect immediately: rebuild dayLogs + nudge.
        get().recomputeBrain()
      },

      setNotificationPrefs: (p) => {
        set((s) => {
          // Default toggles mirror the DB column defaults, so adjusting a
          // toggle before the first /start (no row yet) still reflects
          // instantly instead of staying null until the next fetch.
          const base: NotificationPrefs = s.notificationPrefs ?? {
            telegramChatId: null,
            telegramUsername: null,
            linkedAt: null,
            morningBriefing: true,
            eveningCheckin: true,
            habitReminders: true,
            urgentAlerts: true,
            morningTime: '07:30',
            eveningTime: '20:00',
            habitTime: '21:00',
            quietHoursStart: null,
            quietHoursEnd: null,
          }
          return { notificationPrefs: { ...base, ...p } }
        })
        void upsertNotificationPrefs(p)
      },

      runNightlyReflect: () => {
        set((s) => {
          const deadlines = deriveDeadlines(s.projects)
          // Internal transfers between the user's own accounts aren't real
          // income/spend — excluded from every pattern/correlation below.
          const realTx = s.transactions.filter((t) => !isTransfer(t.category))
          // Live baseline observations are the evidence re-checked each pass.
          const evidenced = deriveBaselinePatterns(
            s.healthDays,
            s.screenDays,
            realTx,
            s.projects,
            s.clients,
          )
          const { digest, patterns } = runReflect(
            s.dayLogs,
            realTx,
            s.threads,
            s.patterns,
            evidenced,
            s.screenDays,
            s.meetingDays,
            deadlines,
            s.habits,
          )

          const reflectCount = s.reflectCount + 1

          // SLOW LOOP made visible: the nudge is regenerated from THIS pass's
          // digest — same builder as Today, so it's always coherent Dutch.
          const newNudge = buildNudge(s.threads, s.projects, digest.correlations, digest.anomalies, reflectCount)

          return {
            patterns,
            lastDigest: digest,
            reflectCount,
            planAdapted: true,
            nudge: newNudge,
            activity: pushSignal(s.activity, {
              text: `Nachtelijke reflectie uitgevoerd → ${digest.correlations.length} verband(en), ${digest.reinforced.length} patroon/patronen versterkt`,
              domain: 'cross',
              loop: 'slow',
            }),
          }
        })
        persistBrain(get)

        // Brain-assisted narrative: non-blocking, only ever narrates THIS
        // pass's already-evidenced correlations/anomalies (never invents new
        // ones). Guarded by ranAt so a second reflect pass started before this
        // resolves can't stamp a stale narrative onto a newer digest.
        const digestAtCall = get().lastDigest
        if (digestAtCall) {
          const prompt = buildNarrativePrompt(digestAtCall.correlations, digestAtCall.anomalies)
          if (prompt) {
            void askBrain(NARRATIVE_SYSTEM_PROMPT, prompt).then((narrative) => {
              if (!narrative) return
              set((s) => (s.lastDigest?.ranAt === digestAtCall.ranAt ? { lastDigest: { ...s.lastDigest, narrative } } : {}))
            })
          }
        }
      },

      toggleMilestone: (id) =>
        set((s) => {
          const m = s.milestones.find((x) => x.id === id)
          if (!m) return {}
          return {
            milestones: s.milestones.map((x) => (x.id === id ? { ...x, done: !x.done } : x)),
            activity: pushSignal(s.activity, {
              text: `Mijlpaal ${m.done ? 'heropend' : 'behaald'}: ${m.title}`,
              domain: 'cross',
              loop: 'fast',
            }),
          }
        }),

      addGoalMilestone: (goalId, title, due) => {
        const t = title.trim()
        if (!t) return
        set((s) => ({
          milestones: [...s.milestones, { id: uid('nsms'), goalId, title: t, done: false, due: due ?? null }],
          activity: pushSignal(s.activity, { text: `Mijlpaal toegevoegd: ${t}`, domain: 'cross', loop: 'fast' }),
        }))
      },

      deleteGoalMilestone: (id) => removeFromSlice(set, 'milestones', id),

      addGoal: (goal) => {
        const tempId = uid('goal')
        set((s) => ({
          goals: [...s.goals, { ...goal, id: tempId }],
          activity: pushSignal(s.activity, { text: `Doel toegevoegd: ${goal.title}`, domain: goal.domain, loop: 'slow' }),
        }))
        void createGoalRow(goal).then(swapTempId(set, 'goals', tempId))
        return tempId
      },

      updateGoal: (id, patch) => {
        set((s) => ({ goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) }))
        const g = get().goals.find((x) => x.id === id)
        if (g) void updateGoalRow(id, patch, g.target > 0 ? Math.min(1, g.current / g.target) : 0)
      },

      deleteGoal: (id) => {
        set((s) => {
          const g = s.goals.find((x) => x.id === id)
          return {
            goals: s.goals.filter((x) => x.id !== id),
            // North Star milestones hang off a goal — drop the orphans too.
            milestones: s.milestones.filter((m) => m.goalId !== id),
            activity: g ? pushSignal(s.activity, { text: `Doel verwijderd: ${g.title}`, domain: g.domain, loop: 'slow' }) : s.activity,
          }
        })
        void deleteGoalRow(id)
      },

      proposeGoals: async () => {
        set({ proposingGoals: true, lastGoalProposalError: null })
        const s = get()
        try {
          const proposals = await proposeGoalsAI({
            goals: s.goals,
            learnedFacts: s.learnedFacts,
            patterns: s.patterns,
            projects: s.projects,
            threads: s.threads,
            transactions: s.transactions,
          })
          set((st) => ({
            goalProposals: proposals,
            proposingGoals: false,
            activity: proposals.length
              ? pushSignal(st.activity, { text: `HEYRA stelt ${proposals.length} nieuw doel(en) voor`, domain: 'cross', loop: 'slow' })
              : st.activity,
          }))
        } catch (err) {
          console.warn('[OSLIFE] goal proposal failed', err)
          set({ proposingGoals: false, lastGoalProposalError: 'HEYRA kon nu geen doelen voorstellen — probeer het zo nog eens.' })
        }
      },

      acceptGoalProposal: (id) => {
        const p = get().goalProposals.find((x) => x.id === id)
        if (!p) return
        get().addGoal({
          title: p.title,
          metric: p.metric,
          target: p.target,
          current: p.current,
          deadline: p.deadline,
          domain: p.domain,
        })
        set((s) => ({ goalProposals: s.goalProposals.filter((x) => x.id !== id) }))
      },

      dismissGoalProposal: (id) =>
        set((s) => ({ goalProposals: s.goalProposals.filter((x) => x.id !== id) })),

      generateWeekPlan: async () => {
        set({ planningWeek: true, lastPlanError: null })
        try {
          const dates = weekDates(today())
          const allEvents = await fetchBlocksRange(dates[0], dates[dates.length - 1])
          const s = get()
          // Preserve blocks Rick already locked this session (not calendar rows,
          // and still within the current week) so a regenerate doesn't wipe them.
          const keepLocked = s.weekPlan.filter(
            (b) => b.locked && b.source !== 'calendar' && dates.includes(b.date),
          )
          // A locked block is also now a real day_blocks row, so it comes back
          // from fetchBlocksRange too — drop that duplicate in favour of the
          // richer locked version (which keeps its kind/rationale).
          const lockedKeys = new Set(keepLocked.map((b) => `${b.date}|${b.start}|${b.title}`))
          const events = allEvents.filter((e) => !lockedKeys.has(`${e.date}|${e.start}|${e.title}`))
          const busy = [...events, ...keepLocked]
          const proposed = await buildWeekPlan(dates, {
            events: busy,
            habits: s.habits,
            goals: s.goals,
            threads: s.threads,
            patterns: s.patterns,
          })
          set((st) => ({
            weekPlan: [...events, ...keepLocked, ...proposed],
            weekPlanAt: new Date().toISOString(),
            planningWeek: false,
            activity: pushSignal(st.activity, {
              text: `Dagplan gegenereerd voor ${dates.length} dag(en)`,
              domain: 'personal',
              loop: 'slow',
            }),
          }))
        } catch (err) {
          console.warn('[OSLIFE] week plan generation failed', err)
          set({ planningWeek: false, lastPlanError: 'Kon geen dagplan genereren — probeer het zo nog eens.' })
        }
      },

      lockPlanBlock: (id) => {
        const b = get().weekPlan.find((x) => x.id === id)
        if (!b || b.locked) return
        // Optimistic: mark locked (keeps its kind/rationale). It's now also a real
        // day_blocks row; generateWeekPlan dedupes that DB copy on the next run.
        set((s) => ({
          weekPlan: s.weekPlan.map((x) => (x.id === id ? { ...x, locked: true } : x)),
          activity: pushSignal(s.activity, { text: `Blok vergrendeld: ${b.title}`, domain: b.domain, loop: 'fast' }),
        }))
        void insertDayBlock({
          date: b.date,
          start: b.start,
          end: b.end,
          title: b.title,
          description: b.rationale,
          domain: b.domain,
        }).then(swapTempId(set, 'weekPlan', id))
      },

      dismissPlanBlock: (id) => {
        const b = get().weekPlan.find((x) => x.id === id)
        if (!b || b.source === 'calendar') return // never drop a real appointment
        removeFromSlice(set, 'weekPlan', id)
      },

      markEmailRead: (id) => {
        patchSlice(set, 'emails', id, { unread: false })
        void persistEmailRead(id, true)
      },

      markPaymentPaid: (id) => {
        set((s) => {
          const p = s.payments.find((x) => x.id === id)
          if (!p) return {}
          return {
            payments: s.payments.map((x) => (x.id === id ? { ...x, status: 'paid' } : x)),
            activity: pushSignal(s.activity, {
              text: `${p.direction === 'incoming' ? 'Ontvangen' : 'Betaald'}: ${p.payee} (€${p.amount})`,
              domain: p.domain,
              loop: 'fast',
            }),
          }
        })
        void persistPaymentStatus(id, 'paid')
      },

      deletePayment: (id) => {
        set((s) => {
          const p = s.payments.find((x) => x.id === id)
          if (!p) return {}
          return {
            payments: s.payments.filter((x) => x.id !== id),
            activity: pushSignal(s.activity, {
              text: `Betaling verwijderd: ${p.payee} (€${p.amount})`,
              domain: p.domain,
              loop: 'fast',
            }),
          }
        })
        void deletePaymentRow(id)
      },

      markAllEmailsRead: () => {
        set((s) => ({ emails: s.emails.map((x) => ({ ...x, unread: false })) }))
        void persistAllEmailsRead()
      },

      // ── CRM: clients ──────────────────────────────────────────────────────
      addClient: (client) => {
        const tempId = uid('cli')
        set((s) => ({
          clients: [{ ...client, id: tempId }, ...s.clients],
          activity: pushSignal(s.activity, { text: `Klant toegevoegd: ${client.name}`, domain: client.domain, loop: 'fast' }),
        }))
        void createClientRow(client).then((row) => swapTempId(set, 'clients', tempId)(row?.id ?? null))
      },

      updateClient: (id, patch) => {
        patchSlice(set, 'clients', id, patch)
        void updateClientRow(id, patch)
      },

      linkSenderToClient: (clientId, senderAddr) => {
        // Extract the bare address and, when it's not a free provider, its domain.
        const m = senderAddr.match(/<([^>]+)>/)
        const email = (m ? m[1] : senderAddr).trim().toLowerCase()
        if (!email.includes('@')) return
        const domain = email.slice(email.lastIndexOf('@') + 1)
        const FREE = new Set([
          'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.nl', 'outlook.com', 'outlook.nl',
          'live.com', 'live.nl', 'yahoo.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me',
          'protonmail.com', 'ziggo.nl', 'kpnmail.nl', 'telfort.nl', 'home.nl', 'planet.nl', 'hetnet.nl',
        ])
        const additions = [email, ...(domain && !FREE.has(domain) ? [domain] : [])]
        const client = get().clients.find((c) => c.id === clientId)
        if (!client) return
        const aliases = [...new Set([...(client.aliases ?? []), ...additions])]
        patchSlice(set, 'clients', clientId, { aliases })
        set((s) => ({
          activity: pushSignal(s.activity, { text: `Afzender gekoppeld aan ${client.name}`, domain: client.domain, loop: 'fast' }),
        }))
        void updateClientRow(clientId, { aliases })
      },

      deleteClient: (id) => {
        set((s) => ({
          clients: s.clients.filter((c) => c.id !== id),
          // orphan the projects locally too (FK does this server-side)
          projects: s.projects.map((p) => (p.clientId === id ? { ...p, clientId: null } : p)),
        }))
        void deleteClientRow(id)
      },

      // ── CRM: messages ─────────────────────────────────────────────────────
      markConversationRead: (contactKey) => {
        set((s) => ({
          messages: s.messages.map((m) => (m.contactKey === contactKey ? { ...m, unread: false } : m)),
        }))
        void markMessagesReadRow(contactKey)
      },

      addMessage: (msg) => {
        const tempId = uid('msg')
        set((s) => ({ messages: [{ ...msg, id: tempId }, ...s.messages] }))
        void createMessageRow(msg).then(swapTempId(set, 'messages', tempId))
        touchClientContact(set, get, msg.clientId)
      },

      deleteMessage: (id) => {
        removeFromSlice(set, 'messages', id)
        void deleteMessageRow(id)
      },

      importWhatsapp: async (raw, meNames, opts) => {
        const { messages } = parseWhatsapp(raw, meNames, opts ?? {})
        if (!messages.length) return { imported: 0, total: 0 }
        const imported = await insertMessages(messages)
        const fresh = await fetchClientMessages()
        if (fresh.length) set({ messages: fresh })
        set((s) => ({
          activity: pushSignal(s.activity, { text: `WhatsApp geïmporteerd: ${imported} bericht(en)`, domain: 'prjct', loop: 'fast' }),
        }))
        touchClientContact(set, get, opts?.clientId)
        return { imported, total: messages.length }
      },

      updateProject: (id, patch) => {
        set((s) => {
          const p = s.projects.find((x) => x.id === id)
          if (!p) return {}
          const progress =
            patch.status === 'done' ? 1
            : patch.status === 'review' ? Math.max(p.progress, 0.85)
            : patch.progress ?? p.progress
          return {
            projects: s.projects.map((x) =>
              x.id === id ? { ...x, ...patch, progress } : x
            ),
            activity: pushSignal(s.activity, {
              text: `Project "${p.name}" bijgewerkt`,
              domain: p.domain,
              loop: 'fast',
            }),
          }
        })
        const updated = get().projects.find((x) => x.id === id)
        if (updated) {
          void updateProjectRow(id, { ...patch, progress: updated.progress }).then((res) => {
            // The optimistic edit above only lives in local/persisted state. If the
            // DB write didn't land (RLS, stale id, offline) it would silently revert
            // on the next refresh/hydrate — so surface it instead of failing quietly.
            if (!res.ok) {
              console.warn(`[OSLIFE] project ${id} status/details did not persist to Supabase`, res)
              set((s) => ({
                activity: pushSignal(s.activity, {
                  text: `Let op: wijziging van "${updated.name}" is niet opgeslagen — probeer opnieuw`,
                  domain: updated.domain,
                  loop: 'fast',
                }),
              }))
            }
          })
        }
      },

      addProject: (project) => {
        const tempId = uid('prj')
        set((s) => ({
          projects: [{ ...project, id: tempId }, ...s.projects],
          activity: pushSignal(s.activity, { text: `Project aangemaakt: ${project.name}`, domain: project.domain, loop: 'fast' }),
        }))
        void createProjectRow(project).then((row) => swapTempId(set, 'projects', tempId)(row?.id ?? null))
      },

      deleteProject: (id) => {
        set((s) => ({
          projects: s.projects.filter((p) => p.id !== id),
          projectMilestones: s.projectMilestones.filter((m) => m.projectId !== id),
          projectTasks: s.projectTasks.filter((t) => t.projectId !== id),
          projectHours: s.projectHours.filter((h) => h.projectId !== id),
          projectInvoices: s.projectInvoices.filter((i) => i.projectId !== id),
          projectActivity: s.projectActivity.filter((a) => a.projectId !== id),
        }))
        void deleteProjectRow(id)
      },

      // HEYRA Klant-intake: awaits each write in sequence (unlike addProject/
      // addProjectTask's fire-and-forget temp-id pattern) so tasks are only
      // inserted once the project has a real Supabase id to attach to.
      createClientIntake: async ({ client, existingClientId, project, tasks, message }) => {
        let clientId = existingClientId ?? null

        if (client) {
          const row = await createClientRow(client)
          if (row) {
            clientId = row.id
            set((s) => ({
              clients: [row, ...s.clients],
              activity: pushSignal(s.activity, { text: `Klant toegevoegd: ${row.name}`, domain: row.domain, loop: 'fast' }),
            }))
          }
        }

        let projectId: string | null = null

        if (project) {
          const projectRow = await createProjectRow({ ...project, clientId })
          if (projectRow) {
            projectId = projectRow.id
            set((s) => ({
              projects: [projectRow, ...s.projects],
              activity: pushSignal(s.activity, { text: `Project aangemaakt: ${projectRow.name}`, domain: projectRow.domain, loop: 'fast' }),
            }))

            if (tasks.length) {
              const created = (
                await Promise.all(
                  tasks.map(async (name) => {
                    const realId = await createProjectTaskRow(projectId!, { name, done: false })
                    return realId ? { id: realId, projectId: projectId!, name, done: false } : null
                  }),
                )
              ).filter((t): t is ProjectTask => t !== null)
              if (created.length) set((s) => ({ projectTasks: [...s.projectTasks, ...created] }))
            }
          }
        }

        const realMsgId = await createMessageRow({ ...message, clientId, projectId })
        if (realMsgId) {
          set((s) => ({ messages: [{ ...message, clientId, projectId, id: realMsgId }, ...s.messages] }))
        }
        touchClientContact(set, get, clientId)

        return { clientId, projectId }
      },

      createProjectWithTemplate: async (project, taskNames) => {
        const projectRow = await createProjectRow(project)
        if (!projectRow) return null
        set((s) => ({
          projects: [projectRow, ...s.projects],
          activity: pushSignal(s.activity, { text: `Project aangemaakt: ${projectRow.name}`, domain: projectRow.domain, loop: 'fast' }),
        }))

        if (taskNames.length) {
          const created = (
            await Promise.all(
              taskNames.map(async (name) => {
                const realId = await createProjectTaskRow(projectRow.id, { name, done: false })
                return realId ? { id: realId, projectId: projectRow.id, name, done: false } : null
              }),
            )
          ).filter((t): t is ProjectTask => t !== null)
          if (created.length) set((s) => ({ projectTasks: [...s.projectTasks, ...created] }))
        }

        return projectRow.id
      },

      // ── Milestones ─────────────────────────────────────────────────────────
      addMilestone: (projectId, m) => {
        const tempId = uid('ms')
        set((s) => ({ projectMilestones: [...s.projectMilestones, { ...m, id: tempId, projectId }] }))
        void createMilestoneRow(projectId, m).then(swapTempId(set, 'projectMilestones', tempId))
      },

      updateMilestone: (id, patch) => {
        // keep done/progress coherent
        const next = { ...patch }
        if (patch.progress != null) next.done = patch.progress >= 1
        if (patch.done != null) next.progress = patch.done ? 1 : Math.min(0.99, get().projectMilestones.find((m) => m.id === id)?.progress ?? 0)
        patchSlice(set, 'projectMilestones', id, next)
        void updateMilestoneRow(id, next)
      },

      deleteMilestone: (id) => {
        removeFromSlice(set, 'projectMilestones', id)
        void deleteMilestoneRow(id)
      },

      // ── Project tasks (one-time + recurring) ───────────────────────────────
      addProjectTask: (projectId, task) => {
        const tempId = uid('ptask')
        set((s) => ({ projectTasks: [...s.projectTasks, { ...task, id: tempId, projectId }] }))
        void createProjectTaskRow(projectId, task).then(swapTempId(set, 'projectTasks', tempId))
      },

      toggleProjectTask: (taskId, done) => {
        const t = get().projectTasks.find((x) => x.id === taskId)
        if (!t) return
        // A recurring task isn't "done" — it rolls its due date to the next cycle.
        if (done && t.recurrence) {
          const every = t.recurEvery ?? 1
          const base = new Date((t.dueDate ?? today()).slice(0, 10) + 'T00:00:00')
          if (t.recurrence === 'daily') base.setDate(base.getDate() + every)
          else if (t.recurrence === 'weekly') base.setDate(base.getDate() + 7 * every)
          else base.setMonth(base.getMonth() + every)
          // Local getters, not toISOString() — the latter rolls the next due date
          // a day early in Europe/Amsterdam.
          const nextDue = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`
          const patch = { done: false, lastDoneOn: today(), dueDate: nextDue }
          patchSlice(set, 'projectTasks', taskId, patch)
          void updateProjectTaskRow(taskId, patch)
          return
        }
        // Patch lastDoneOn locally too (not just in the DB write) — Today's
        // "Vandaag afmaken" counts done-today via lastDoneOn, so omitting it here
        // made a just-completed task vanish from the Dopamine bar until reload.
        const patch = { done, lastDoneOn: done ? today() : null }
        patchSlice(set, 'projectTasks', taskId, patch)
        void updateProjectTaskRow(taskId, patch)
      },

      deleteProjectTask: (id) => {
        removeFromSlice(set, 'projectTasks', id)
        void deleteProjectTaskRow(id)
      },

      // ── Hours (time tracker) ───────────────────────────────────────────────
      addHours: (projectId, h) => {
        const tempId = uid('hr')
        set((s) => ({ projectHours: [{ ...h, id: tempId, projectId }, ...s.projectHours] }))
        void createHourRow(projectId, h).then(swapTempId(set, 'projectHours', tempId))
      },

      deleteHours: (id) => {
        removeFromSlice(set, 'projectHours', id)
        void deleteHourRow(id)
      },

      // ── Invoices ───────────────────────────────────────────────────────────
      addInvoice: (projectId, inv) => {
        const tempId = uid('inv')
        set((s) => ({ projectInvoices: [{ ...inv, id: tempId, projectId }, ...s.projectInvoices] }))
        void createInvoiceRow(projectId, inv).then(swapTempId(set, 'projectInvoices', tempId))
      },

      updateInvoice: (id, patch) => {
        patchSlice(set, 'projectInvoices', id, patch)
        void updateInvoiceRow(id, patch)
      },

      deleteInvoice: (id) => {
        removeFromSlice(set, 'projectInvoices', id)
        void deleteInvoiceRow(id)
      },

      // One-click invoice from a project's unbilled billable hours × global rate.
      generateInvoiceFromHours: (projectId) => {
        const rate = get().settings.hourlyRate
        const entries = unbilledBillableHours(get().projectHours.filter((h) => h.projectId === projectId))
        const totalHours = sumHours(entries)
        if (rate <= 0 || totalHours <= 0) return
        const amount = invoiceAmountFromHours(entries, rate)
        const ids = entries.map((h) => h.id)
        // Draft invoice (fire-and-forget temp-id create via addInvoice).
        get().addInvoice(projectId, {
          number: '',
          amount,
          status: 'draft',
          issuedOn: today(),
          dueOn: null,
          paidOn: null,
          note: `${totalHours}u × €${rate}/u`,
        })
        // Flag the hours billed so they aren't invoiced twice.
        set((s) => ({ projectHours: s.projectHours.map((h) => (ids.includes(h.id) ? { ...h, billed: true } : h)) }))
        void markHoursBilled(ids)
      },

      setHourlyRate: (rate) => {
        set((s) => ({ settings: { ...s.settings, hourlyRate: rate } }))
        void upsertAppSettings({ hourlyRate: rate })
      },

      // ── Activity logger (analyse → take action) ────────────────────────────
      logActivity: (projectId, body) => {
        const s0 = get()
        const tasks = s0.projectTasks.filter((t) => t.projectId === projectId)
        const milestones = s0.projectMilestones.filter((m) => m.projectId === projectId)
        const analysis = analyzeActivity(body, tasks, milestones)

        // Take the proposed action when it's confident enough.
        const apply = analysis.confidence >= 0.45 && analysis.match
        if (apply && analysis.match) {
          if (analysis.action === 'complete' && analysis.match.type === 'task') {
            get().toggleProjectTask(analysis.match.id, true)
          } else if (analysis.action === 'progress' && analysis.match.type === 'milestone' && analysis.progress != null) {
            get().updateMilestone(analysis.match.id, { progress: analysis.progress })
          }
        }

        const tempId = uid('act')
        const entry: ActivityEntry = {
          id: tempId,
          projectId,
          body,
          createdAt: new Date().toISOString(),
          linkType: analysis.match?.type ?? null,
          linkId: analysis.match?.id ?? null,
          action: apply ? (analysis.action === 'complete' ? 'completed' : analysis.action === 'progress' ? 'progress' : 'linked') : analysis.match ? 'linked' : null,
        }
        set((s) => ({
          projectActivity: [entry, ...s.projectActivity],
          activity: pushSignal(s.activity, { text: `Activiteit gelogd${analysis.match ? ` → ${analysis.reason}` : ''}`, domain: 'prjct', loop: 'fast' }),
        }))
        void createActivityRow(projectId, {
          body: entry.body, linkType: entry.linkType, linkId: entry.linkId, action: entry.action,
        }).then(swapTempId(set, 'projectActivity', tempId))
        return analysis
      },

      deleteActivity: (id) => {
        removeFromSlice(set, 'projectActivity', id)
        void deleteActivityRow(id)
      },

      addTransactions: (txns) =>
        set((s) => {
          if (!txns.length) return {}
          const merged = [...txns, ...s.transactions].sort((a, b) => (a.date < b.date ? 1 : -1))
          return {
            transactions: merged,
            activity: pushSignal(s.activity, {
              text: `${txns.length} banktransactie(s) geïmporteerd`,
              domain: 'personal',
              loop: 'fast',
            }),
          }
        }),

      // ABN AMRO CSV import → persists to finance_tx (dedup vs the Betalingen
      // sheet via a shared date|amount key) and reconciles from the server.
      importTransactions: async (txns) => {
        if (!txns.length) return { inserted: 0, duplicates: 0 }
        const key = (t: Transaction) => `${t.date}|${t.amount}|${t.merchant.toLowerCase()}`
        set((s) => {
          const seen = new Set(s.transactions.map(key))
          const fresh = txns.filter((t) => !seen.has(key(t)))
          if (!fresh.length) return {}
          return {
            transactions: [...fresh, ...s.transactions].sort((a, b) => (a.date < b.date ? 1 : -1)),
            activity: pushSignal(s.activity, {
              text: `Geïmporteerd: ${fresh.length} banktransactie(s)`,
              domain: 'personal',
              loop: 'fast',
            }),
          }
        })
        const inserted = await insertFinanceTx(txns)
        const fresh = await fetchTransactions()
        if (fresh.length) set({ transactions: fresh })
        // Categorise anything the rule-based guesser left as Uncategorized.
        void get().autoTagTransactions()
        return { inserted, duplicates: txns.length - inserted }
      },

      updateTransaction: (id, patch, opts) => {
        patchSlice(set, 'transactions', id, patch)
        void updateFinanceTxRow(id, patch)
        // Teach the vendor cache from a manual category/domain change so the next
        // transaction from this merchant tags itself — but don't rewrite history.
        const t = get().transactions.find((x) => x.id === id)
        const learns = opts?.learnVendor !== false && (patch.category !== undefined || patch.domain !== undefined)
        if (t && learns) {
          get().setVendorTag(
            vendorKey(t.merchant),
            { vendorName: t.merchant, category: t.category, domain: t.domain, source: 'manual', confidence: 1 },
            { reapply: false },
          )
        }
      },

      deleteTransaction: (id) => {
        set((s) => {
          const t = s.transactions.find((x) => x.id === id)
          if (!t) return {}
          return {
            transactions: s.transactions.filter((x) => x.id !== id),
            activity: pushSignal(s.activity, {
              text: `Transactie verwijderd: ${t.merchant} (${t.amount > 0 ? '+' : ''}€${t.amount})`,
              domain: t.domain,
              loop: 'fast',
            }),
          }
        })
        void deleteFinanceTxRow(id)
      },

      setVendorTag: (key, patch, opts) => {
        if (!key) return
        const existing = get().vendorTags.find((v) => v.vendorKey === key)
        const tag: VendorTag = {
          vendorKey: key,
          vendorName: patch.vendorName ?? existing?.vendorName ?? key,
          category: patch.category ?? existing?.category ?? 'Other',
          domain: patch.domain ?? existing?.domain ?? 'personal',
          info: patch.info ?? existing?.info ?? '',
          source: patch.source ?? existing?.source ?? 'manual',
          confidence: patch.confidence ?? (patch.source === 'manual' ? 1 : existing?.confidence ?? 0.5),
          updatedAt: new Date().toISOString(),
        }
        set((s) => ({ vendorTags: [tag, ...s.vendorTags.filter((v) => v.vendorKey !== key)] }))
        void upsertVendorTag(tag)

        if (opts?.reapply) {
          const ids = get().transactions.filter((t) => vendorKey(t.merchant) === key).map((t) => t.id)
          if (ids.length) {
            set((s) => ({
              transactions: s.transactions.map((t) =>
                vendorKey(t.merchant) === key ? { ...t, category: tag.category, domain: tag.domain, autoTagged: true } : t,
              ),
            }))
            void applyCategoryToTxIds(ids, tag.category, tag.domain)
          }
        }
      },

      deleteVendorTag: (key) => {
        set((s) => ({ vendorTags: s.vendorTags.filter((v) => v.vendorKey !== key) }))
        void deleteVendorTagRow(key)
      },

      // Cache-first auto-tagger. Pass 1 applies known vendors to still-untagged
      // rows (free). Pass 2 asks Haiku (web search) about merchants never seen
      // before, stores the verdict and applies it. Only touches rows the rules
      // left Uncategorized, so a manual/rule category is never clobbered.
      autoTagTransactions: async () => {
        if (autoTagRunning) return
        autoTagRunning = true
        try {
          // ── Pass 1: apply the cache (no network) ──
          {
            const cache = new Map(get().vendorTags.map((v) => [v.vendorKey, v]))
            const byTag = new Map<string, { category: string; domain: Domain; ids: string[] }>()
            for (const t of get().transactions) {
              if (t.autoTagged || !isUntagged(t.category)) continue
              const tag = cache.get(vendorKey(t.merchant))
              if (!tag) continue
              const g = byTag.get(tag.vendorKey) ?? { category: tag.category, domain: tag.domain, ids: [] }
              g.ids.push(t.id)
              byTag.set(tag.vendorKey, g)
            }
            if (byTag.size) {
              const patched = new Map<string, { category: string; domain: Domain }>()
              for (const g of byTag.values()) g.ids.forEach((id) => patched.set(id, { category: g.category, domain: g.domain }))
              set((s) => ({
                transactions: s.transactions.map((t) =>
                  patched.has(t.id) ? { ...t, ...patched.get(t.id)!, autoTagged: true } : t,
                ),
              }))
              for (const g of byTag.values()) void applyCategoryToTxIds(g.ids, g.category, g.domain)
            }
          }

          // ── Pass 2: discover unknown vendors via Haiku + web search ──
          const cache = new Map(get().vendorTags.map((v) => [v.vendorKey, v]))
          const unknown = new Map<string, { name: string; amount: number; ids: string[] }>()
          for (const t of get().transactions) {
            // Only spend an AI lookup on persisted rows (skip mock/seed data).
            if (!isDbId(t.id) || t.autoTagged || !isUntagged(t.category)) continue
            const key = vendorKey(t.merchant)
            if (!key || cache.has(key)) continue
            const g = unknown.get(key) ?? { name: t.merchant, amount: t.amount, ids: [] }
            g.ids.push(t.id)
            unknown.set(key, g)
          }

          // Cap lookups per run to keep cost bounded; the rest get picked up next time.
          for (const key of [...unknown.keys()].slice(0, 15)) {
            const g = unknown.get(key)!
            const verdict = await categorizeVendor(g.name, { amount: g.amount })
            if (!verdict) continue
            const tag: VendorTag = {
              vendorKey: key,
              vendorName: g.name,
              category: verdict.category,
              domain: verdict.domain,
              info: verdict.info,
              source: 'ai',
              confidence: verdict.confidence,
              updatedAt: new Date().toISOString(),
            }
            set((s) => ({
              vendorTags: [tag, ...s.vendorTags.filter((v) => v.vendorKey !== key)],
              transactions: s.transactions.map((t) =>
                g.ids.includes(t.id) ? { ...t, category: tag.category, domain: tag.domain, autoTagged: true } : t,
              ),
              activity: pushSignal(s.activity, {
                text: `Getagd door HEYRA: ${g.name} → ${tag.category}`,
                domain: tag.domain,
                loop: 'fast',
              }),
            }))
            void upsertVendorTag(tag)
            void applyCategoryToTxIds(g.ids, tag.category, tag.domain)
          }
        } finally {
          autoTagRunning = false
        }
      },

      logDog: (entry) => {
        const tempId = uid('dog')
        const at = entry.at ?? new Date().toISOString()
        const e: DogEntry = { id: tempId, at, ...entry }
        set((s) => ({
          dogEntries: [e, ...s.dogEntries],
          activity: pushSignal(s.activity, { text: `Kyra: ${entry.kind} gelogd`, domain: 'personal', loop: 'fast' }),
        }))
        void createDogEntryRow({
          kind: e.kind, at: e.at, durationMin: e.durationMin, distanceKm: e.distanceKm, note: e.note,
        }).then(swapTempId(set, 'dogEntries', tempId))
      },

      deleteDogEntry: (id) => {
        removeFromSlice(set, 'dogEntries', id)
        void deleteDogEntryRow(id)
      },

      updateDogEntry: (id, patch) => {
        patchSlice(set, 'dogEntries', id, patch)
        void updateDogEntryRow(id, patch)
      },

      addDogMedical: (m) =>
        set((s) => ({ dogMedical: [{ ...m, id: uid('dmed') }, ...s.dogMedical] })),

      deleteDogMedical: (id) => removeFromSlice(set, 'dogMedical', id),

      toggleDogReminder: (id) =>
        set((s) => ({ dogReminders: s.dogReminders.map((x) => (x.id === id ? { ...x, done: !x.done } : x)) })),

      addSubscription: (sub) => {
        const tempId = uid('sub')
        set((s) => ({ subscriptions: [{ ...sub, id: tempId }, ...s.subscriptions] }))
        void createSubscriptionRow(sub).then(swapTempId(set, 'subscriptions', tempId))
      },

      toggleSubscription: (id) => {
        set((s) => ({ subscriptions: s.subscriptions.map((x) => (x.id === id ? { ...x, active: !x.active } : x)) }))
        const updated = get().subscriptions.find((x) => x.id === id)
        if (updated) void updateSubscriptionRow(id, { active: updated.active })
      },

      deleteSubscription: (id) => {
        removeFromSlice(set, 'subscriptions', id)
        void deleteSubscriptionRow(id)
      },

      addPayment: (payment) => {
        const tempId = uid('pay')
        set((s) => ({
          payments: [{ ...payment, id: tempId, status: 'open', source: 'manual' }, ...s.payments],
          activity: pushSignal(s.activity, { text: `Betaling toegevoegd: ${payment.payee} (€${payment.amount})`, domain: payment.domain, loop: 'fast' }),
        }))
        void createPaymentRow(payment).then(swapTempId(set, 'payments', tempId))
      },

      addHolding: (holding) => {
        const tempId = uid('hold')
        set((s) => ({ holdings: [{ ...holding, id: tempId }, ...s.holdings] }))
        void createHoldingRow(holding).then(swapTempId(set, 'holdings', tempId))
        void get().refreshStockQuotes()
      },

      deleteHolding: (id) => {
        removeFromSlice(set, 'holdings', id)
        void deleteHoldingRow(id)
      },

      refreshStockQuotes: async () => {
        const tickers = [...new Set(get().holdings.map((h) => h.ticker))]
        if (!tickers.length) return
        set({ loadingQuotes: true })
        try {
          const { quotes, fx } = await fetchStockQuotes(tickers)
          set((s) => ({ stockQuotes: { ...s.stockQuotes, ...quotes }, fx, loadingQuotes: false }))
        } catch {
          set({ loadingQuotes: false })
        }
      },

      addBalanceCheckpoint: (amount, asOf, note) => {
        const tempId = uid('bal')
        set((s) => ({
          balanceCheckpoints: [{ id: tempId, amount, asOf, note: note ?? null, createdAt: new Date().toISOString() }, ...s.balanceCheckpoints],
          activity: pushSignal(s.activity, { text: `Saldo bijgewerkt naar €${amount}`, domain: 'personal', loop: 'fast' }),
        }))
        void createBalanceCheckpointRow({ amount, asOf, note: note ?? null }).then(swapTempId(set, 'balanceCheckpoints', tempId))
      },

      deleteBalanceCheckpoint: (id) => {
        removeFromSlice(set, 'balanceCheckpoints', id)
        void deleteBalanceCheckpointRow(id)
      },

      refreshFinanceCoach: async () => {
        set({ financeCoachLoading: true })
        const s = get()
        try {
          const { system, prompt } = buildFinanceCoachPrompt(s)
          const text = await askBrain(system, prompt, { maxTokens: 500 })
          set({
            financeCoach: text ? { text, generatedAt: new Date().toISOString() } : get().financeCoach,
            financeCoachLoading: false,
          })
        } catch {
          set({ financeCoachLoading: false })
        }
      },

      recomputeBrain: () => {
        const s = get()
        const essentials = deriveEssentials(s.clients, s.projects, s.goals, s.dogEntries)
        // Fold the felt signal (energy/mood) onto health days + day logs.
        const healthDays = applyCheckins(s.healthDays, s.checkins)
        const dayLogs = deriveDayLogs(healthDays, s.checkins)
        const deadlines = deriveDeadlines(s.projects)
        // Internal transfers between the user's own accounts aren't real
        // income/spend — excluded from the baseline pattern's spend observation.
        const baseline = deriveBaselinePatterns(
          s.healthDays,
          s.screenDays,
          s.transactions.filter((t) => !isTransfer(t.category)),
          s.projects,
          s.clients,
        )

        // Threads: re-derive open loops from projects/clients, but preserve the
        // status of any thread already in the store (a closed loop stays closed)
        // and keep captured / brain_state threads that aren't derived.
        const derived = deriveThreads(s.projects, s.clients)
        const derivedIds = new Set(derived.map((t) => t.id))
        const existingById = new Map(s.threads.map((t) => [t.id, t]))
        const merged = [
          ...derived.map((t) => {
            const prev = existingById.get(t.id)
            return prev ? { ...t, status: prev.status } : t
          }),
          ...s.threads.filter((t) => !derivedIds.has(t.id)),
        ]

        // Patterns: keep what Reflect has already written; otherwise seed the
        // live baseline observations so "Patronen" is never empty with data.
        const patterns = s.patterns.length ? s.patterns : baseline

        const correlations = computeCorrelations(dayLogs, s.transactions, s.screenDays, s.meetingDays, deadlines, s.habits)
        const anomalies = computeAnomalies(dayLogs, s.transactions, merged)
        const nudge = buildNudge(merged, s.projects, correlations, anomalies, s.reflectCount)

        set({ essentials, healthDays, dayLogs, threads: merged, patterns, nudge })
      },

      loadLiveData: async () => {
        try {
          const [
            healthDays,
            transactions,
            payments,
            emails,
            meetingDays,
            blocks,
            habits,
            subscriptions,
            goals,
            dogEntries,
            brainState,
            screenDays,
            projects,
            clients,
            checkins,
          ] = await Promise.all([
            fetchHealthDays(),
            fetchTransactions(),
            fetchPayments(),
            fetchEmails(),
            fetchMeetingDays(),
            fetchBlocks(),
            fetchHabits(),
            fetchSubscriptions(),
            fetchGoals(),
            fetchDogEntries(),
            fetchBrainState(),
            fetchScreenDays(),
            fetchProjects(),
            fetchClients(),
            fetchCheckins(),
          ])
          // Load the native CRM slices (project template + messages) separately.
          const [milestones, projectTasks, hours, invoices, projActivity, messages, notificationPrefs, learnedFacts, vendorTags, braindumpEntries, appSettings, inferences, wikiEntries, people, interactions, adminItems, healthConditions, summaries, cleaningLog, businessIdeas, holdings, balanceCheckpoints] = await Promise.all([
            fetchMilestones(),
            fetchProjectTaskRows(),
            fetchHours(),
            fetchInvoices(),
            fetchActivity(),
            fetchClientMessages(),
            fetchNotificationPrefs(),
            fetchLearnedFacts(),
            fetchVendorTags(),
            fetchBraindumpEntries(),
            fetchAppSettings(),
            fetchPendingInferences(),
            fetchWikiEntries(),
            fetchPeople(),
            fetchInteractions(),
            fetchAdminItems(),
            fetchHealthConditions(),
            fetchSummaries(),
            fetchCleaningLog(),
            fetchBusinessIdeas(),
            fetchHoldings(),
            fetchBalanceCheckpoints(),
          ])
          // only overwrite store fields that actually returned data — never replace with empty array
          set({
            ...(healthDays.length > 0 && { healthDays }),
            ...(transactions.length > 0 && { transactions }),
            ...(payments.length > 0 && { payments }),
            ...(emails.length > 0 && { emails }),
            ...(meetingDays.length > 0 && { meetingDays }),
            ...(blocks.length > 0 && { blocks }),
            ...(habits.length > 0 && { habits }),
            ...(subscriptions.length > 0 && { subscriptions }),
            ...(goals.length > 0 && { goals }),
            ...(dogEntries.length > 0 && { dogEntries }),
            ...(brainState.threads.length > 0 && { threads: brainState.threads }),
            ...(brainState.patterns.length > 0 && { patterns: brainState.patterns }),
            ...(screenDays.length > 0 && { screenDays }),
            ...(projects.length > 0 && { projects }),
            ...(clients.length > 0 && { clients }),
            ...(checkins.length > 0 && { checkins }),
            // CRM template slices: these are app-owned (no mock fallback) so set
            // them directly — an empty result genuinely means "none yet".
            projectMilestones: milestones,
            projectTasks,
            projectHours: hours,
            projectInvoices: reconcileInvoices(invoices),
            projectActivity: projActivity,
            ...(messages.length > 0 && { messages }),
            notificationPrefs,
            ...(appSettings && { settings: appSettings }),
            ...(learnedFacts.length > 0 && { learnedFacts }),
            ...(vendorTags.length > 0 && { vendorTags }),
            // Braindump is app-owned (no mock fallback) — set directly so an empty
            // result genuinely means "nothing captured yet".
            braindumpEntries,
            // Inference review queue is app-owned too — set directly.
            inferences,
            // Kennisbank suggest-queue is app-owned too — set directly.
            wikiEntries,
            // Slice 2 domains — app-owned, set directly (empty = none yet).
            people,
            interactions,
            adminItems,
            healthConditions,
            summaries,
            cleaningLog,
            businessIdeas,
            holdings,
            balanceCheckpoints,
            dataSource: 'live',
            isLoading: false,
          })
          // REMEMBER + SURFACE run off live data: rebuild essentials, threads,
          // dayLogs, baseline patterns and today's nudge now that it has loaded.
          get().recomputeBrain()
          // Categorise any transactions still Uncategorized (cache-first, then AI).
          void get().autoTagTransactions()
          // Prices for owned holdings only — never a general market feed.
          void get().refreshStockQuotes()
        } catch (err) {
          console.warn('[OSLIFE] Supabase fetch failed', err)
          set({ isLoading: false })
          // Still rebuild from whatever is loaded so REMEMBER isn't blank.
          get().recomputeBrain()
        }

        // One Realtime channel for all passively-ingested tables. Each entry
        // refetches only its own slice when a row changes; the handler body
        // carries the per-table rules (overwrite-only-if-non-empty, whether to
        // recomputeBrain, whether to re-run the auto-tagger).
        const syncSlices: { table: string; onChange: () => void }[] = [
          { table: 'health_daily_stats', onChange: () => fetchHealthDays().then((d) => { if (d.length > 0) { set({ healthDays: d }); get().recomputeBrain() } }) },
          { table: 'finance_tx', onChange: () => fetchTransactions().then((d) => { if (d.length > 0) { set({ transactions: d }); get().recomputeBrain(); void get().autoTagTransactions() } }) },
          { table: 'vendor_tags', onChange: () => fetchVendorTags().then((d) => { set({ vendorTags: d }); void get().autoTagTransactions() }) },
          { table: 'gmail_messages', onChange: () => fetchEmails().then((d) => d.length > 0 && set({ emails: d })) },
          { table: 'day_blocks', onChange: () => Promise.all([fetchBlocks(), fetchMeetingDays()]).then(([b, m]) => {
            set({ ...(b.length > 0 && { blocks: b }), ...(m.length > 0 && { meetingDays: m }) })
          }) },
          { table: 'projects', onChange: () => fetchProjects().then((d) => { if (d.length > 0) { set({ projects: d }); get().recomputeBrain() } }) },
          { table: 'payments', onChange: () => fetchPayments().then((d) => d.length > 0 && set({ payments: d })) },
          { table: 'investment_holdings', onChange: () => fetchHoldings().then((d) => { set({ holdings: d }); void get().refreshStockQuotes() }) },
          { table: 'balance_checkpoints', onChange: () => fetchBalanceCheckpoints().then((d) => set({ balanceCheckpoints: d })) },
          { table: 'habits', onChange: () => fetchHabits().then((d) => d.length > 0 && set({ habits: d })) },
          { table: 'habit_log', onChange: () => fetchHabits().then((d) => d.length > 0 && set({ habits: d })) },
          { table: 'cleaning_log', onChange: () => fetchCleaningLog().then((d) => set({ cleaningLog: d })) },
          { table: 'goals', onChange: () => fetchGoals().then((d) => d.length > 0 && set({ goals: d })) },
          { table: 'daily_checkin', onChange: () => fetchCheckins().then((d) => { set({ checkins: d }); get().recomputeBrain() }) },
          { table: 'notification_prefs', onChange: () => fetchNotificationPrefs().then((p) => set({ notificationPrefs: p })) },
          { table: 'brain_state', onChange: () => fetchBrainState().then((b) => set({
            ...(b.threads.length > 0 && { threads: b.threads }),
            ...(b.patterns.length > 0 && { patterns: b.patterns }),
          })) },
          { table: 'clients', onChange: () => fetchClients().then((d) => { if (d.length > 0) { set({ clients: d }); get().recomputeBrain() } }) },
          { table: 'project_milestones', onChange: () => fetchMilestones().then((d) => set({ projectMilestones: d })) },
          { table: 'project_tasks', onChange: () => fetchProjectTaskRows().then((d) => set({ projectTasks: d })) },
          { table: 'project_hours', onChange: () => fetchHours().then((d) => set({ projectHours: d })) },
          { table: 'project_invoices', onChange: () => fetchInvoices().then((d) => set({ projectInvoices: reconcileInvoices(d) })) },
          { table: 'project_activity', onChange: () => fetchActivity().then((d) => set({ projectActivity: d })) },
          { table: 'client_messages', onChange: () => fetchClientMessages().then((d) => set({ messages: d })) },
          { table: 'heyra_memory', onChange: () => fetchLearnedFacts().then((d) => set({ learnedFacts: d })) },
          { table: 'braindump_entries', onChange: () => fetchBraindumpEntries().then((d) => set({ braindumpEntries: d })) },
          { table: 'wiki_entries', onChange: () => fetchWikiEntries().then((d) => set({ wikiEntries: d })) },
          { table: 'app_settings', onChange: () => fetchAppSettings().then((p) => { if (p) set({ settings: p }) }) },
          { table: 'person', onChange: () => fetchPeople().then((d) => set({ people: d })) },
          { table: 'interaction', onChange: () => fetchInteractions().then((d) => set({ interactions: d })) },
          { table: 'admin_item', onChange: () => fetchAdminItems().then((d) => set({ adminItems: d })) },
          { table: 'health_condition', onChange: () => fetchHealthConditions().then((d) => set({ healthConditions: d })) },
          { table: 'business_ideas', onChange: () => fetchBusinessIdeas().then((d) => set({ businessIdeas: d })) },
        ]
        // Tear down any channel from a previous loadLiveData() before opening a
        // new one — otherwise each auth event leaks another full subscription.
        if (liveChannel) {
          supabase.removeChannel(liveChannel)
          liveChannel = null
        }
        liveChannel = syncSlices
          .reduce(
            (channel, slice) =>
              channel.on('postgres_changes', { event: '*', schema: 'public', table: slice.table }, slice.onChange),
            supabase.channel('oslife-live'),
          )
          .subscribe()
      },

      loadInferences: async () => {
        const inferences = await fetchPendingInferences()
        set({ inferences })
      },

      resolveInference: async (id, decision) => {
        // Optimistic: drop it from the review queue immediately.
        const prev = get().inferences
        set({ inferences: prev.filter((i) => i.id !== id) })
        const ok = await confirmInference(id, decision)
        if (!ok) {
          // Roll back on failure so the user can retry.
          set({ inferences: prev })
          return
        }
        // A confirmed subscription_candidate created a subscription row — refresh.
        if (decision === 'confirm') {
          const item = prev.find((i) => i.id === id)
          if (item?.type === 'subscription_candidate') {
            void fetchSubscriptions().then((d) => d.length > 0 && set({ subscriptions: d }))
          }
        }
      },

      loadWikiEntries: async () => {
        const wikiEntries = await fetchWikiEntries()
        set({ wikiEntries })
      },

      resolveWikiEntry: async (id, decision) => {
        // Optimistic: drop it from the review queue immediately (rejected ones
        // simply disappear; confirmed ones get refetched below with the real
        // confirmed status/confirmedAt).
        const prev = get().wikiEntries
        const entry = prev.find((w) => w.id === id)
        set({ wikiEntries: prev.filter((w) => w.id !== id) })
        const ok = await confirmWikiEntry(id, decision)
        if (!ok) {
          // Roll back on failure so the user can retry.
          set({ wikiEntries: prev })
          return
        }
        if (decision === 'confirm' && entry) {
          // Only confirmed entries get mirrored into the vault as a real .md
          // file — best-effort, never blocks the UI.
          void materializeWikiEntry({ ...entry, status: 'confirmed' })
          void fetchWikiEntries().then((d) => set({ wikiEntries: d }))
        }
      },

      // ── Slice 2: mensen/relaties ──────────────────────────────────────────
      addPerson: (p) => {
        void createPersonRow(p).then((id) => {
          if (id) fetchPeople().then((d) => set({ people: d }))
        })
      },
      updatePerson: (id, patch) => {
        set((s) => ({ people: s.people.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
        void updatePersonRow(id, patch)
      },
      deletePerson: (id) => {
        set((s) => ({ people: s.people.filter((x) => x.id !== id) }))
        void deletePersonRow(id)
      },
      logInteraction: (i) => {
        void createInteractionRow(i).then((id) => {
          if (id) Promise.all([fetchInteractions(), fetchPeople()]).then(([iv, pe]) => set({ interactions: iv, people: pe }))
        })
      },

      // ── Slice 2: huis & admin ─────────────────────────────────────────────
      addAdminItem: (a) => {
        void createAdminItemRow(a).then((id) => {
          if (id) fetchAdminItems().then((d) => set({ adminItems: d }))
        })
      },
      updateAdminItem: (id, patch) => {
        set((s) => ({ adminItems: s.adminItems.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
        void updateAdminItemRow(id, patch)
      },
      deleteAdminItem: (id) => {
        set((s) => ({ adminItems: s.adminItems.filter((x) => x.id !== id) }))
        void deleteAdminItemRow(id)
      },

      forgetRecord: (table, id) => {
        // Optimistic removal from the matching in-memory slice.
        set((s) => {
          switch (table) {
            case 'health_condition': return { healthConditions: s.healthConditions.filter((x) => x.id !== id) }
            case 'braindump_entries': return { braindumpEntries: s.braindumpEntries.filter((x) => x.id !== id) }
            case 'person': return { people: s.people.filter((x) => x.id !== id) }
            case 'interaction': return { interactions: s.interactions.filter((x) => x.id !== id) }
            case 'admin_item': return { adminItems: s.adminItems.filter((x) => x.id !== id) }
            default: return {}
          }
        })
        void forgetRecordApi(table, id)
      },

      resetDemo: () => {
        set(seed())
      },
    }),
    {
      name: mock.STORAGE_KEY,
      onRehydrateStorage: () => (state) => {
        if (!state) return
        state.isLoading = true
        // Seed empty demo-backed slices, default app-owned slices, normalise scalars.
        applyPersistDefaults(state, seed())
      },
    },
  ),
)
