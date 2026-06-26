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
  LocationDay,
  MeetingDay,
  MusicDay,
  Client,
  Message,
  Subscription,
} from './types'
import { TODAY } from './domains'

// ── ESSENTIALS (permanent facts) ─────────────────────────────────────────────
export const essentials: Essential[] = [
  { id: 'e1', domain: 'personal', label: 'Timezone', value: 'Europe/Amsterdam (CEST)' },
  { id: 'e2', domain: 'personal', label: 'Base', value: 'Geldrop / Eindhoven region' },
  { id: 'e3', domain: 'personal', label: 'Dog', value: 'Nox, walk 07:30 & 18:00, vet: Dierenkliniek Geldrop' },
  { id: 'e4', domain: 'parkingyou', label: 'Role', value: 'Operations, signage, host onboarding, campaigns' },
  { id: 'e5', domain: 'prjct', label: 'Role', value: 'Solo design studio, web, branding, content' },
  { id: 'e6', domain: 'prjct', label: 'Payment terms', value: '50% vooraf / 50% bij oplevering, 14d geldig' },
  { id: 'e7', domain: 'buurtkaart', label: 'Role', value: 'Geldrop Buurtkaart, local discount map project' },
  { id: 'e8', domain: 'personal', label: 'High-energy window', value: 'Learned: 09:30–12:30 (peak focus)' },
  { id: 'e9', domain: 'prjct', label: 'Key person', value: 'Lana de Vries, artist, mural deliverable' },
  { id: 'e10', domain: 'parkingyou', label: 'Key person', value: 'Marco Theunissen, new host, Strijp-S lot' },
]

// ── THREADS (open loops / promises owed) ─────────────────────────────────────
export const threads: Thread[] = [
  {
    id: 't1',
    domain: 'parkingyou',
    title: 'Quarterly signage inspection, Strijp-S & Geldrop lots',
    owedTo: 'ParkingYou ops / safety',
    due: '2026-06-24',
    status: 'open',
    createdAt: '2026-06-08',
  },
  {
    id: 't2',
    domain: 'parkingyou',
    title: 'Onboard Marco (new host), contract + access codes',
    owedTo: 'Marco Theunissen',
    due: '2026-06-26',
    status: 'open',
    createdAt: '2026-06-12',
  },
  {
    id: 't3',
    domain: 'parkingyou',
    title: 'Summer campaign assets to channel partner',
    owedTo: 'Marketing partner',
    due: '2026-06-30',
    status: 'open',
    createdAt: '2026-06-15',
  },
  {
    id: 't4',
    domain: 'prjct',
    title: 'Deliver mural concept boards to Lana',
    owedTo: 'Lana de Vries',
    due: '2026-06-23',
    status: 'open',
    createdAt: '2026-06-10',
  },
  {
    id: 't5',
    domain: 'prjct',
    title: 'Invoice #2026-031 unpaid, Bakkerij van Dijk',
    owedTo: 'owed TO Rick (€880)',
    due: '2026-06-20',
    status: 'open',
    createdAt: '2026-06-06',
  },
  {
    id: 't6',
    domain: 'buurtkaart',
    title: 'Follow up flyer distribution, wijk Braakhuizen',
    owedTo: 'Print/distro vendor',
    due: '2026-06-25',
    status: 'open',
    createdAt: '2026-06-14',
  },
  {
    id: 't7',
    domain: 'buurtkaart',
    title: 'Answer: how is QR scan-tracking wired per merchant?',
    owedTo: 'Merchant: Café De Kroon',
    due: null,
    status: 'open',
    createdAt: '2026-06-18',
  },
  {
    id: 't8',
    domain: 'personal',
    title: 'Book Nox annual vet check-up',
    owedTo: 'Nox 🐕',
    due: '2026-06-28',
    status: 'open',
    createdAt: '2026-06-16',
  },
]

// ── PATTERNS (recurring observations, confidence-weighted) ────────────────────
export const patterns: Pattern[] = [
  {
    id: 'p1',
    domain: 'personal',
    text: 'Nights under 6h sleep → noticeably lower next-day energy',
    confidence: 0.62,
    lastReinforced: '2026-06-15',
    trend: 'up',
  },
  {
    id: 'p2',
    domain: 'cross',
    text: 'Spending spikes cluster around PRJCT deadlines (finance ↔ stress)',
    confidence: 0.41,
    lastReinforced: '2026-06-12',
    trend: 'up',
  },
  {
    id: 'p3',
    domain: 'personal',
    text: 'Deep-work output peaks late morning (09:30–12:30)',
    confidence: 0.78,
    lastReinforced: '2026-06-19',
    trend: 'flat',
  },
  {
    id: 'p4',
    domain: 'prjct',
    text: 'Invoices to F&B clients tend to run 7–10 days late',
    confidence: 0.55,
    lastReinforced: '2026-06-09',
    trend: 'flat',
  },
  {
    id: 'p5',
    domain: 'personal',
    text: 'Skips morning dog walk → mood dips by evening',
    confidence: 0.34,
    lastReinforced: '2026-05-30',
    trend: 'down',
  },
  {
    id: 'p6',
    domain: 'parkingyou',
    text: 'Host onboarding stalls when access codes are the last step',
    confidence: 0.48,
    lastReinforced: '2026-06-11',
    trend: 'flat',
  },
  {
    id: 'p7',
    domain: 'personal',
    text: 'Schermtijd & pickups lopen op zodra je energie zakt (afleiding ipv herstel)',
    confidence: 0.39,
    lastReinforced: '2026-06-18',
    trend: 'up',
  },
  {
    id: 'p8',
    domain: 'cross',
    text: 'Meeting-zware dagen (3+) drukken je deep-work output en focus-tijd',
    confidence: 0.44,
    lastReinforced: '2026-06-17',
    trend: 'up',
  },
  {
    id: 'p9',
    domain: 'parkingyou',
    text: 'Tijd op de lots (Strijp-S / Geldrop) piekt rond campagne-deadlines',
    confidence: 0.5,
    lastReinforced: '2026-06-18',
    trend: 'flat',
  },
  {
    id: 'p10',
    domain: 'personal',
    text: 'Lage muziek-valence loopt mee met je lage-mood dagen',
    confidence: 0.36,
    lastReinforced: '2026-06-17',
    trend: 'up',
  },
]

