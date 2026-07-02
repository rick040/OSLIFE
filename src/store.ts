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
  ProjectStatus,
  Task,
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
  DogKind,
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
} from './types'
import { vendorKey, isUntagged } from './finance/categories'
import { categorizeVendor } from './heyra/agents/vendorAgent'
import { analyzeActivity } from './lib/crm/activityAnalyzer'
import type { ActivityAnalysis } from './lib/crm/activityAnalyzer'
import { parseWhatsapp } from './lib/crm/whatsapp'
import { classifyWithBrain, type Classification } from './understand'
import { invokeBraindumpIngest } from './lib/braindump'
import { runReflect, computeCorrelations, computeAnomalies, buildNarrativePrompt, NARRATIVE_SYSTEM_PROMPT } from './reflect'
import { askBrain } from './heyra/brainClient'
import { extractFacts, mergeFacts, type LearnedFact } from './heyra/learning'
import {
  deriveEssentials,
  deriveThreads,
  deriveDayLogs,
  deriveDeadlines,
  deriveBaselinePatterns,
  applyCheckins,
  buildNudge,
} from './derive'
import { TODAY, DOMAIN_META, KIND_LABEL } from './domains'
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
  persistBlockStatus,
  isDbId,
  insertFinanceTx,
  updateFinanceTxRow,
  applyCategoryToTxIds,
  fetchVendorTags,
  upsertVendorTag,
  deleteVendorTag as deleteVendorTagRow,
  fetchBraindumpEntries,
  insertBraindumpEntry,
  deleteBraindumpEntryRow,
  resetBraindumpEntryRow,
  persistEmailRead,
  persistAllEmailsRead,
  persistProjectPatch,
  createHabitRow,
  softDeleteHabitRow,
  persistHabitTick,
  createSubscriptionRow,
  updateSubscriptionRow,
  deleteSubscriptionRow,
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
} from './lib/supabase'

export interface ActivitySignal {
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
  emails: EmailItem[]
  payments: Payment[]
  subscriptions: Subscription[]
  dogProfile: DogProfile
  dogEntries: DogEntry[]
  dogMedical: DogMedical[]
  dogReminders: DogReminder[]
  learnedFacts: LearnedFact[]
  vendorTags: VendorTag[]
  braindumpEntries: BraindumpEntry[]
  dataSource: 'mock' | 'live'
  isLoading: boolean

  // HEYRA learns as we speak — distil durable facts from one exchange, merge
  // them into the persisted set and return only the genuinely NEW facts so the
  // UI can surface "onthouden: …". Best-effort: brain failure ⇒ [] , no throw.
  learnFromExchange: (userText: string, heyraText: string) => Promise<LearnedFact[]>

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
  // Rebuild the REMEMBER layer (essentials/threads/dayLogs/baseline patterns)
  // and today's nudge from whatever live data is currently loaded.
  recomputeBrain: () => void

  // North Star + Inbox
  toggleMilestone: (id: string) => void
  markEmailRead: (id: string) => void
  markAllEmailsRead: () => void

  // CRM — clients
  addClient: (client: Omit<Client, 'id'>) => void
  updateClient: (id: string, patch: Partial<Client>) => void
  deleteClient: (id: string) => void

  // CRM — messages (unified inbox)
  markMessageRead: (id: string) => void
  markConversationRead: (contactKey: string) => void
  addMessage: (msg: Omit<Message, 'id'>) => void
  deleteMessage: (id: string) => void
  importWhatsapp: (
    raw: string,
    meNames: string[],
    opts?: { clientId?: string | null; projectId?: string | null; contact?: string },
  ) => Promise<{ imported: number; total: number }>

  // Projects (native CRUD)
  setProjectStatus: (id: string, status: ProjectStatus) => void
  updateProject: (id: string, patch: Partial<Project>) => void
  addProject: (project: Omit<Project, 'id'>) => void
  deleteProject: (id: string) => void

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
  updateProjectTask: (id: string, patch: Partial<ProjectTask>) => void
  deleteProjectTask: (id: string) => void
  addHours: (projectId: string, h: Omit<HourEntry, 'id' | 'projectId'>) => void
  deleteHours: (id: string) => void
  addInvoice: (projectId: string, inv: Omit<Invoice, 'id' | 'projectId'>) => void
  updateInvoice: (id: string, patch: Partial<Invoice>) => void
  deleteInvoice: (id: string) => void
  logActivity: (projectId: string, body: string) => ActivityAnalysis
  deleteActivity: (id: string) => void

