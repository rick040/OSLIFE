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
  HealthDay,
  Project,
  Goal,
  Milestone,
  EmailItem,
  Payment,
  ScreenDay,
  MeetingDay,
  Client,
  Message,
  Subscription,
  DogEntry,
  DogMedical,
  DogReminder,
  DogProfile,
  Holding,
  BalanceCheckpoint,
} from './types'

export const STORAGE_KEY = 'oslife-state-v1'
export const OPENING_BALANCE = 0

export const essentials: Essential[] = []
export const threads: Thread[] = []
export const patterns: Pattern[] = []
export const dayLogs: DayLog[] = []
export const transactions: Transaction[] = []
export const habits: Habit[] = []
export const blocks: Block[] = []
export const initialNudge: Nudge = { id: 'nudge-default', domain: 'personal', text: '', reason: '' }
export const seedItems: StructuredItem[] = []
export const healthDays: HealthDay[] = []
export const screenDays: ScreenDay[] = []
export const meetingDays: MeetingDay[] = []
export const projects: Project[] = []
export const clients: Client[] = []
export const messages: Message[] = []
export const goals: Goal[] = []
export const milestones: Milestone[] = []
export const emails: EmailItem[] = []
export const payments: Payment[] = []
export const subscriptions: Subscription[] = []
export const holdings: Holding[] = []
export const balanceCheckpoints: BalanceCheckpoint[] = []
export const dogProfile: DogProfile = { name: '', breed: '', birthdate: '', weightKg: 0, vet: '' }
export const dogEntries: DogEntry[] = []
export const dogMedical: DogMedical[] = []
export const dogReminders: DogReminder[] = []