// ── PASSIVE SENSE: 14 days of sleep / energy / mood ───────────────────────────
// energy & mood on a 1–5 scale; sleepHours = hours slept the preceding night.
export const dayLogs: DayLog[] = [
  { date: '2026-06-09', sleepHours: 7.4, energy: 4, mood: 4 },
  { date: '2026-06-10', sleepHours: 5.2, energy: 2, mood: 3, note: 'PRJCT crunch, up late' },
  { date: '2026-06-11', sleepHours: 5.8, energy: 2, mood: 2 },
  { date: '2026-06-12', sleepHours: 6.9, energy: 3, mood: 3, note: 'mural concepts due' },
  { date: '2026-06-13', sleepHours: 7.6, energy: 4, mood: 4 },
  { date: '2026-06-14', sleepHours: 8.1, energy: 5, mood: 4, note: 'weekend reset' },
  { date: '2026-06-15', sleepHours: 7.2, energy: 4, mood: 4 },
  { date: '2026-06-16', sleepHours: 6.1, energy: 3, mood: 3 },
  { date: '2026-06-17', sleepHours: 5.5, energy: 2, mood: 2, note: 'campaign deadline push' },
  { date: '2026-06-18', sleepHours: 5.1, energy: 2, mood: 2 },
  { date: '2026-06-19', sleepHours: 6.4, energy: 3, mood: 3 },
  { date: '2026-06-20', sleepHours: 7.8, energy: 4, mood: 4 },
  { date: '2026-06-21', sleepHours: 7.1, energy: 4, mood: 4 },
  { date: '2026-06-22', sleepHours: 5.7, energy: 2, mood: 3, note: 'today, short night' },
]

// ── PASSIVE SENSE: bank transactions ──────────────────────────────────────────
export const transactions: Transaction[] = [
  { id: 'x1', date: '2026-06-09', amount: -42.5, merchant: 'Albert Heijn', category: 'Groceries', domain: 'personal' },
  { id: 'x2', date: '2026-06-10', amount: -38.0, merchant: 'Thuisbezorgd', category: 'Takeout', domain: 'personal' },
  { id: 'x3', date: '2026-06-10', amount: -59.0, merchant: 'Adobe', category: 'Software', domain: 'prjct' },
  { id: 'x4', date: '2026-06-11', amount: -27.4, merchant: 'Coolblue (USB-C hub)', category: 'Gear', domain: 'prjct' },
  { id: 'x5', date: '2026-06-11', amount: -14.2, merchant: 'Esso (energy drinks/snacks)', category: 'Convenience', domain: 'personal' },
  { id: 'x6', date: '2026-06-13', amount: -22.0, merchant: 'Dierenwinkel (Nox food)', category: 'Dog', domain: 'personal' },
  { id: 'x7', date: '2026-06-14', amount: -61.3, merchant: 'Albert Heijn', category: 'Groceries', domain: 'personal' },
  { id: 'x8', date: '2026-06-16', amount: -9.5, merchant: 'Spotify', category: 'Subscriptions', domain: 'personal' },
  { id: 'x9', date: '2026-06-17', amount: -44.0, merchant: 'Thuisbezorgd', category: 'Takeout', domain: 'personal' },
  { id: 'x10', date: '2026-06-17', amount: -120.0, merchant: 'iStock (campaign assets)', category: 'Stock media', domain: 'parkingyou' },
  { id: 'x11', date: '2026-06-18', amount: -36.5, merchant: 'Thuisbezorgd', category: 'Takeout', domain: 'personal' },
  { id: 'x12', date: '2026-06-18', amount: -18.9, merchant: 'Esso (fuel/snacks)', category: 'Convenience', domain: 'personal' },
  { id: 'x13', date: '2026-06-18', amount: -89.0, merchant: 'Canva Pro (annual)', category: 'Software', domain: 'prjct' },
  { id: 'x14', date: '2026-06-20', amount: 650.0, merchant: 'Deposit, De Groot website', category: 'Client income', domain: 'prjct' },
  { id: 'x15', date: '2026-06-21', amount: -52.7, merchant: 'Albert Heijn', category: 'Groceries', domain: 'personal' },
  { id: 'x16', date: '2026-06-22', amount: -41.0, merchant: 'Thuisbezorgd', category: 'Takeout', domain: 'personal' },
]

// ── HABITS ────────────────────────────────────────────────────────────────────
// Build a plausible completion history for the last 30 days. `keep(i)` decides,
// per day-offset (0 = today), whether the habit was done. tail = current streak.
function buildHistory(keep: (offset: number) => boolean): string[] {
  const out: string[] = []
  const today = new Date(TODAY + 'T00:00:00')
  for (let i = 29; i >= 1; i--) {
    if (keep(i)) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      out.push(d.toISOString().slice(0, 10))
    }
  }
  return out
}

