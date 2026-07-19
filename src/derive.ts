import type {
  Essential,
  Thread,
  Pattern,
  DayLog,
  Project,
  Client,
  HealthDay,
  Checkin,
  ScreenDay,
  Transaction,
  Goal,
  DogEntry,
  Nudge,
  Correlation,
  Anomaly,
} from './types'
import { DOMAIN_META, TODAY, today, fmtDate, daysBetween } from './domains'

// ── Live-data derivation layer ───────────────────────────────────────────────
// The app is live-only: the mock seed is empty. These pure helpers reconstruct
// the REMEMBER stores (Essentials / Threads / baseline Patterns) and the inputs
// REFLECT needs (DayLogs, deadline anchors) from whatever real data is actually
// flowing from Supabase. Everything degrades gracefully: a stream with no rows
// simply contributes nothing instead of producing a blank or nonsensical card.

const round = (n: number, d = 0) => {
  const f = Math.pow(10, d)
  return Math.round(n * f) / f
}

// ── ESSENTIALS — permanent / slowly-changing facts about Rick's world ─────────

export function deriveEssentials(
  clients: Client[],
  projects: Project[],
  goals: Goal[],
  dogEntries: DogEntry[],
): Essential[] {
  const out: Essential[] = [
    { id: 'e-tz', domain: 'personal', label: 'Tijdzone', value: 'Europe/Amsterdam' },
    { id: 'e-base', domain: 'personal', label: 'Thuisbasis', value: 'Geldrop, NL' },
    { id: 'e-role-py', domain: 'parkingyou', label: 'Rol', value: 'ParkingYou' },
    { id: 'e-role-prjct', domain: 'prjct', label: 'Rol', value: 'PRJCT Agency' },
    { id: 'e-role-gbk', domain: 'buurtkaart', label: 'Rol', value: 'Geldrop Buurtkaart' },
  ]

  const activeClients = clients.filter((c) => c.clientStatus === 'Active').length
  if (clients.length) {
    out.push({
      id: 'e-clients',
      domain: 'prjct',
      label: 'Klantenbestand',
      value: `${clients.length} klanten · ${activeClients} actief`,
    })
  }

  const liveProjects = projects.filter((p) => p.status !== 'done').length
  if (projects.length) {
    out.push({
      id: 'e-projects',
      domain: 'prjct',
      label: 'Lopende projecten',
      value: `${liveProjects} actief van ${projects.length} totaal`,
    })
  }

  if (goals.length) {
    out.push({
      id: 'e-goals',
      domain: 'cross',
      label: 'Noordster-doelen',
      value: `${goals.length} actief`,
    })
  }

  if (dogEntries.length) {
    out.push({ id: 'e-dog', domain: 'personal', label: 'Hond', value: 'Kyra' })
  }

  return out
}

// ── THREADS — open loops / promises owed, reconstructed from real work ────────
// Projects that aren't done are open loops; their deadline is the closure date
// and the client (or domain) is who it's owed to. High-potential leads are
// follow-ups owed to a prospect. Closed/seeded threads from brain_state always
// take precedence over these — derivation only fills an empty store.

export function deriveThreads(projects: Project[], clients: Client[]): Thread[] {
  const out: Thread[] = []

  for (const p of projects) {
    if (p.status === 'done') continue
    out.push({
      id: `thr-prj-${p.id}`,
      domain: p.domain,
      title: p.name,
      owedTo: p.client?.trim() || DOMAIN_META[p.domain].label,
      due: p.deadline,
      status: 'open',
      createdAt: TODAY,
    })
  }

  // High-potential leads/prospects = a follow-up loop owed to the contact.
  for (const c of clients) {
    if ((c.clientStatus === 'Lead' || c.clientStatus === 'Prospect') && c.potentie === 'Hoog') {
      out.push({
        id: `thr-cli-${c.id}`,
        domain: c.domain,
        title: `Opvolgen: ${c.name}`,
        owedTo: c.name,
        due: null,
        status: 'open',
        createdAt: TODAY,
      })
    }
  }

  // Sort: dated loops first (soonest deadline), then undated.
  return out.sort((a, b) => {
    const ad = a.due ? daysBetween(TODAY, a.due) : 9999
    const bd = b.due ? daysBetween(TODAY, b.due) : 9999
    return ad - bd
  })
}

