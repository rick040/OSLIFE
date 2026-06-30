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
  LocationDay,
  MeetingDay,
  MusicDay,
  Client,
  Message,
  Subscription,
  DogEntry,
  DogKind,
  DogMedical,
  DogReminder,
  DogProfile,
} from './types'
import { classify } from './understand'
import { runReflect } from './reflect'
import { TODAY } from './domains'
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
  fetchScreenDays,
  fetchLocationDays,
  fetchMusicDays,
  fetchProjects,
  fetchClients,
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
  screenDays: ScreenDay[]
  locationDays: LocationDay[]
  meetingDays: MeetingDay[]
  musicDays: MusicDay[]
  projects: Project[]
  clients: Client[]
  messages: Message[]
  goals: Goal[]
  milestones: Milestone[]
  emails: EmailItem[]
  payments: Payment[]
  subscriptions: Subscription[]
  dogProfile: DogProfile
  dogEntries: DogEntry[]
  dogMedical: DogMedical[]
  dogReminders: DogReminder[]
  dataSource: 'mock' | 'live'
  isLoading: boolean

  // INTAKE → UNDERSTAND → REMEMBER
  capture: (text: string, source: CaptureSource) => StructuredItem

  // ACT (fast loop, writes outcomes back as signals)
  closeThread: (id: string) => void
  reopenThread: (id: string) => void
  tickHabit: (id: string) => void
  addHabit: (name: string, emoji: string, color?: string) => void
  deleteHabit: (id: string) => void
  completeBlock: (id: string) => void
  skipBlock: (id: string) => void
  resetBlock: (id: string) => void
  moveBlock: (id: string, dir: -1 | 1) => void
  acceptPlan: () => void

  // REFLECT (slow loop)
  runNightlyReflect: () => void

  // LIVE DATA
  loadLiveData: () => Promise<void>

  // North Star + Inbox
  toggleMilestone: (id: string) => void
  markEmailRead: (id: string) => void
  markAllEmailsRead: () => void

  // CRM
  markMessageRead: (id: string) => void
  markConversationRead: (contactKey: string) => void

  // Projects + Money
  setProjectStatus: (id: string, status: ProjectStatus) => void
  updateProject: (id: string, patch: Partial<Pick<Project, 'status' | 'priority' | 'deadline' | 'value'>>) => void
  addProjectTask: (projectId: string, task: Omit<Task, 'id'>) => void
  toggleProjectTask: (projectId: string, taskId: string, done: boolean) => void
  deleteProjectTask: (projectId: string, taskId: string) => void
  addTransactions: (txns: Transaction[]) => void
  markPaymentPaid: (id: string) => void

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
  screenDays: mock.screenDays,
  locationDays: mock.locationDays,
  meetingDays: mock.meetingDays,
  musicDays: mock.musicDays,
  projects: mock.projects,
  clients: mock.clients,
  messages: mock.messages,
  goals: mock.goals,
  milestones: mock.milestones,
  emails: mock.emails,
  payments: mock.payments,
  subscriptions: mock.subscriptions,
  dogProfile: mock.dogProfile,
  dogEntries: mock.dogEntries,
  dogMedical: mock.dogMedical,
  dogReminders: mock.dogReminders,
  dataSource: 'mock' as const,
  isLoading: true,
})