export const habits: Habit[] = [
  { id: 'h1', name: 'Ochtendwandeling Kyra', streak: 4, doneToday: false, emoji: '🐕', color: '#6FA07C', history: buildHistory((i) => i <= 4 || i % 4 !== 0) },
  { id: 'h2', name: 'Geen schermen na 23:00', streak: 1, doneToday: false, emoji: '🌙', color: '#6E8CA8', history: buildHistory((i) => i <= 1 || i % 3 === 0) },
  { id: 'h3', name: 'Dag loggen (5 min)', streak: 9, doneToday: false, emoji: '📓', color: '#C6A05B', history: buildHistory((i) => i <= 9 || i % 5 !== 0) },
  { id: 'h4', name: 'Sporten / bewegen', streak: 0, doneToday: false, emoji: '🏃', color: '#C58392', history: buildHistory((i) => i % 2 === 0) },
  { id: 'h5', name: 'Diepe focus-blok', streak: 2, doneToday: false, emoji: '🎯', color: '#9385B0', history: buildHistory((i) => i <= 2 || i % 3 !== 1) },
]

// ── SURFACE: today's planned blocks (Day Builder seed) ───────────────────────
export const blocks: Block[] = [
  { id: 'b1', title: 'Dog walk + coffee', domain: 'personal', start: '07:30', end: '08:15', status: 'planned', rationale: 'Daily essential, Nox routine' },
  { id: 'b2', title: 'Deep work: mural concept boards (Lana)', domain: 'prjct', start: '09:30', end: '11:30', status: 'planned', rationale: 'Placed in your learned 09:30–12:30 focus peak' },
  { id: 'b3', title: 'Signage inspection prep', domain: 'parkingyou', start: '11:30', end: '12:15', status: 'planned', rationale: 'Due Jun 24, front-loaded before energy dips' },
  { id: 'b4', title: 'Lunch + walk', domain: 'personal', start: '12:30', end: '13:15', status: 'planned', rationale: 'Recovery, short night logged (5.7h)' },
  { id: 'b5', title: 'Admin: chase invoice #2026-031', domain: 'prjct', start: '13:30', end: '14:00', status: 'planned', rationale: 'Low-energy task slotted post-lunch (overdue)' },
  { id: 'b6', title: 'Buurtkaart: flyer distro follow-up', domain: 'buurtkaart', start: '14:00', end: '14:45', status: 'planned', rationale: 'Light coordination task for afternoon' },
  { id: 'b7', title: 'Evening dog walk', domain: 'personal', start: '18:00', end: '18:45', status: 'planned', rationale: 'Daily essential, Nox routine' },
]

// ── SURFACE: today's primary nudge ────────────────────────────────────────────
export const initialNudge: Nudge = {
  id: 'n1',
  domain: 'personal',
  text: 'You slept 5.7h. Your pattern says energy drops hard below 6h, protect the 09:30 deep-work block and push admin to the afternoon.',
  reason: 'pattern p1 (sleep↔energy) + today’s sense data',
}

// ── A little pre-existing memory so MEMORY view isn't empty ──────────────────
export const seedItems: StructuredItem[] = [
  {
    id: 'i1',
    text: 'Café De Kroon asked how QR scan-tracking is split per merchant on the Buurtkaart',
    source: 'chat',
    createdAt: '2026-06-18T10:12:00',
    domain: 'buurtkaart',
    kind: 'note',
    sentiment: 'neutral',
    summary: 'Merchant question about QR scan attribution',
  },
  {
    id: 'i2',
    text: 'Bakkerij van Dijk still hasn’t paid invoice 2026-031, getting annoyed',
    source: 'capture',
    createdAt: '2026-06-19T16:40:00',
    domain: 'prjct',
    kind: 'vent',
    sentiment: 'stressed',
    summary: 'Overdue invoice frustration (€880)',
  },
  {
    id: 'i3',
    text: 'Marco needs the gate access codes before he can start as host',
    source: 'capture',
    createdAt: '2026-06-20T09:05:00',
    domain: 'parkingyou',
    kind: 'task',
    sentiment: 'neutral',
    summary: 'Host onboarding blocked on access codes',
  },
]

// ── HEALTH: 14 days, aligned with dayLogs sleep values (Fit-style) ───────────
export const healthDays: HealthDay[] = [
  { date: '2026-06-09', steps: 9120, stepGoal: 8000, sleepHours: 7.4, restingHR: 58, activeMinutes: 42, energy: 4, mood: 4 },
  { date: '2026-06-10', steps: 4380, stepGoal: 8000, sleepHours: 5.2, restingHR: 64, activeMinutes: 16, energy: 2, mood: 3 },
  { date: '2026-06-11', steps: 5210, stepGoal: 8000, sleepHours: 5.8, restingHR: 63, activeMinutes: 21, energy: 2, mood: 2 },
  { date: '2026-06-12', steps: 7640, stepGoal: 8000, sleepHours: 6.9, restingHR: 60, activeMinutes: 34, energy: 3, mood: 3 },
  { date: '2026-06-13', steps: 10250, stepGoal: 8000, sleepHours: 7.6, restingHR: 57, activeMinutes: 55, energy: 4, mood: 4 },
  { date: '2026-06-14', steps: 12830, stepGoal: 8000, sleepHours: 8.1, restingHR: 55, activeMinutes: 71, energy: 5, mood: 4 },
  { date: '2026-06-15', steps: 8470, stepGoal: 8000, sleepHours: 7.2, restingHR: 58, activeMinutes: 44, energy: 4, mood: 4 },
  { date: '2026-06-16', steps: 6190, stepGoal: 8000, sleepHours: 6.1, restingHR: 61, activeMinutes: 28, energy: 3, mood: 3 },
  { date: '2026-06-17', steps: 4020, stepGoal: 8000, sleepHours: 5.5, restingHR: 65, activeMinutes: 14, energy: 2, mood: 2 },
  { date: '2026-06-18', steps: 3870, stepGoal: 8000, sleepHours: 5.1, restingHR: 66, activeMinutes: 12, energy: 2, mood: 2 },
  { date: '2026-06-19', steps: 7110, stepGoal: 8000, sleepHours: 6.4, restingHR: 60, activeMinutes: 31, energy: 3, mood: 3 },
  { date: '2026-06-20', steps: 9680, stepGoal: 8000, sleepHours: 7.8, restingHR: 57, activeMinutes: 49, energy: 4, mood: 4 },
  { date: '2026-06-21', steps: 8930, stepGoal: 8000, sleepHours: 7.1, restingHR: 58, activeMinutes: 46, energy: 4, mood: 4 },
  { date: '2026-06-22', steps: 3120, stepGoal: 8000, sleepHours: 5.7, restingHR: 64, activeMinutes: 11, energy: 2, mood: 3 },
]