  // Money
  addTransactions: (txns: Transaction[]) => void
  importTransactions: (txns: Transaction[]) => Promise<{ inserted: number; duplicates: number }>
  markPaymentPaid: (id: string) => void
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
  addDogReminder: (r: Omit<DogReminder, 'id' | 'done'>) => void
  toggleDogReminder: (id: string) => void

  // Subscriptions
  addSubscription: (sub: Omit<Subscription, 'id'>) => void
  updateSubscription: (id: string, patch: Partial<Subscription>) => void
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
  emails: mock.emails,
  payments: mock.payments,
  subscriptions: mock.subscriptions,
  dogProfile: mock.dogProfile,
  dogEntries: mock.dogEntries,
  dogMedical: mock.dogMedical,
  dogReminders: mock.dogReminders,
  learnedFacts: [] as LearnedFact[],
  vendorTags: [] as VendorTag[],
  braindumpEntries: [] as BraindumpEntry[],
  dataSource: 'mock' as const,
  isLoading: true,
})

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
        if (c.kind === 'task' && openThread) void persistBrainState(persistableThreads(get().threads), get().patterns)
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
        set((s) => ({ braindumpEntries: s.braindumpEntries.filter((e) => e.id !== id) }))
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
        void persistBrainState(persistableThreads(get().threads), get().patterns)
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
        void persistBrainState(persistableThreads(get().threads), get().patterns)
      },

      reopenThread: (id) => {
        set((s) => ({
          threads: s.threads.map((x) => (x.id === id ? { ...x, status: 'open' } : x)),
        }))
        void persistBrainState(persistableThreads(get().threads), get().patterns)
      },

      updateThread: (id, patch) => {
        set((s) => ({
          threads: s.threads.map((x) => (x.id === id ? { ...x, ...patch } : x)),
        }))
        void persistBrainState(persistableThreads(get().threads), get().patterns)
      },

      deleteThread: (id) => {
        // project/client loops are re-derived from live data on every recompute,
        // so hard-deleting one would just have it reappear — close it instead.
        if (isDerivedThreadId(id)) {
          get().closeThread(id)
          return
        }
        set((s) => ({ threads: s.threads.filter((x) => x.id !== id) }))
        void persistBrainState(persistableThreads(get().threads), get().patterns)
      },

      tickHabit: (id) => {
        const prev = get().habits.find((x) => x.id === id)
        if (!prev) return
        const doneToday = !prev.doneToday
        set((s) => {
          const h = s.habits.find((x) => x.id === id)!
          const hist = new Set(h.history ?? [])
          if (doneToday) hist.add(TODAY)
          else hist.delete(TODAY)
          return {
            habits: s.habits.map((x) =>
              x.id === id
                ? {
                    ...x,
                    doneToday,
                    streak: doneToday ? x.streak + 1 : Math.max(0, x.streak - 1),
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
        void persistHabitTick(id, TODAY, doneToday)
      },

      addHabit: (name, emoji, color) => {
        const tempId = uid('h')
        set((s) => ({
          habits: [
            ...s.habits,
            { id: tempId, name, emoji: emoji || '✅', color, streak: 0, doneToday: false, history: [] },
          ],
        }))
        void createHabitRow(name, emoji || '✅', color).then((realId) => {
          if (realId) set((s) => ({ habits: s.habits.map((x) => (x.id === tempId ? { ...x, id: realId } : x)) }))
        })
      },

      deleteHabit: (id) => {
        set((s) => ({ habits: s.habits.filter((x) => x.id !== id) }))
        void softDeleteHabitRow(id)
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
        set((s) => {
          const others = s.checkins.filter((c) => c.date !== TODAY)
          return {
            checkins: [{ date: TODAY, energy, mood, note: note ?? null }, ...others],
            activity: pushSignal(s.activity, {
              text: `Check-in: energie ${energy}/5 · stemming ${mood}/5`,
              domain: 'personal',
              loop: 'fast',
            }),
          }
        })
        void upsertCheckin({ date: TODAY, energy, mood, note: note ?? null })
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
          // Live baseline observations are the evidence re-checked each pass.
          const evidenced = deriveBaselinePatterns(
            s.healthDays,
            s.screenDays,
            s.transactions,
            s.projects,
            s.clients,
          )
          const { digest, patterns } = runReflect(
            s.dayLogs,
            s.transactions,
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
        void persistBrainState(persistableThreads(get().threads), get().patterns)

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

      markEmailRead: (id) => {
        set((s) => ({
          emails: s.emails.map((x) => (x.id === id ? { ...x, unread: false } : x)),
        }))
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
        void createClientRow(client).then((row) => {
          if (row) set((s) => ({ clients: s.clients.map((c) => (c.id === tempId ? { ...c, id: row.id } : c)) }))
        })
      },

      updateClient: (id, patch) => {
        set((s) => ({ clients: s.clients.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
        void updateClientRow(id, patch)
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
      markMessageRead: (id) => {
        set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, unread: false } : m)) }))
        const m = get().messages.find((x) => x.id === id)
        if (m) void markMessagesReadRow(m.contactKey)
      },

      markConversationRead: (contactKey) => {
        set((s) => ({
          messages: s.messages.map((m) => (m.contactKey === contactKey ? { ...m, unread: false } : m)),
        }))
        void markMessagesReadRow(contactKey)
      },

      addMessage: (msg) => {
        const tempId = uid('msg')
        set((s) => ({ messages: [{ ...msg, id: tempId }, ...s.messages] }))
        void createMessageRow(msg).then((realId) => {
          if (realId) set((s) => ({ messages: s.messages.map((m) => (m.id === tempId ? { ...m, id: realId } : m)) }))
        })
      },

      deleteMessage: (id) => {
        set((s) => ({ messages: s.messages.filter((m) => m.id !== id) }))
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
        return { imported, total: messages.length }
      },

      setProjectStatus: (id, status) => {
        set((s) => {
          const p = s.projects.find((x) => x.id === id)
          if (!p) return {}
          const progress = status === 'done' ? 1 : status === 'review' ? Math.max(p.progress, 0.85) : p.progress
          return {
            projects: s.projects.map((x) => (x.id === id ? { ...x, status, progress } : x)),
            activity: pushSignal(s.activity, {
              text: `Project "${p.name}" → ${status}`,
              domain: p.domain,
              loop: 'fast',
            }),
          }
        })
        const updated = get().projects.find((x) => x.id === id)
        if (updated) void updateProjectRow(id, { status, progress: updated.progress })
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
        if (updated) void updateProjectRow(id, { ...patch, progress: updated.progress })
      },

      addProject: (project) => {
        const tempId = uid('prj')
        set((s) => ({
          projects: [{ ...project, id: tempId }, ...s.projects],
          activity: pushSignal(s.activity, { text: `Project aangemaakt: ${project.name}`, domain: project.domain, loop: 'fast' }),
        }))
        void createProjectRow(project).then((row) => {
          if (row) set((s) => ({ projects: s.projects.map((p) => (p.id === tempId ? { ...p, id: row.id } : p)) }))
        })
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

        return { clientId, projectId }
      },

      // ── Milestones ─────────────────────────────────────────────────────────
      addMilestone: (projectId, m) => {
        const tempId = uid('ms')
        set((s) => ({ projectMilestones: [...s.projectMilestones, { ...m, id: tempId, projectId }] }))
        void createMilestoneRow(projectId, m).then((realId) => {
          if (realId) set((s) => ({ projectMilestones: s.projectMilestones.map((x) => (x.id === tempId ? { ...x, id: realId } : x)) }))
        })
      },

      updateMilestone: (id, patch) => {
        // keep done/progress coherent
        const next = { ...patch }
        if (patch.progress != null) next.done = patch.progress >= 1
        if (patch.done != null) next.progress = patch.done ? 1 : Math.min(0.99, get().projectMilestones.find((m) => m.id === id)?.progress ?? 0)
        set((s) => ({ projectMilestones: s.projectMilestones.map((m) => (m.id === id ? { ...m, ...next } : m)) }))
        void updateMilestoneRow(id, next)
      },

      deleteMilestone: (id) => {
        set((s) => ({ projectMilestones: s.projectMilestones.filter((m) => m.id !== id) }))
        void deleteMilestoneRow(id)
      },

      // ── Project tasks (one-time + recurring) ───────────────────────────────
      addProjectTask: (projectId, task) => {
        const tempId = uid('ptask')
        set((s) => ({ projectTasks: [...s.projectTasks, { ...task, id: tempId, projectId }] }))
        void createProjectTaskRow(projectId, task).then((realId) => {
          if (realId) set((s) => ({ projectTasks: s.projectTasks.map((t) => (t.id === tempId ? { ...t, id: realId } : t)) }))
        })
      },

      toggleProjectTask: (taskId, done) => {
        const t = get().projectTasks.find((x) => x.id === taskId)
        if (!t) return
        // A recurring task isn't "done" — it rolls its due date to the next cycle.
        if (done && t.recurrence) {
          const every = t.recurEvery ?? 1
          const base = t.dueDate ? new Date(t.dueDate) : new Date(TODAY)
          if (t.recurrence === 'daily') base.setDate(base.getDate() + every)
          else if (t.recurrence === 'weekly') base.setDate(base.getDate() + 7 * every)
          else base.setMonth(base.getMonth() + every)
          const nextDue = base.toISOString().slice(0, 10)
          const patch = { done: false, lastDoneOn: TODAY, dueDate: nextDue }
          set((s) => ({ projectTasks: s.projectTasks.map((x) => (x.id === taskId ? { ...x, ...patch } : x)) }))
          void updateProjectTaskRow(taskId, patch)
          return
        }
        set((s) => ({ projectTasks: s.projectTasks.map((x) => (x.id === taskId ? { ...x, done } : x)) }))
        void updateProjectTaskRow(taskId, { done, lastDoneOn: done ? TODAY : null })
      },

      updateProjectTask: (id, patch) => {
        set((s) => ({ projectTasks: s.projectTasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }))
        void updateProjectTaskRow(id, patch)
      },

      deleteProjectTask: (id) => {
        set((s) => ({ projectTasks: s.projectTasks.filter((t) => t.id !== id) }))
        void deleteProjectTaskRow(id)
      },

      // ── Hours (time tracker) ───────────────────────────────────────────────
      addHours: (projectId, h) => {
        const tempId = uid('hr')
        set((s) => ({ projectHours: [{ ...h, id: tempId, projectId }, ...s.projectHours] }))
        void createHourRow(projectId, h).then((realId) => {
          if (realId) set((s) => ({ projectHours: s.projectHours.map((x) => (x.id === tempId ? { ...x, id: realId } : x)) }))
        })
      },

      deleteHours: (id) => {
        set((s) => ({ projectHours: s.projectHours.filter((h) => h.id !== id) }))
        void deleteHourRow(id)
      },

      // ── Invoices ───────────────────────────────────────────────────────────
      addInvoice: (projectId, inv) => {
        const tempId = uid('inv')
        set((s) => ({ projectInvoices: [{ ...inv, id: tempId, projectId }, ...s.projectInvoices] }))
        void createInvoiceRow(projectId, inv).then((realId) => {
          if (realId) set((s) => ({ projectInvoices: s.projectInvoices.map((x) => (x.id === tempId ? { ...x, id: realId } : x)) }))
        })
      },

      updateInvoice: (id, patch) => {
        set((s) => ({ projectInvoices: s.projectInvoices.map((i) => (i.id === id ? { ...i, ...patch } : i)) }))
        void updateInvoiceRow(id, patch)
      },

      deleteInvoice: (id) => {
        set((s) => ({ projectInvoices: s.projectInvoices.filter((i) => i.id !== id) }))
        void deleteInvoiceRow(id)
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
        }).then((realId) => {
          if (realId) set((s) => ({ projectActivity: s.projectActivity.map((a) => (a.id === tempId ? { ...a, id: realId } : a)) }))
        })
        return analysis
      },

      deleteActivity: (id) => {
        set((s) => ({ projectActivity: s.projectActivity.filter((a) => a.id !== id) }))
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
        set((s) => ({ transactions: s.transactions.map((t) => (t.id === id ? { ...t, ...patch } : t)) }))
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
        }).then((realId) => {
          if (realId) set((s) => ({ dogEntries: s.dogEntries.map((x) => (x.id === tempId ? { ...x, id: realId } : x)) }))
        })
      },

      deleteDogEntry: (id) => {
        set((s) => ({ dogEntries: s.dogEntries.filter((x) => x.id !== id) }))
        void deleteDogEntryRow(id)
      },

      updateDogEntry: (id, patch) => {
        set((s) => ({ dogEntries: s.dogEntries.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
        void updateDogEntryRow(id, patch)
      },

      addDogMedical: (m) =>
        set((s) => ({ dogMedical: [{ ...m, id: uid('dmed') }, ...s.dogMedical] })),

      deleteDogMedical: (id) => set((s) => ({ dogMedical: s.dogMedical.filter((x) => x.id !== id) })),

      addDogReminder: (r) =>
        set((s) => ({ dogReminders: [...s.dogReminders, { ...r, id: uid('drem'), done: false }] })),

      toggleDogReminder: (id) =>
        set((s) => ({ dogReminders: s.dogReminders.map((x) => (x.id === id ? { ...x, done: !x.done } : x)) })),

      addSubscription: (sub) => {
        const tempId = uid('sub')
        set((s) => ({ subscriptions: [{ ...sub, id: tempId }, ...s.subscriptions] }))
        void createSubscriptionRow(sub).then((realId) => {
          if (realId) set((s) => ({ subscriptions: s.subscriptions.map((x) => (x.id === tempId ? { ...x, id: realId } : x)) }))
        })
      },

      updateSubscription: (id, patch) => {
        set((s) => ({ subscriptions: s.subscriptions.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
        void updateSubscriptionRow(id, patch)
      },

      toggleSubscription: (id) => {
        set((s) => ({ subscriptions: s.subscriptions.map((x) => (x.id === id ? { ...x, active: !x.active } : x)) }))
        const updated = get().subscriptions.find((x) => x.id === id)
        if (updated) void updateSubscriptionRow(id, { active: updated.active })
      },

      deleteSubscription: (id) => {
        set((s) => ({ subscriptions: s.subscriptions.filter((x) => x.id !== id) }))
        void deleteSubscriptionRow(id)
      },

      recomputeBrain: () => {
        const s = get()
        const essentials = deriveEssentials(s.clients, s.projects, s.goals, s.dogEntries)
        // Fold the felt signal (energy/mood) onto health days + day logs.
        const healthDays = applyCheckins(s.healthDays, s.checkins)
        const dayLogs = deriveDayLogs(healthDays, s.checkins)
        const deadlines = deriveDeadlines(s.projects)
        const baseline = deriveBaselinePatterns(
          s.healthDays,
          s.screenDays,
          s.transactions,
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
          const [milestones, projectTasks, hours, invoices, projActivity, messages, notificationPrefs, learnedFacts, vendorTags, braindumpEntries] = await Promise.all([
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
            projectInvoices: invoices,
            projectActivity: projActivity,
            ...(messages.length > 0 && { messages }),
            notificationPrefs,
            ...(learnedFacts.length > 0 && { learnedFacts }),
            ...(vendorTags.length > 0 && { vendorTags }),
            // Braindump is app-owned (no mock fallback) — set directly so an empty
            // result genuinely means "nothing captured yet".
            braindumpEntries,
            dataSource: 'live',
            isLoading: false,
          })
          // REMEMBER + SURFACE run off live data: rebuild essentials, threads,
          // dayLogs, baseline patterns and today's nudge now that it has loaded.
          get().recomputeBrain()
          // Categorise any transactions still Uncategorized (cache-first, then AI).
          void get().autoTagTransactions()
        } catch (err) {
          console.warn('[OSLIFE] Supabase fetch failed', err)
          set({ isLoading: false })
          // Still rebuild from whatever is loaded so REMEMBER isn't blank.
          get().recomputeBrain()
        }

        // One Realtime channel for all passively-ingested tables.
        // The UI refetches only the affected slice when a row changes.
        supabase
          .channel('oslife-live')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'health_daily_stats' },
            () => fetchHealthDays().then((d) => { if (d.length > 0) { set({ healthDays: d }); get().recomputeBrain() } }))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_tx' },
            () => fetchTransactions().then((d) => { if (d.length > 0) { set({ transactions: d }); get().recomputeBrain(); void get().autoTagTransactions() } }))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'vendor_tags' },
            () => fetchVendorTags().then((d) => { set({ vendorTags: d }); void get().autoTagTransactions() }))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'gmail_messages' },
            () => fetchEmails().then((d) => d.length > 0 && set({ emails: d })))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'day_blocks' },
            () => Promise.all([fetchBlocks(), fetchMeetingDays()]).then(([b, m]) => {
              set({ ...(b.length > 0 && { blocks: b }), ...(m.length > 0 && { meetingDays: m }) })
            }))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' },
            () => fetchProjects().then((d) => { if (d.length > 0) { set({ projects: d }); get().recomputeBrain() } }))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' },
            () => fetchPayments().then((d) => d.length > 0 && set({ payments: d })))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'habits' },
            () => fetchHabits().then((d) => d.length > 0 && set({ habits: d })))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'habit_log' },
            () => fetchHabits().then((d) => d.length > 0 && set({ habits: d })))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'goals' },
            () => fetchGoals().then((d) => d.length > 0 && set({ goals: d })))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_checkin' },
            () => fetchCheckins().then((d) => { set({ checkins: d }); get().recomputeBrain() }))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_prefs' },
            () => fetchNotificationPrefs().then((p) => set({ notificationPrefs: p })))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'brain_state' },
            () => fetchBrainState().then((b) => set({
              ...(b.threads.length > 0 && { threads: b.threads }),
              ...(b.patterns.length > 0 && { patterns: b.patterns }),
            })))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' },
            () => fetchClients().then((d) => { if (d.length > 0) { set({ clients: d }); get().recomputeBrain() } }))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'project_milestones' },
            () => fetchMilestones().then((d) => set({ projectMilestones: d })))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'project_tasks' },
            () => fetchProjectTaskRows().then((d) => set({ projectTasks: d })))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'project_hours' },
            () => fetchHours().then((d) => set({ projectHours: d })))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'project_invoices' },
            () => fetchInvoices().then((d) => set({ projectInvoices: d })))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'project_activity' },
            () => fetchActivity().then((d) => set({ projectActivity: d })))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'client_messages' },
            () => fetchClientMessages().then((d) => set({ messages: d })))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'heyra_memory' },
            () => fetchLearnedFacts().then((d) => set({ learnedFacts: d })))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'braindump_entries' },
            () => fetchBraindumpEntries().then((d) => set({ braindumpEntries: d })))
          .subscribe()
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
        const s = seed()
        // Guard every array/required field — prevents blank page from stale persisted state
        if (!state.healthDays?.length) state.healthDays = s.healthDays
        if (!state.emails?.length) state.emails = s.emails
        if (!state.transactions?.length) state.transactions = s.transactions
        if (!state.meetingDays?.length) state.meetingDays = s.meetingDays
        if (!state.projects?.length) state.projects = s.projects
        if (!state.clients?.length) state.clients = s.clients
        if (!state.messages?.length) state.messages = s.messages
        if (!state.projectMilestones) state.projectMilestones = []
        if (!state.projectTasks) state.projectTasks = []
        if (!state.projectHours) state.projectHours = []
        if (!state.projectInvoices) state.projectInvoices = []
        if (!state.projectActivity) state.projectActivity = []
        if (!state.goals?.length) state.goals = s.goals
        if (!state.milestones?.length) state.milestones = s.milestones
        if (!state.payments?.length) state.payments = s.payments
        if (!state.subscriptions?.length) state.subscriptions = s.subscriptions
        if (!state.dogProfile) state.dogProfile = s.dogProfile
        if (!state.dogEntries?.length) state.dogEntries = s.dogEntries
        if (!state.dogMedical?.length) state.dogMedical = s.dogMedical
        if (!state.dogReminders?.length) state.dogReminders = s.dogReminders
        if (!state.blocks?.length) state.blocks = s.blocks
        if (!state.threads) state.threads = s.threads
        if (!state.habits?.length) state.habits = s.habits
        if (!state.nudge) state.nudge = s.nudge
        if (!state.essentials?.length) state.essentials = s.essentials
        if (!state.patterns?.length) state.patterns = s.patterns
        if (!state.screenDays?.length) state.screenDays = s.screenDays
        if (!state.checkins) state.checkins = []
        if (!state.learnedFacts) state.learnedFacts = []
        if (!state.vendorTags) state.vendorTags = []
        if (!state.braindumpEntries) state.braindumpEntries = []
        if (state.notificationPrefs === undefined) state.notificationPrefs = null
        if (!state.dataSource) state.dataSource = 'mock'
      },
    },
  ),
)

export { TODAY }