const uid = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1000)}`

function pushSignal(activity: ActivitySignal[], s: Omit<ActivitySignal, 'id' | 'ts'>): ActivitySignal[] {
  return [{ id: uid('sig'), ts: new Date().toISOString(), ...s }, ...activity].slice(0, 30)
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...seed(),

      capture: (text, source) => {
        const c = classify(text, source)
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
          if (c.kind === 'task') {
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
              text: `Captured & classified → ${c.domain} · ${c.kind}`,
              domain: c.domain,
              loop: 'fast',
            }),
          }
        })
        return item
      },

      closeThread: (id) =>
        set((s) => {
          const t = s.threads.find((x) => x.id === id)
          return {
            threads: s.threads.map((x) => (x.id === id ? { ...x, status: 'closed' } : x)),
            activity: t
              ? pushSignal(s.activity, { text: `Closed loop: ${t.title}`, domain: t.domain, loop: 'fast' })
              : s.activity,
          }
        }),

      reopenThread: (id) =>
        set((s) => ({
          threads: s.threads.map((x) => (x.id === id ? { ...x, status: 'open' } : x)),
        })),

      tickHabit: (id) =>
        set((s) => {
          const h = s.habits.find((x) => x.id === id)
          if (!h) return {}
          const doneToday = !h.doneToday
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
        }),

      addHabit: (name, emoji, color) =>
        set((s) => ({
          habits: [
            ...s.habits,
            { id: uid('h'), name, emoji: emoji || '✅', color, streak: 0, doneToday: false, history: [] },
          ],
        })),

      deleteHabit: (id) => set((s) => ({ habits: s.habits.filter((x) => x.id !== id) })),

      completeBlock: (id) =>
        set((s) => {
          const b = s.blocks.find((x) => x.id === id)
          return {
            blocks: s.blocks.map((x) => (x.id === id ? { ...x, status: 'done' } : x)),
            activity: b
              ? pushSignal(s.activity, { text: `Completed block: ${b.title}`, domain: b.domain, loop: 'fast' })
              : s.activity,
          }
        }),

      skipBlock: (id) =>
        set((s) => {
          const b = s.blocks.find((x) => x.id === id)
          return {
            blocks: s.blocks.map((x) => (x.id === id ? { ...x, status: 'skipped' } : x)),
            activity: b
              ? pushSignal(s.activity, {
                  text: `Skipped block: ${b.title} (training signal)`,
                  domain: b.domain,
                  loop: 'fast',
                })
              : s.activity,
          }
        }),

      resetBlock: (id) =>
        set((s) => ({ blocks: s.blocks.map((x) => (x.id === id ? { ...x, status: 'planned' } : x)) })),

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
            text: 'Accepted today’s Day Builder plan',
            domain: 'personal',
            loop: 'fast',
          }),
        })),

      runNightlyReflect: () =>
        set((s) => {
          const { digest, patterns } = runReflect(
            s.dayLogs,
            s.transactions,
            s.threads,
            s.patterns,
            s.screenDays,
            s.meetingDays,
            s.locationDays,
            s.musicDays,
          )

          // SLOW LOOP made visible: reflection reshapes what Surface shows tomorrow.
          let blocks = s.blocks
          let planAdapted = s.planAdapted
          if (!s.planAdapted) {
            planAdapted = true
            // reinforced sleep↔energy + deep-work-peak patterns → insert an evening
            // wind-down block and re-assert the protected morning focus window.
            const windDown: Block = {
              id: uid('blk'),
              title: 'Wind-down, no screens (protect tomorrow’s sleep)',
              domain: 'personal',
              start: '22:30',
              end: '23:00',
              status: 'planned',
              rationale: 'Added by Reflect: sleep↔energy pattern reinforced (p1)',
            }
            blocks = [...s.blocks, windDown]
          }

          const newNudge: Nudge = {
            id: uid('nud'),
            domain: 'cross',
            text: `Reflect pass #${s.reflectCount + 1}: short nights are stacking, en op die dagen lopen schermtijd, pickups en meeting-druk op terwijl je focus zakt. Tomorrow’s plan protects sleep, schermt je 09:30 deep-work blok af en houdt meetings uit de ochtend. Watch convenience spend on low-energy days.`,
            reason: 'cross-domain digest (sleep↔energy, schermtijd↔focus, meetings↔output)',
          }

          return {
            patterns,
            lastDigest: digest,
            reflectCount: s.reflectCount + 1,
            blocks,
            planAdapted,
            nudge: newNudge,
            activity: pushSignal(s.activity, {
              text: `Ran nightly Reflect → ${digest.correlations.length} correlations, ${digest.reinforced.length} patterns reinforced`,
              domain: 'cross',
              loop: 'slow',
            }),
          }
        }),

      toggleMilestone: (id) =>
        set((s) => {
          const m = s.milestones.find((x) => x.id === id)
          if (!m) return {}
          return {
            milestones: s.milestones.map((x) => (x.id === id ? { ...x, done: !x.done } : x)),
            activity: pushSignal(s.activity, {
              text: `${m.done ? 'Re-opened' : 'Hit'} milestone: ${m.title}`,
              domain: 'cross',
              loop: 'fast',
            }),
          }
        }),

      markEmailRead: (id) =>
        set((s) => ({
          emails: s.emails.map((x) => (x.id === id ? { ...x, unread: false } : x)),
        })),

      markPaymentPaid: (id) =>
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
        }),

      markAllEmailsRead: () =>
        set((s) => ({ emails: s.emails.map((x) => ({ ...x, unread: false })) })),

      markMessageRead: (id) =>
        set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, unread: false } : m)) })),

      markConversationRead: (contactKey) =>
        set((s) => ({
          messages: s.messages.map((m) => (m.contactKey === contactKey ? { ...m, unread: false } : m)),
        })),

      setProjectStatus: (id, status) =>
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
        }),

      updateProject: (id, patch) =>
        set((s) => {
          const p = s.projects.find((x) => x.id === id)
          if (!p) return {}
          const progress =
            patch.status === 'done' ? 1
            : patch.status === 'review' ? Math.max(p.progress, 0.85)
            : p.progress
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
        }),

      addProjectTask: (projectId, task) =>
        set((s) => {
          const t: Task = { id: uid('task'), ...task }
          return {
            projects: s.projects.map((p) =>
              p.id === projectId ? { ...p, tasks: [...(p.tasks ?? []), t] } : p
            ),
          }
        }),

      toggleProjectTask: (projectId, taskId, done) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId
              ? { ...p, tasks: (p.tasks ?? []).map((t) => (t.id === taskId ? { ...t, done } : t)) }
              : p
          ),
        })),

      deleteProjectTask: (projectId, taskId) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId
              ? { ...p, tasks: (p.tasks ?? []).filter((t) => t.id !== taskId) }
              : p
          ),
        })),

      addTransactions: (txns) =>
        set((s) => {
          if (!txns.length) return {}
          const merged = [...txns, ...s.transactions].sort((a, b) => (a.date < b.date ? 1 : -1))
          return {
            transactions: merged,
            activity: pushSignal(s.activity, {
              text: `Imported ${txns.length} bank transaction(s)`,
              domain: 'personal',
              loop: 'fast',
            }),
          }
        }),

      logDog: (entry) =>
        set((s) => {
          const e: DogEntry = { id: uid('dog'), at: entry.at ?? new Date().toISOString(), ...entry }
          return {
            dogEntries: [e, ...s.dogEntries],
            activity: pushSignal(s.activity, { text: `Kyra: ${entry.kind} gelogd`, domain: 'personal', loop: 'fast' }),
          }
        }),

      deleteDogEntry: (id) => set((s) => ({ dogEntries: s.dogEntries.filter((x) => x.id !== id) })),

      updateDogEntry: (id, patch) =>
        set((s) => ({ dogEntries: s.dogEntries.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),

      addDogMedical: (m) =>
        set((s) => ({ dogMedical: [{ ...m, id: uid('dmed') }, ...s.dogMedical] })),

      deleteDogMedical: (id) => set((s) => ({ dogMedical: s.dogMedical.filter((x) => x.id !== id) })),

      addDogReminder: (r) =>
        set((s) => ({ dogReminders: [...s.dogReminders, { ...r, id: uid('drem'), done: false }] })),

      toggleDogReminder: (id) =>
        set((s) => ({ dogReminders: s.dogReminders.map((x) => (x.id === id ? { ...x, done: !x.done } : x)) })),

      addSubscription: (sub) =>
        set((s) => ({ subscriptions: [{ ...sub, id: uid('sub') }, ...s.subscriptions] })),

      updateSubscription: (id, patch) =>
        set((s) => ({ subscriptions: s.subscriptions.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),

      toggleSubscription: (id) =>
        set((s) => ({ subscriptions: s.subscriptions.map((x) => (x.id === id ? { ...x, active: !x.active } : x)) })),

      deleteSubscription: (id) =>
        set((s) => ({ subscriptions: s.subscriptions.filter((x) => x.id !== id) })),

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
            locationDays,
            musicDays,
            projects,
            clients,
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
            fetchLocationDays(),
            fetchMusicDays(),
            fetchProjects(),
            fetchClients(),
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
            ...(locationDays.length > 0 && { locationDays }),
            ...(musicDays.length > 0 && { musicDays }),
            ...(projects.length > 0 && { projects }),
            ...(clients.length > 0 && { clients }),
            dataSource: 'live',
            isLoading: false,
          })
        } catch (err) {
          console.warn('[RICK-OS] Supabase fetch failed', err)
          set({ isLoading: false })
        }

        // One Realtime channel for all passively-ingested tables.
        // The UI refetches only the affected slice when a row changes.
        supabase
          .channel('oslife-live')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'health_daily_stats' },
            () => fetchHealthDays().then((d) => d.length > 0 && set({ healthDays: d })))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_tx' },
            () => fetchTransactions().then((d) => d.length > 0 && set({ transactions: d })))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'gmail_messages' },
            () => fetchEmails().then((d) => d.length > 0 && set({ emails: d })))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'day_blocks' },
            () => Promise.all([fetchBlocks(), fetchMeetingDays()]).then(([b, m]) => {
              set({ ...(b.length > 0 && { blocks: b }), ...(m.length > 0 && { meetingDays: m }) })
            }))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' },
            () => fetchProjects().then((d) => d.length > 0 && set({ projects: d })))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'spotify_history' },
            () => fetchMusicDays().then((d) => d.length > 0 && set({ musicDays: d })))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' },
            () => fetchPayments().then((d) => d.length > 0 && set({ payments: d })))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'habits' },
            () => fetchHabits().then((d) => d.length > 0 && set({ habits: d })))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'habit_log' },
            () => fetchHabits().then((d) => d.length > 0 && set({ habits: d })))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'goals' },
            () => fetchGoals().then((d) => d.length > 0 && set({ goals: d })))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'brain_state' },
            () => fetchBrainState().then((b) => set({
              ...(b.threads.length > 0 && { threads: b.threads }),
              ...(b.patterns.length > 0 && { patterns: b.patterns }),
            })))
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
        if (!state.locationDays?.length) state.locationDays = s.locationDays
        if (!state.musicDays?.length) state.musicDays = s.musicDays
        if (!state.dataSource) state.dataSource = 'mock'
      },
    },
  ),
)

export { TODAY }