// ── BEHAVIOUR SENSE: schermtijd + app-gebruik (14 dagen) ─────────────────────
// totalMinutes/pickups lopen op, focus zakt, op lage-energie & deadline dagen.
export const screenDays: ScreenDay[] = [
  { date: '2026-06-09', totalMinutes: 280, pickups: 78, focusMinutes: 150, distractMinutes: 70, topApps: [{ name: 'Figma', minutes: 92, category: 'work' }, { name: 'Gmail', minutes: 41, category: 'comms' }, { name: 'Instagram', minutes: 38, category: 'social' }] },
  { date: '2026-06-10', totalMinutes: 395, pickups: 142, focusMinutes: 95, distractMinutes: 210, topApps: [{ name: 'Instagram', minutes: 96, category: 'social' }, { name: 'YouTube', minutes: 84, category: 'media' }, { name: 'WhatsApp', minutes: 58, category: 'comms' }] },
  { date: '2026-06-11', totalMinutes: 410, pickups: 151, focusMinutes: 88, distractMinutes: 225, topApps: [{ name: 'Instagram', minutes: 102, category: 'social' }, { name: 'YouTube', minutes: 90, category: 'media' }, { name: 'Figma', minutes: 60, category: 'work' }] },
  { date: '2026-06-12', totalMinutes: 360, pickups: 120, focusMinutes: 175, distractMinutes: 120, topApps: [{ name: 'Adobe', minutes: 110, category: 'work' }, { name: 'Figma', minutes: 70, category: 'work' }, { name: 'WhatsApp', minutes: 55, category: 'comms' }] },
  { date: '2026-06-13', totalMinutes: 250, pickups: 70, focusMinutes: 140, distractMinutes: 55, topApps: [{ name: 'Figma', minutes: 88, category: 'work' }, { name: 'Spotify', minutes: 40, category: 'media' }, { name: 'Gmail', minutes: 32, category: 'comms' }] },
  { date: '2026-06-14', totalMinutes: 210, pickups: 58, focusMinutes: 60, distractMinutes: 95, topApps: [{ name: 'YouTube', minutes: 64, category: 'media' }, { name: 'Instagram', minutes: 48, category: 'social' }, { name: 'WhatsApp', minutes: 40, category: 'comms' }] },
  { date: '2026-06-15', totalMinutes: 265, pickups: 74, focusMinutes: 145, distractMinutes: 62, topApps: [{ name: 'Figma', minutes: 90, category: 'work' }, { name: 'Gmail', minutes: 38, category: 'comms' }, { name: 'Instagram', minutes: 36, category: 'social' }] },
  { date: '2026-06-16', totalMinutes: 320, pickups: 102, focusMinutes: 130, distractMinutes: 130, topApps: [{ name: 'Figma', minutes: 78, category: 'work' }, { name: 'Instagram', minutes: 72, category: 'social' }, { name: 'YouTube', minutes: 56, category: 'media' }] },
  { date: '2026-06-17', totalMinutes: 405, pickups: 148, focusMinutes: 150, distractMinutes: 190, topApps: [{ name: 'Adobe', minutes: 96, category: 'work' }, { name: 'Instagram', minutes: 88, category: 'social' }, { name: 'WhatsApp', minutes: 64, category: 'comms' }] },
  { date: '2026-06-18', totalMinutes: 420, pickups: 158, focusMinutes: 140, distractMinutes: 215, topApps: [{ name: 'Instagram', minutes: 104, category: 'social' }, { name: 'Adobe', minutes: 86, category: 'work' }, { name: 'YouTube', minutes: 80, category: 'media' }] },
  { date: '2026-06-19', totalMinutes: 300, pickups: 96, focusMinutes: 150, distractMinutes: 110, topApps: [{ name: 'Figma', minutes: 92, category: 'work' }, { name: 'Gmail', minutes: 44, category: 'comms' }, { name: 'Instagram', minutes: 58, category: 'social' }] },
  { date: '2026-06-20', totalMinutes: 255, pickups: 68, focusMinutes: 150, distractMinutes: 58, topApps: [{ name: 'Figma', minutes: 94, category: 'work' }, { name: 'Spotify', minutes: 42, category: 'media' }, { name: 'Gmail', minutes: 34, category: 'comms' }] },
  { date: '2026-06-21', totalMinutes: 248, pickups: 66, focusMinutes: 138, distractMinutes: 60, topApps: [{ name: 'Figma', minutes: 86, category: 'work' }, { name: 'WhatsApp', minutes: 38, category: 'comms' }, { name: 'Instagram', minutes: 34, category: 'social' }] },
  { date: '2026-06-22', totalMinutes: 400, pickups: 150, focusMinutes: 92, distractMinutes: 215, topApps: [{ name: 'Instagram', minutes: 100, category: 'social' }, { name: 'YouTube', minutes: 88, category: 'media' }, { name: 'WhatsApp', minutes: 56, category: 'comms' }] },
]