// ── DEADLINE ANCHORS — real project deadlines drive the spend↔stress link ─────

export function deriveDeadlines(projects: Project[]): string[] {
  return Array.from(
    new Set(projects.filter((p) => p.status !== 'done' && p.deadline).map((p) => p.deadline as string)),
  )
}

// ── DAYLOGS — REFLECT's sleep/energy substrate ───────────────────────────────
// Sleep comes from the health sense; energy/mood come from the daily check-in.
// A day without a check-in falls back to a neutral 3, and REFLECT guards every
// energy-based correlation behind hasEnergySignal() so we never report a
// fabricated "energy dropped ~0%" before any check-ins exist.

/** Stamp check-in energy/mood onto the matching health day (for the Vitals view). */
export function applyCheckins(healthDays: HealthDay[], checkins: Checkin[]): HealthDay[] {
  const byDate = new Map(checkins.map((c) => [c.date, c]))
  return healthDays.map((h) => {
    const c = byDate.get(h.date)
    return c ? { ...h, energy: c.energy, mood: c.mood } : h
  })
}

export function deriveDayLogs(healthDays: HealthDay[], checkins: Checkin[] = []): DayLog[] {
  const checkinByDate = new Map(checkins.map((c) => [c.date, c]))
  const healthByDate = new Map(healthDays.map((h) => [h.date, h]))
  const dates = new Set<string>([...healthByDate.keys(), ...checkinByDate.keys()])

  return [...dates]
    .map((date) => {
      const h = healthByDate.get(date)
      const c = checkinByDate.get(date)
      return {
        date,
        sleepHours: h?.sleepHours ?? 0,
        energy: c?.energy ?? h?.energy ?? 3,
        mood: c?.mood ?? h?.mood ?? 3,
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** True only when sleep is actually being ingested (not all-zero). */
export function hasSleepSignal(logs: DayLog[]): boolean {
  return logs.some((l) => l.sleepHours > 0)
}

/** True only when energy varies — i.e. a real signal, not the neutral default. */
export function hasEnergySignal(logs: DayLog[]): boolean {
  const vals = new Set(logs.map((l) => l.energy))
  return vals.size > 1
}

// ── NUDGE — the single most useful proactive prompt, in Dutch ─────────────────
// Surface picks ONE thing that matters now from the whole memory: an overdue
// promise first, then blocked work, then the strongest learned correlation,
// then a calm default. Always Dutch, always sourced from real state.

export function buildNudge(
  threads: Thread[],
  projects: Project[],
  correlations: Correlation[],
  _anomalies: Anomaly[],
  reflectCount = 0,
): Nudge {
  // Recompute the date at call time — this runs in a long-lived PWA, so the
  // frozen TODAY constant would misjudge "overdue" across a midnight rollover.
  const now = today()

  const overdue = threads
    .filter((t) => t.status === 'open' && t.due && daysBetween(t.due, now) > 0)
    .sort((a, b) => daysBetween(b.due!, now) - daysBetween(a.due!, now))[0]
  if (overdue) {
    return {
      id: 'nudge-overdue',
      domain: overdue.domain,
      text: `"${overdue.title}" is ${daysBetween(overdue.due!, now)} dag(en) over de deadline (${overdue.owedTo}). Sluit deze loop eerst — een openstaande belofte weegt het zwaarst.`,
      reason: 'oudste verlopen open loop',
    }
  }

  const blocked = projects.filter((p) => p.status === 'blocked')
  if (blocked.length) {
    return {
      id: 'nudge-blocked',
      domain: blocked[0].domain,
      text: `${blocked.length} project(en) staan geblokkeerd, waaronder "${blocked[0].name}". Eén bericht kan ze weer in beweging zetten.`,
      reason: 'geblokkeerd werk dat op jou wacht',
    }
  }

  if (correlations.length) {
    const top = correlations.slice().sort((a, b) => b.strength - a.strength)[0]
    return {
      id: 'nudge-corr',
      domain: top.domains[0] ?? 'cross',
      text: `${top.title}. ${top.detail}`,
      reason: 'sterkste domein-overstijgende verband',
    }
  }

  const nextDue = threads
    .filter((t) => t.status === 'open' && t.due)
    .sort((a, b) => daysBetween(now, a.due!) - daysBetween(now, b.due!))[0]
  if (nextDue) {
    return {
      id: 'nudge-next',
      domain: nextDue.domain,
      text: `Eerstvolgende deadline: "${nextDue.title}" op ${fmtDate(nextDue.due)} (${nextDue.owedTo}).`,
      reason: 'eerstvolgende open loop met datum',
    }
  }

  return {
    id: 'nudge-calm',
    domain: 'personal',
    text: `Geen verlopen loops of harde deadlines vandaag. Goed moment voor diep werk of iets uit je Noordster.`,
    reason: 'alles onder controle',
  }
}

// ── BASELINE PATTERNS — real recurring observations for the Memory store ──────
// Even before REFLECT finds a cross-domain correlation, these are honest,
// data-backed observations (each computed from rows that exist) so "Patronen"
// is never empty when data is flowing. Confidence reflects how much data backs
// it; lastReinforced is today (they're recomputed live).

export function deriveBaselinePatterns(
  health: HealthDay[],
  screen: ScreenDay[],
  txns: Transaction[],
  projects: Project[],
  clients: Client[],
): Pattern[] {
  const out: Pattern[] = []

  const steps = health.map((h) => h.steps).filter((s) => s > 0)
  if (steps.length >= 3) {
    const min = Math.min(...steps)
    const max = Math.max(...steps)
    const avg = Math.round(steps.reduce((a, b) => a + b, 0) / steps.length)
    out.push({
      id: 'pat-steps',
      domain: 'personal',
      text: `Stappen schommelen sterk: ${(min / 1000).toFixed(0)}k–${(max / 1000).toFixed(
        0,
      )}k per dag (gem. ${(avg / 1000).toFixed(1)}k).`,
      confidence: Math.min(0.8, 0.4 + steps.length * 0.04),
      lastReinforced: TODAY,
      trend: 'flat',
    })
  }

  if (screen.length >= 2) {
    const distract = Math.round(screen.reduce((a, s) => a + s.distractMinutes, 0) / screen.length)
    const focus = Math.round(screen.reduce((a, s) => a + s.focusMinutes, 0) / screen.length)
    out.push({
      id: 'pat-screen',
      domain: 'personal',
      text: `Gemiddeld ${distract} min afleidende vs ${focus} min focus-schermtijd per dag.`,
      confidence: Math.min(0.7, 0.3 + screen.length * 0.05),
      lastReinforced: TODAY,
      trend: 'flat',
    })
  }

  const blocked = projects.filter((p) => p.status === 'blocked')
  if (blocked.length) {
    out.push({
      id: 'pat-blocked',
      domain: 'prjct',
      text: `${blocked.length} project(en) staan geblokkeerd — werk dat vastzit op een externe factor.`,
      confidence: Math.min(0.85, 0.5 + blocked.length * 0.1),
      lastReinforced: TODAY,
      trend: blocked.length > 1 ? 'up' : 'flat',
    })
  }

  const leads = clients.filter((c) => c.clientStatus === 'Lead').length
  const active = clients.filter((c) => c.clientStatus === 'Active').length
  if (clients.length >= 5) {
    out.push({
      id: 'pat-pipeline',
      domain: 'prjct',
      text: `Pijplijn: ${leads} leads tegenover ${active} actieve klanten — ${
        leads > active ? 'meer in de funnel dan in uitvoering' : 'gezonde verhouding'
      }.`,
      confidence: 0.6,
      lastReinforced: TODAY,
      trend: 'flat',
    })
  }

  const spend = txns.filter((t) => t.amount < 0)
  if (spend.length >= 4) {
    const total = Math.abs(spend.reduce((a, t) => a + t.amount, 0))
    out.push({
      id: 'pat-spend',
      domain: 'personal',
      text: `${spend.length} uitgaven geregistreerd, samen €${round(total)} — nog te dun voor een betrouwbaar bestedingspatroon.`,
      confidence: 0.35,
      lastReinforced: TODAY,
      trend: 'flat',
    })
  }

  return out
}