// ── BEHAVIOUR SENSE: locatie / meest bezochte plekken (14 dagen) ─────────────
// minuten per dag (waaktijd ~960). Lots-tijd piekt rond deadlines (12, 17, 18).
export const locationDays: LocationDay[] = [
  { date: '2026-06-09', timeHome: 540, timeOut: 360, timeCommute: 60, distanceKm: 22, places: [{ name: 'Thuis (Geldrop)', domain: 'personal', minutes: 540 }, { name: 'Kantoor/werkplek', domain: 'prjct', minutes: 300 }, { name: 'Albert Heijn', domain: 'personal', minutes: 30 }] },
  { date: '2026-06-10', timeHome: 720, timeOut: 180, timeCommute: 60, distanceKm: 14, places: [{ name: 'Thuis (Geldrop)', domain: 'personal', minutes: 720 }, { name: 'Kantoor/werkplek', domain: 'prjct', minutes: 150 }] },
  { date: '2026-06-11', timeHome: 760, timeOut: 140, timeCommute: 60, distanceKm: 11, places: [{ name: 'Thuis (Geldrop)', domain: 'personal', minutes: 760 }, { name: 'Dierenkliniek Geldrop', domain: 'personal', minutes: 45 }] },
  { date: '2026-06-12', timeHome: 420, timeOut: 480, timeCommute: 130, distanceKm: 58, places: [{ name: 'Strijp-S lot', domain: 'parkingyou', minutes: 240 }, { name: 'Kantoor/werkplek', domain: 'prjct', minutes: 180 }, { name: 'Thuis (Geldrop)', domain: 'personal', minutes: 420 }] },
  { date: '2026-06-13', timeHome: 600, timeOut: 300, timeCommute: 50, distanceKm: 19, places: [{ name: 'Thuis (Geldrop)', domain: 'personal', minutes: 600 }, { name: 'Kantoor/werkplek', domain: 'prjct', minutes: 240 }] },
  { date: '2026-06-14', timeHome: 780, timeOut: 150, timeCommute: 30, distanceKm: 8, places: [{ name: 'Thuis (Geldrop)', domain: 'personal', minutes: 780 }, { name: 'Wandeling Nox', domain: 'personal', minutes: 90 }] },
  { date: '2026-06-15', timeHome: 560, timeOut: 340, timeCommute: 60, distanceKm: 24, places: [{ name: 'Thuis (Geldrop)', domain: 'personal', minutes: 560 }, { name: 'Kantoor/werkplek', domain: 'prjct', minutes: 280 }, { name: 'Albert Heijn', domain: 'personal', minutes: 30 }] },
  { date: '2026-06-16', timeHome: 600, timeOut: 280, timeCommute: 80, distanceKm: 31, places: [{ name: 'Thuis (Geldrop)', domain: 'personal', minutes: 600 }, { name: 'Wijk Braakhuizen', domain: 'buurtkaart', minutes: 120 }, { name: 'Kantoor/werkplek', domain: 'prjct', minutes: 130 }] },
  { date: '2026-06-17', timeHome: 380, timeOut: 520, timeCommute: 140, distanceKm: 62, places: [{ name: 'Geldrop lot', domain: 'parkingyou', minutes: 200 }, { name: 'Strijp-S lot', domain: 'parkingyou', minutes: 180 }, { name: 'Thuis (Geldrop)', domain: 'personal', minutes: 380 }] },
  { date: '2026-06-18', timeHome: 400, timeOut: 500, timeCommute: 130, distanceKm: 55, places: [{ name: 'Strijp-S lot', domain: 'parkingyou', minutes: 220 }, { name: 'Kantoor/werkplek', domain: 'prjct', minutes: 200 }, { name: 'Thuis (Geldrop)', domain: 'personal', minutes: 400 }] },
  { date: '2026-06-19', timeHome: 580, timeOut: 320, timeCommute: 70, distanceKm: 27, places: [{ name: 'Thuis (Geldrop)', domain: 'personal', minutes: 580 }, { name: 'Kantoor/werkplek', domain: 'prjct', minutes: 260 }] },
  { date: '2026-06-20', timeHome: 620, timeOut: 280, timeCommute: 50, distanceKm: 18, places: [{ name: 'Thuis (Geldrop)', domain: 'personal', minutes: 620 }, { name: 'Kantoor/werkplek', domain: 'prjct', minutes: 240 }] },
  { date: '2026-06-21', timeHome: 640, timeOut: 260, timeCommute: 50, distanceKm: 16, places: [{ name: 'Thuis (Geldrop)', domain: 'personal', minutes: 640 }, { name: 'Albert Heijn', domain: 'personal', minutes: 35 }, { name: 'Kantoor/werkplek', domain: 'prjct', minutes: 200 }] },
  { date: '2026-06-22', timeHome: 700, timeOut: 200, timeCommute: 60, distanceKm: 13, places: [{ name: 'Thuis (Geldrop)', domain: 'personal', minutes: 700 }, { name: 'Kantoor/werkplek', domain: 'prjct', minutes: 160 }] },
]

// ── BEHAVIOUR SENSE: agenda-druk / meetings (14 dagen) ───────────────────────
// 3+ meetings versnipperen de dag; piek rond deadlines (12, 17, 18).
export const meetingDays: MeetingDay[] = [
  { date: '2026-06-09', count: 1, minutes: 30, fragmented: false },
  { date: '2026-06-10', count: 2, minutes: 75, fragmented: false },
  { date: '2026-06-11', count: 3, minutes: 110, fragmented: true },
  { date: '2026-06-12', count: 4, minutes: 150, fragmented: true },
  { date: '2026-06-13', count: 1, minutes: 40, fragmented: false },
  { date: '2026-06-14', count: 0, minutes: 0, fragmented: false },
  { date: '2026-06-15', count: 2, minutes: 60, fragmented: false },
  { date: '2026-06-16', count: 3, minutes: 95, fragmented: true },
  { date: '2026-06-17', count: 5, minutes: 180, fragmented: true },
  { date: '2026-06-18', count: 4, minutes: 140, fragmented: true },
  { date: '2026-06-19', count: 2, minutes: 70, fragmented: false },
  { date: '2026-06-20', count: 1, minutes: 45, fragmented: false },
  { date: '2026-06-21', count: 1, minutes: 30, fragmented: false },
  { date: '2026-06-22', count: 3, minutes: 100, fragmented: true },
]

// ── BEHAVIOUR SENSE: muziek / luistergedrag (14 dagen) ───────────────────────
// valence (0..1) als mood-proxy: zakt mee met je lage-mood dagen.
export const musicDays: MusicDay[] = [
  { date: '2026-06-09', minutes: 140, topGenre: 'Indie', tempo: 120, valence: 0.72 },
  { date: '2026-06-10', minutes: 180, topGenre: 'Lo-fi beats', tempo: 110, valence: 0.55 },
  { date: '2026-06-11', minutes: 165, topGenre: 'Lo-fi beats', tempo: 92, valence: 0.38 },
  { date: '2026-06-12', minutes: 200, topGenre: 'Electronic', tempo: 118, valence: 0.58 },
  { date: '2026-06-13', minutes: 150, topGenre: 'Indie', tempo: 124, valence: 0.74 },
  { date: '2026-06-14', minutes: 95, topGenre: 'Funk/Soul', tempo: 128, valence: 0.8 },
  { date: '2026-06-15', minutes: 135, topGenre: 'Indie', tempo: 122, valence: 0.73 },
  { date: '2026-06-16', minutes: 160, topGenre: 'Lo-fi beats', tempo: 108, valence: 0.56 },
  { date: '2026-06-17', minutes: 210, topGenre: 'Ambient', tempo: 95, valence: 0.35 },
  { date: '2026-06-18', minutes: 220, topGenre: 'Ambient', tempo: 90, valence: 0.33 },
  { date: '2026-06-19', minutes: 155, topGenre: 'Electronic', tempo: 112, valence: 0.57 },
  { date: '2026-06-20', minutes: 145, topGenre: 'Indie', tempo: 125, valence: 0.75 },
  { date: '2026-06-21', minutes: 130, topGenre: 'Indie', tempo: 120, valence: 0.71 },
  { date: '2026-06-22', minutes: 175, topGenre: 'Lo-fi beats', tempo: 100, valence: 0.5 },
]

// ── PROJECTS (mirrors a Notion projects DB) ──────────────────────────────────
export const projects: Project[] = [
  { id: 'pr1', name: 'Mural concept + brand boards', client: 'Lana de Vries', clientId: 'cl1', domain: 'prjct', status: 'active', deadline: '2026-06-23', progress: 0.7, value: 850, type: ['Branding', 'Design'], priority: 'High' },
  { id: 'pr2', name: 'Website + huisstijl', client: 'Bakkerij van Dijk', clientId: 'cl2', domain: 'prjct', status: 'review', deadline: '2026-06-27', progress: 0.9, value: 1150, type: ['Website', 'Branding'], priority: 'High' },
  { id: 'pr3', name: 'Website (aanbetaling binnen)', client: 'De Groot Installaties', clientId: 'cl3', domain: 'prjct', status: 'active', deadline: '2026-07-04', progress: 0.35, value: 1250, type: ['Website'], priority: 'Medium' },
  { id: 'pr4', name: 'Zomercampagne assets', client: 'ParkingYou', clientId: 'cl4', domain: 'parkingyou', status: 'active', deadline: '2026-06-30', progress: 0.5, value: 0, type: ['Social Media', 'Design'], priority: 'Medium' },
  { id: 'pr5', name: 'Buurtkaart flyer + distributie', client: 'Geldrop Buurtkaart', clientId: 'cl5', domain: 'buurtkaart', status: 'blocked', deadline: '2026-06-25', progress: 0.4, value: 0, type: ['Design'], priority: 'Low' },
  { id: 'pr6', name: 'Logo + social kit', client: 'Café De Kroon', clientId: 'cl6', domain: 'prjct', status: 'lead', deadline: null, progress: 0.1, value: 600, type: ['Logo', 'Social Media'], priority: 'Medium' },
  { id: 'pr7', name: 'Branding pakket', client: 'Kapsalon Mooi', clientId: 'cl7', domain: 'prjct', status: 'lead', deadline: null, progress: 0, value: 750, type: ['Branding'], priority: 'Low' },
  { id: 'pr8', name: 'Webshop redesign', client: 'Bloemist Geldrop', clientId: 'cl8', domain: 'prjct', status: 'done', deadline: '2026-05-30', progress: 1, value: 1100, type: ['Website'], priority: 'Medium' },
]

// ── CRM: clients ──────────────────────────────────────────────────────────────
export const clients: Client[] = [
  { id: 'cl1', name: 'Lana de Vries', domain: 'prjct', clientStatus: 'Active', potentie: 'Hoog', scope: 1500, firstContact: '2026-05-02', email: 'lana@studiolana.nl', website: 'studiolana.nl' },
  { id: 'cl2', name: 'Bakkerij van Dijk', domain: 'prjct', clientStatus: 'Active', potentie: 'Middel', scope: 1150, firstContact: '2026-04-18', email: 'info@bakkerijvandijk.nl' },
  { id: 'cl3', name: 'De Groot Installaties', domain: 'prjct', clientStatus: 'Active', potentie: 'Hoog', scope: 1250, firstContact: '2026-05-20', email: 'p.degroot@degroot-installaties.nl' },
  { id: 'cl4', name: 'ParkingYou', domain: 'parkingyou', clientStatus: 'Active', potentie: 'Hoog', scope: 3000, firstContact: '2025-11-01' },
  { id: 'cl5', name: 'Geldrop Buurtkaart', domain: 'buurtkaart', clientStatus: 'Active', potentie: 'Middel', scope: 0, firstContact: '2026-01-12' },
  { id: 'cl6', name: 'Café De Kroon', domain: 'prjct', clientStatus: 'Lead', potentie: 'Middel', scope: 600, firstContact: '2026-06-15', email: 'dekroon@kroongeldrop.nl' },
  { id: 'cl7', name: 'Kapsalon Mooi', domain: 'prjct', clientStatus: 'Prospect', potentie: 'Laag', scope: 750, firstContact: '2026-06-19' },
  { id: 'cl8', name: 'Bloemist Geldrop', domain: 'prjct', clientStatus: 'Past', potentie: 'Laag', scope: 1100, firstContact: '2026-03-04', email: 'hallo@bloemistgeldrop.nl' },
  { id: 'cl9', name: 'Garage Smolders', domain: 'prjct', clientStatus: 'Planned', potentie: 'Middel', scope: 900, firstContact: '2026-06-22' },
]

// ── CRM: unified client messages ──────────────────────────────────────────────
export const messages: Message[] = [
  { id: 'msg1', contact: 'Bakkerij van Dijk', contactKey: 'cl2', clientId: 'cl2', projectName: 'Website + huisstijl', channel: 'email', direction: 'in', subject: 'Re: Website oplevering', snippet: 'Ziet er goed uit! Nog een kleine aanpassing aan de openingstijden, dan kunnen we live.', body: 'Hoi Rick,\n\nZiet er goed uit! Nog een kleine aanpassing aan de openingstijden, dan kunnen we live. Wanneer kun je dat doen?\n\nGroet, Anja', ts: '2026-06-22T08:14:00', unread: true },
  { id: 'msg2', contact: 'Lana de Vries', contactKey: 'cl1', clientId: 'cl1', projectName: 'Mural concept + brand boards', channel: 'email', direction: 'in', subject: 'Concept boards vandaag?', snippet: 'Lukt het je om de mural-concepten vandaag te sturen? Wil ze morgen delen.', body: 'Spannend! Lukt het je om de mural-concepten vandaag te sturen? Wil ze morgen met de opdrachtgever delen.', ts: '2026-06-22T07:42:00', unread: true },
  { id: 'msg3', contact: 'Café De Kroon', contactKey: 'cl6', clientId: 'cl6', projectName: 'Logo + social kit', channel: 'fiverr', direction: 'in', subject: null, snippet: 'Klinkt goed! Kun je een offerte sturen voor het logo en de social media kit?', body: 'Klinkt goed wat je voorstelde. Kun je een offerte sturen voor het logo en de social media kit?', ts: '2026-06-20T14:20:00', unread: true },
  { id: 'msg4', contact: 'Café De Kroon', contactKey: 'cl6', clientId: 'cl6', projectName: 'Logo + social kit', channel: 'fiverr', direction: 'out', subject: null, snippet: 'Top, ik stuur je vanmiddag een offerte met 2 logo-richtingen.', body: 'Top, ik stuur je vanmiddag een offerte met 2 logo-richtingen.', ts: '2026-06-20T15:05:00', unread: false },
  { id: 'msg5', contact: 'De Groot Installaties', contactKey: 'cl3', clientId: 'cl3', projectName: 'Website (aanbetaling binnen)', channel: 'whatsapp', direction: 'in', snippet: 'Aanbetaling is overgemaakt, succes met de bouw!', body: 'Aanbetaling is overgemaakt, succes met de bouw!', subject: null, ts: '2026-06-21T16:30:00', unread: false },
  { id: 'msg6', contact: 'De Groot Installaties', contactKey: 'cl3', clientId: 'cl3', projectName: 'Website (aanbetaling binnen)', channel: 'whatsapp', direction: 'out', snippet: 'Top, bedankt! Ik lever de eerste opzet volgende week.', body: 'Top, bedankt! Ik lever de eerste opzet volgende week.', subject: null, ts: '2026-06-21T16:45:00', unread: false },
  { id: 'msg7', contact: 'Kapsalon Mooi', contactKey: 'cl7', clientId: 'cl7', projectName: 'Branding pakket', channel: 'whatsapp', direction: 'in', snippet: 'Hoi! We willen graag een nieuw logo en huisstijl. Wat kost dat ongeveer?', body: 'Hoi! We willen graag een nieuw logo en huisstijl. Wat kost dat ongeveer?', subject: null, ts: '2026-06-19T11:02:00', unread: true },
  { id: 'msg8', contact: 'Garage Smolders', contactKey: 'cl9', clientId: 'cl9', projectName: null, channel: 'email', direction: 'in', subject: 'Interesse in website', snippet: 'We zoeken iemand voor een nieuwe website + Google vindbaarheid.', body: 'We zoeken iemand voor een nieuwe website + Google vindbaarheid. Kun je bellen?', ts: '2026-06-22T09:10:00', unread: true },
]

// ── NORTH STAR: high-level goals + milestones ────────────────────────────────
export const goals: Goal[] = [
  { id: 'g1', title: 'Omzet PRJCT Agency', metric: 'EUR', target: 10000, current: 3680, deadline: '2026-09-22', domain: 'prjct' },
  { id: 'g2', title: 'Maandelijkse retainers (terugkerend)', metric: 'EUR', target: 1500, current: 400, deadline: '2026-09-22', domain: 'prjct' },
  { id: 'g3', title: 'Beweging: 8k stappen/dag gemiddeld', metric: 'steps', target: 8000, current: 7060, deadline: '2026-07-22', domain: 'personal' },
]

export const milestones: Milestone[] = [
  { id: 'm1', goalId: 'g1', title: 'Eerste €2.500 binnen', done: true, due: '2026-06-15' },
  { id: 'm2', goalId: 'g1', title: '3 betalende klanten tegelijk', done: true, due: null },
  { id: 'm3', goalId: 'g1', title: '€5.000 halverwege', done: false, due: '2026-07-31' },
  { id: 'm4', goalId: 'g2', title: 'Eerste retainer-klant tekenen', done: true, due: null },
  { id: 'm5', goalId: 'g2', title: '3 retainers actief', done: false, due: '2026-09-01' },
  { id: 'm6', goalId: 'g3', title: '7 dagen op rij 8k stappen', done: false, due: null },
]

// ── INBOX: most important Gmail threads ──────────────────────────────────────
export const emails: EmailItem[] = [
  { id: 'em1', from: 'Bakkerij van Dijk', subject: 'Re: Website oplevering', snippet: 'Hoi Rick, ziet er goed uit! Nog een kleine aanpassing aan de openingstijden, dan kunnen we live.', receivedAt: '2026-06-22T08:14:00', unread: true, important: true, domain: 'prjct' },
  { id: 'em2', from: 'Lana de Vries', subject: 'Concept boards vandaag?', snippet: 'Spannend! Lukt het je om de mural-concepten vandaag te sturen? Wil ze morgen met de opdrachtgever delen.', receivedAt: '2026-06-22T07:42:00', unread: true, important: true, domain: 'prjct' },
  { id: 'em3', from: 'De Groot Installaties', subject: 'Aanbetaling voldaan', snippet: 'Bevestiging: €650 is overgemaakt. Succes met de bouw, we kijken ernaar uit.', receivedAt: '2026-06-21T16:30:00', unread: false, important: true, domain: 'prjct' },
  { id: 'em4', from: 'Marco Theunissen', subject: 'Toegangscodes Strijp-S', snippet: 'Hey, ik kan nog niet starten zonder de toegangscodes voor de slagboom. Kun je die regelen?', receivedAt: '2026-06-21T11:05:00', unread: true, important: true, domain: 'parkingyou' },
  { id: 'em5', from: 'Café De Kroon', subject: 'Offerte logo + social', snippet: 'Klinkt goed wat je voorstelde. Kun je een offerte sturen voor het logo en de social media kit?', receivedAt: '2026-06-20T14:20:00', unread: true, important: false, domain: 'prjct' },
  { id: 'em6', from: 'KvK', subject: 'Jaarlijkse update gegevens', snippet: 'Controleer of je inschrijving nog actueel is.', receivedAt: '2026-06-19T09:00:00', unread: false, important: false, domain: 'personal' },
]

// ── OUTSTANDING PAYMENTS (mirror of the dedicated Google Calendar) ───────────
export const payments: Payment[] = [
  // incoming = klanten moeten Rick nog betalen
  { id: 'pay1', payee: 'Bakkerij van Dijk', amount: 880, due: '2026-06-20', direction: 'incoming', status: 'open', domain: 'prjct', source: 'calendar', externalId: 'evt-vandijk-031' },
  { id: 'pay2', payee: 'De Groot Installaties (restant 50%)', amount: 600, due: '2026-07-04', direction: 'incoming', status: 'open', domain: 'prjct', source: 'calendar', externalId: 'evt-degroot-2' },
  { id: 'pay3', payee: 'Café De Kroon (aanbetaling)', amount: 300, due: '2026-06-28', direction: 'incoming', status: 'open', domain: 'prjct', source: 'calendar', externalId: 'evt-kroon-1' },
  // outgoing = Rick moet nog betalen
  { id: 'pay4', payee: 'Belastingdienst (BTW Q2)', amount: 1240, due: '2026-07-31', direction: 'outgoing', status: 'open', domain: 'personal', source: 'calendar', externalId: 'evt-btw-q2' },
  { id: 'pay5', payee: 'Adobe Creative Cloud (jaar)', amount: 660, due: '2026-06-30', direction: 'outgoing', status: 'open', domain: 'prjct', source: 'calendar', externalId: 'evt-adobe' },
  { id: 'pay6', payee: 'Huur kantoor/werkplek', amount: 450, due: '2026-07-01', direction: 'outgoing', status: 'open', domain: 'personal', source: 'calendar', externalId: 'evt-huur-jul' },
  { id: 'pay7', payee: 'Hosting + domeinen', amount: 95, due: '2026-06-24', direction: 'outgoing', status: 'open', domain: 'prjct', source: 'calendar', externalId: 'evt-hosting' },
]

// ── SUBSCRIPTIONS (recurring spend, mirrors a subs database) ─────────────────
export const subscriptions: Subscription[] = [
  { id: 'sub1', name: 'Adobe Creative Cloud', amount: 660, cadence: 'yearly', nextCharge: '2026-06-30', active: true, category: 'Software', domain: 'prjct' },
  { id: 'sub2', name: 'Canva Pro', amount: 89, cadence: 'yearly', nextCharge: '2027-06-18', active: true, category: 'Software', domain: 'prjct' },
  { id: 'sub3', name: 'Spotify', amount: 11.99, cadence: 'monthly', nextCharge: '2026-07-16', active: true, category: 'Media', domain: 'personal' },
  { id: 'sub4', name: 'Hosting + domeinen', amount: 95, cadence: 'quarterly', nextCharge: '2026-06-24', active: true, category: 'Hosting', domain: 'prjct' },
  { id: 'sub5', name: 'Vercel Pro', amount: 20, cadence: 'monthly', nextCharge: '2026-07-01', active: true, category: 'Hosting', domain: 'prjct' },
  { id: 'sub6', name: 'ChatGPT Plus', amount: 23, cadence: 'monthly', nextCharge: '2026-07-08', active: true, category: 'AI', domain: 'prjct' },
  { id: 'sub7', name: 'Notion', amount: 96, cadence: 'yearly', nextCharge: '2026-11-02', active: true, category: 'Productivity', domain: 'prjct' },
  { id: 'sub8', name: 'Sportschool Geldrop', amount: 29.5, cadence: 'monthly', nextCharge: '2026-07-01', active: false, category: 'Health', domain: 'personal', notes: 'gepauzeerd sinds mei' },
]

export const OPENING_BALANCE = 2840

export const STORAGE_KEY = 'rick-os-state-v7'
