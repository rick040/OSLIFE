// ── HEYRA · day planner ───────────────────────────────────────────────────────
// Builds an optimal day plan for today + the rest of the week, planned AROUND
// what's fixed: your scheduled calendar events (day_blocks), your routines
// (habits) and your actual sleep rhythm. The brain proposes the blocks that
// fill the gaps (deep work in the peak, routines, breaks, wind-down); a
// rule-based planner is the fallback so a plan always appears even when the
// brain is unavailable. Nothing here writes anywhere — the store persists a
// block only when Rick locks it. Same honesty rule: plan around real data.
//
// The rule-based fallback used to be one fixed template repeated every day
// (same "Ochtendroutine"/"Lunch"/"Wandeling met Kyra" at the same times,
// regardless of what was actually true) — the exact "not smart, just a set
// of blocks" complaint the Dashboard's suggestion engine (heyra/
// blockSuggestions.ts) fixed for "Vandaag". This applies the same idea here:
// candidates generated from real data, greedily placed into whatever's
// actually free, nothing forced when there's genuinely no room.

import type { PlanBlock, PlanBlockKind, Domain, Habit, Goal, Thread, Pattern, DogReminder, Payment, EmailItem, Client } from '../types'
import { askBrain } from './brainClient'
import { parseBrainJson } from './brainJson'
import { fmtDate } from '../domains'
import { classifyImportance } from '../lib/crm/emailClassify'
import { clientHealth } from '../lib/crm/followUp'
import type { SleepWindow } from '../lib/supabase'

// Fallback learned high-energy window, used whenever there's no real sleep
// data yet to anchor the day to (mirrors the banner DayBuilder used to show
// unconditionally — now the actually-used window, see dayBounds() below).
export const PEAK_START = '09:30'
export const PEAK_END = '12:30'
const DEFAULT_DAY_START = '06:00'
const DEFAULT_DAY_END = '23:00'

const DOMAINS: Domain[] = ['parkingyou', 'prjct', 'buurtkaart', 'personal', 'cross']
const KINDS: PlanBlockKind[] = ['event', 'focus', 'routine', 'break', 'meal', 'admin', 'wind-down', 'personal']

export interface PlannerContext {
  /** Fixed blocks across the week the planner must not overlap: calendar events + already-locked blocks. */
  events: PlanBlock[]
  habits: Habit[]
  goals: Goal[]
  threads: Thread[]
  patterns: Pattern[]
  /** Kyra reminders — a due-today one earns its own block; a daily walk is proposed regardless. */
  dogReminders?: DogReminder[]
  /** Overdue payments — only meaningful for the nearest planned day (today), never predicted into the future. */
  overduePayments?: Payment[]
  emails?: EmailItem[]
  clients?: Client[]
  /** Learned wake/bed time-of-day (heyra/blockSuggestions-style: real data, or null to fall back to defaults). */
  sleep?: SleepWindow | null
}

// ── time helpers ──────────────────────────────────────────────────────────────
const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10))
  return (h || 0) * 60 + (m || 0)
}
const toHHMM = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const overlaps = (aS: number, aE: number, bS: number, bE: number): boolean => aS < bE && bS < aE

let counter = 0
const planId = (date: string, start: string): string => `plan-${date}-${start.replace(':', '')}-${(counter++).toString(36)}`

export interface DayBounds {
  dayStart: string
  peakStart: string
  peakEnd: string
  dayEnd: string
}

/**
 * Wake/bedtime-anchored day bounds — the planner's version of "base it on
 * sleeping time and wake-up time". Falls back to the fixed defaults when
 * there's no real sleep data yet, or a reading is too implausible to trust
 * (e.g. a stray 3am "wake").
 */
export function dayBounds(sleep?: SleepWindow | null): DayBounds {
  const wake = sleep?.wakeMinutes
  const bed = sleep?.bedMinutes
  const hasWake = wake != null && wake >= 4 * 60 && wake <= 11 * 60
  const hasBed = bed != null && bed >= 20 * 60 && bed <= 23 * 60 + 59
  const dayStartMin = hasWake ? Math.round(wake! / 5) * 5 : toMin(DEFAULT_DAY_START)
  // Peak focus window: starts ~2h after a real wake time (coffee, shower,
  // easing in), runs 3h — without real data it keeps the fixed default window.
  const peakStartMin = hasWake ? dayStartMin + 2 * 60 : toMin(PEAK_START)
  const peakEndMin = hasWake ? peakStartMin + 3 * 60 : toMin(PEAK_END)
  const dayEndMin = hasBed ? Math.max(21 * 60, Math.round(bed! / 5) * 5) : toMin(DEFAULT_DAY_END)
  return { dayStart: toHHMM(dayStartMin), peakStart: toHHMM(peakStartMin), peakEnd: toHHMM(peakEndMin), dayEnd: toHHMM(dayEndMin) }
}

function isWeekend(date: string): boolean {
  const day = new Date(date + 'T00:00:00').getDay()
  return day === 0 || day === 6
}

/** Every real candidate for the peak focus block, most urgent first — the planner rotates through these across the week instead of repeating one target every day. */
function focusTargets(ctx: PlannerContext): { title: string; domain: Domain }[] {
  const open = ctx.threads.filter((t) => t.status === 'open').sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
  const targets = open.map((t) => ({ title: `Diep werk: ${t.title}`, domain: t.domain }))
  for (const g of ctx.goals) targets.push({ title: `Diep werk richting "${g.title}"`, domain: g.domain })
  if (!targets.length) targets.push({ title: 'Diep werk (belangrijkste taak)', domain: 'prjct' as Domain })
  return targets
}

// ── rule-based, candidate + slot-finder ──────────────────────────────────────
interface Candidate {
  key: string
  title: string
  domain: Domain
  kind: PlanBlockKind
  rationale: string
  durationMin: number
  /** Earliest minute this candidate would ideally start. */
  pref: number
  score: number
}

/** First free slot of `durationMin` at/after `earliest`, within [dayStartMin, dayEndMin) — or null when there's genuinely no room. */
function findSlot(busy: [number, number][], durationMin: number, earliest: number, dayStartMin: number, dayEndMin: number): [number, number] | null {
  let start = Math.max(Math.ceil(earliest / 5) * 5, dayStartMin)
  const sorted = [...busy].sort((a, b) => a[0] - b[0])
  // eslint-disable-next-line no-constant-condition
  while (start + durationMin <= dayEndMin) {
    const end = start + durationMin
    const clash = sorted.find(([s, e]) => start < e && s < end)
    if (!clash) return [start, end]
    start = clash[1]
  }
  return null
}

/**
 * Rule-based proposed blocks for one date, placed only where the day is
 * actually free. `dateIndex` (0 = the nearest planned day, i.e. today) gates
 * the "live state" candidates (overdue payments, unread mail, a lapsed
 * follow-up) — those numbers are only real for the nearest day; later days
 * fall back to a generic shallow-work slot instead of pretending to predict
 * next Thursday's inbox.
 */
export function ruleBasedDayPlan(date: string, ctx: PlannerContext, dateIndex = 0): PlanBlock[] {
  const bounds = dayBounds(ctx.sleep)
  const dayStartMin = toMin(bounds.dayStart)
  const dayEndMin = toMin(bounds.dayEnd)
  const peakStartMin = toMin(bounds.peakStart)
  const peakEndMin = toMin(bounds.peakEnd)
  const weekend = isWeekend(date)
  const busy: [number, number][] = ctx.events.filter((e) => e.date === date).map((e) => [toMin(e.start), toMin(e.end)])

  const candidates: Candidate[] = []

  // Every open habit gets its own short block, staggered right after waking
  // — not one generic "Ochtendroutine" line bundling the first three names.
  ctx.habits.slice(0, 5).forEach((h, i) => {
    candidates.push({
      key: `habit-${h.id}`,
      title: `${h.emoji} ${h.name}`,
      domain: 'personal',
      kind: 'routine',
      rationale: h.streak > 0 ? `Vaste gewoonte — houd de reeks van ${h.streak} dag(en) erin.` : 'Vaste gewoonte, elke dag op zijn plek.',
      durationMin: 15,
      pref: dayStartMin + 30 + i * 15,
      score: 90 - i,
    })
  })

  if (!weekend) {
    const targets = focusTargets(ctx)
    const target = targets[dateIndex % targets.length]
    candidates.push({
      key: 'focus-1',
      title: target.title,
      domain: target.domain,
      kind: 'focus',
      rationale: `In je geleerde focuspiek (${bounds.peakStart}–${bounds.peakEnd}) — hier landt diep werk het best.`,
      durationMin: 90,
      pref: peakStartMin,
      score: 96,
    })
    candidates.push({
      key: 'break-1',
      title: 'Korte pauze',
      domain: 'personal',
      kind: 'break',
      rationale: 'Even loskomen houdt het tweede focusblok scherp.',
      durationMin: 15,
      pref: peakStartMin + 90,
      score: 80,
    })
    const target2 = targets[(dateIndex + 1) % targets.length]
    candidates.push({
      key: 'focus-2',
      title: target2.title === target.title ? 'Vervolg diep werk' : target2.title,
      domain: target2.domain,
      kind: 'focus',
      rationale: 'Tweede helft van de focuspiek benutten voordat de energie zakt.',
      durationMin: 60,
      pref: peakStartMin + 105,
      score: 78,
    })
    candidates.push({
      key: 'lunch',
      title: 'Lunch',
      domain: 'personal',
      kind: 'meal',
      rationale: 'Echt pauzeren, niet doorwerken — beschermt de middag.',
      durationMin: 45,
      pref: peakEndMin,
      score: 70,
    })

    if (dateIndex === 0) {
      const overdue = ctx.overduePayments ?? []
      if (overdue.length) {
        candidates.push({
          key: 'money',
          title: `Betalingen wegwerken (${overdue.length})`,
          domain: overdue[0].domain,
          kind: 'admin',
          rationale: `${overdue.length} betaling${overdue.length > 1 ? 'en staan' : ' staat'} al te laat.`,
          durationMin: 20,
          pref: peakEndMin + 45,
          score: 68,
        })
      }
      const importantUnread = (ctx.emails ?? []).filter((e) => e.unread && classifyImportance(e) === 'high')
      if (importantUnread.length) {
        candidates.push({
          key: 'mail',
          title: `Mail beantwoorden (${importantUnread.length} belangrijk)`,
          domain: 'cross',
          kind: 'admin',
          rationale: `${importantUnread.length} belangrijke mail${importantUnread.length > 1 ? 's wachten' : ' wacht'} nog.`,
          durationMin: Math.min(45, 15 + importantUnread.length * 10),
          pref: peakEndMin + 45,
          score: 66,
        })
      }
      const lapsed = (ctx.clients ?? []).filter((c) => clientHealth(c, date) === 'red')
      if (lapsed.length) {
        candidates.push({
          key: 'client',
          title: `Bel ${lapsed[0].name}`,
          domain: lapsed[0].domain,
          kind: 'admin',
          rationale: 'Opvolging is verlopen — een kort belletje houdt het warm.',
          durationMin: 20,
          pref: peakEndMin + 60,
          score: 64,
        })
      }
    } else {
      candidates.push({
        key: 'admin',
        title: 'Klanten & mail',
        domain: 'prjct',
        kind: 'admin',
        rationale: 'Shallow werk in het natuurlijke energiedal van de middag.',
        durationMin: 45,
        pref: peakEndMin + 45,
        score: 55,
      })
    }
  }

  // Kyra: a reminder due exactly this date (or, on the nearest day, one already
  // overdue) earns its own block; a daily walk is proposed regardless.
  const dogDue = (ctx.dogReminders ?? []).filter((r) => !r.done && (r.due === date || (dateIndex === 0 && r.due < date)))
  if (dogDue.length) {
    candidates.push({
      key: `dog-${dogDue[0].id}`,
      title: `🐾 ${dogDue[0].title}`,
      domain: 'personal',
      kind: 'personal',
      rationale: 'Kyra-herinnering — nog niet als blok gepland.',
      durationMin: 30,
      pref: dayEndMin - 5 * 60,
      score: 60,
    })
  }
  candidates.push({
    key: 'walk',
    title: weekend ? 'Lange wandeling met Kyra' : 'Wandeling met Kyra',
    domain: 'personal',
    kind: 'routine',
    rationale: 'Beweging + de hond uit — koppelt werk los van de rest van de dag.',
    durationMin: weekend ? 60 : 45,
    pref: dayEndMin - 5 * 60 + 15,
    score: 58,
  })

  if (weekend) {
    candidates.push({
      key: 'personal-time',
      title: 'Persoonlijke tijd',
      domain: 'personal',
      kind: 'personal',
      rationale: 'Bewust vrije ruimte — herstel is onderdeel van het plan.',
      durationMin: 120,
      pref: dayStartMin + 5 * 60,
      score: 50,
    })
  }

  candidates.push({
    key: 'wind-down',
    title: 'Wind-down',
    domain: 'personal',
    kind: 'wind-down',
    rationale: `Schermen uit en tot rust komen richting je gebruikelijke bedtijd (~${bounds.dayEnd}).`,
    durationMin: 30,
    pref: dayEndMin - 30,
    score: 40,
  })

  const out: PlanBlock[] = []
  for (const c of candidates.sort((a, b) => b.score - a.score)) {
    const slot = findSlot(busy, c.durationMin, c.pref, dayStartMin, dayEndMin)
    if (!slot) continue
    busy.push(slot)
    out.push({
      id: planId(date, toHHMM(slot[0])),
      date,
      title: c.title,
      domain: c.domain,
      start: toHHMM(slot[0]),
      end: toHHMM(slot[1]),
      rationale: c.rationale,
      kind: c.kind,
      source: 'rule',
      locked: false,
    })
  }
  return out.sort((a, b) => a.start.localeCompare(b.start))
}

// ── brain planner ─────────────────────────────────────────────────────────────
const PLAN_SYSTEM = `Je bent de dagplanner van HEYRA (OSLIFE). Je maakt een optimaal dagplan voor meerdere dagen, gepland ROND de vaste afspraken. Je krijgt per dag de bestaande agenda-afspraken (vast, niet verplaatsen), de routines/gewoontes van Rick, zijn geleerde focuspiek (afgeleid uit zijn echte slaapritme), zijn open taken/doelen, geleerde gedragspatronen en — alleen voor de eerstkomende dag — wat er nu echt openstaat (betalingen, mail, klantopvolging, Kyra).

Regels:
- Plan diep werk (kind "focus") zo veel mogelijk IN de opgegeven focuspiek.
- Overlap NOOIT met de bestaande afspraken die je per dag krijgt.
- Bouw een menselijk ritme: ochtendroutine, focus, pauzes, lunch, shallow werk (mail/klanten) in het middagdal, beweging, en een wind-down richting bedtijd.
- Verwerk ELKE gewoonte als een EIGEN kort blok (kind "routine") — bundel ze niet tot één generieke regel.
- Verschillende dagen mogen verschillende openstaande taken/doelen als focus nemen — herhaal niet elke dag exact hetzelfde diepe-werk-blok.
- De "nu openstaand" signalen (betalingen/mail/klant/Kyra) horen alleen bij de eerstkomende dag — verzin ze niet voor latere dagen.
- Weekenddagen lichter dan werkdagen: geen focusblokken, wel ruimte voor herstel.
- Elk blok: date (exact een van de gegeven datums), start en end als "HH:MM" (24u), title (kort, NL), domain (parkingyou|prjct|buurtkaart|personal|cross), kind (focus|routine|break|meal|admin|wind-down|personal), rationale (één korte NL zin: waarom hier).
- Realistisch: 5 tot 9 blokken per dag, geen blok korter dan 15 min of langer dan 3 uur.
- Verzin geen afspraken; plan alleen nieuwe blokken in de vrije ruimte.

Antwoord ALLEEN met een fenced \`\`\`json blok:
{"blocks":[{"date":"2026-07-04","start":"09:30","end":"11:00","title":"Diep werk: ...","domain":"prjct","kind":"focus","rationale":"..."}]}`

function buildPlanPrompt(dates: string[], ctx: PlannerContext): string {
  const bounds = dayBounds(ctx.sleep)
  const parts: string[] = []
  parts.push(
    ctx.sleep?.wakeMinutes != null || ctx.sleep?.bedMinutes != null
      ? `Geleerd ritme uit echte slaapdata: wakker rond ${bounds.dayStart}, focuspiek ${bounds.peakStart}–${bounds.peakEnd}, richting bedtijd ${bounds.dayEnd}.`
      : `Focuspiek (nog geen echte slaapdata, standaardvenster): ${bounds.peakStart}–${bounds.peakEnd}.`,
  )
  parts.push(
    ctx.habits.length
      ? `Routines/gewoontes (elk een eigen blok): ${ctx.habits.map((h) => h.name).join(', ')}.`
      : 'Routines/gewoontes: nog geen vastgelegd.',
  )
  const open = ctx.threads.filter((t) => t.status === 'open').slice(0, 8)
  if (open.length) parts.push(`Open taken (verdeel als focus over de dagen, niet allemaal op dezelfde dag): ${open.map((t) => `${t.title}${t.due ? ` (deadline ${fmtDate(t.due)})` : ''} [${t.domain}]`).join('; ')}`)
  if (ctx.goals.length) parts.push(`Doelen: ${ctx.goals.slice(0, 5).map((g) => `${g.title} [${g.domain}]`).join('; ')}`)

  const topPatterns = [...ctx.patterns].sort((a, b) => b.confidence - a.confidence).slice(0, 3)
  if (topPatterns.length) parts.push(`Geleerde patronen om rekening mee te houden: ${topPatterns.map((p) => p.text).join('; ')}`)

  const overdue = ctx.overduePayments ?? []
  const importantUnread = (ctx.emails ?? []).filter((e) => e.unread && classifyImportance(e) === 'high')
  const lapsedClients = (ctx.clients ?? []).filter((c) => clientHealth(c, dates[0]) === 'red')
  const dogOpen = (ctx.dogReminders ?? []).filter((r) => !r.done && r.due <= dates[0])
  const nowSignals: string[] = []
  if (overdue.length) nowSignals.push(`${overdue.length} betaling(en) te laat`)
  if (importantUnread.length) nowSignals.push(`${importantUnread.length} belangrijke mail(s) ongelezen`)
  if (lapsedClients.length) nowSignals.push(`opvolging nodig bij ${lapsedClients[0].name}`)
  if (dogOpen.length) nowSignals.push(`Kyra: ${dogOpen[0].title}`)
  if (nowSignals.length) parts.push(`Nu openstaand (alleen relevant voor ${dates[0]}): ${nowSignals.join('; ')}.`)

  parts.push('\nDagen en bestaande afspraken:')
  for (const date of dates) {
    const evs = ctx.events.filter((e) => e.date === date).sort((a, b) => a.start.localeCompare(b.start))
    const day = new Date(date + 'T00:00:00').toLocaleDateString('nl-NL', { weekday: 'long', timeZone: 'Europe/Amsterdam' })
    parts.push(
      `- ${date} (${day}): ${evs.length ? evs.map((e) => `${e.start}-${e.end} ${e.title}`).join('; ') : 'geen afspraken (helemaal vrij)'}`,
    )
  }
  return parts.join('\n')
}

/** Validate one brain block against the requested dates + fixed events, or null. */
function validateBlock(
  entry: unknown,
  dateSet: Set<string>,
  busyByDate: Map<string, [number, number][]>,
): PlanBlock | null {
  if (!entry || typeof entry !== 'object') return null
  const e = entry as Record<string, unknown>
  const date = String(e.date ?? '')
  if (!dateSet.has(date)) return null
  const start = String(e.start ?? '')
  const end = String(e.end ?? '')
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return null
  const s = toMin(start)
  const en = toMin(end)
  const dur = en - s
  if (dur < 15 || dur > 180) return null
  if (s < toMin('05:00') || en > toMin('24:00')) return null
  const busy = busyByDate.get(date) ?? []
  if (busy.some(([bs, be]) => overlaps(s, en, bs, be))) return null
  const title = String(e.title ?? '').trim().slice(0, 120)
  if (!title) return null
  const domainRaw = String(e.domain ?? 'personal')
  const domain = (DOMAINS as string[]).includes(domainRaw) ? (domainRaw as Domain) : 'personal'
  const kindRaw = String(e.kind ?? 'focus')
  const kind = (KINDS as string[]).includes(kindRaw) && kindRaw !== 'event' ? (kindRaw as PlanBlockKind) : 'focus'
  // Reserve the slot so later brain blocks can't overlap this one.
  busy.push([s, en])
  busyByDate.set(date, busy)
  return { id: planId(date, start), date, title, domain, start, end, rationale: String(e.rationale ?? '').trim().slice(0, 200), kind, source: 'ai', locked: false }
}

/** Ask the brain for a week plan. Returns null on any failure so the caller falls back. */
export async function generateAIPlan(dates: string[], ctx: PlannerContext): Promise<PlanBlock[] | null> {
  const raw = await askBrain(PLAN_SYSTEM, buildPlanPrompt(dates, ctx), { maxTokens: 1800, timeoutMs: 14000 })
  if (!raw) return null
  const parsed = parseBrainJson(raw)
  const list = parsed && Array.isArray((parsed as { blocks?: unknown }).blocks) ? (parsed as { blocks: unknown[] }).blocks : null
  if (!list) return null

  const dateSet = new Set(dates)
  const busyByDate = new Map<string, [number, number][]>()
  for (const date of dates) busyByDate.set(date, ctx.events.filter((e) => e.date === date).map((e) => [toMin(e.start), toMin(e.end)] as [number, number]))

  const out: PlanBlock[] = []
  for (const entry of list) {
    const b = validateBlock(entry, dateSet, busyByDate)
    if (b) out.push(b)
  }
  return out.length ? out.sort((a, b) => (a.date === b.date ? a.start.localeCompare(b.start) : a.date.localeCompare(b.date))) : null
}

/** Build the proposed plan for the given dates: brain first, rule-based fallback. */
export async function buildWeekPlan(dates: string[], ctx: PlannerContext): Promise<PlanBlock[]> {
  const ai = await generateAIPlan(dates, ctx)
  if (ai && ai.length) return ai
  return dates.flatMap((d, i) => ruleBasedDayPlan(d, ctx, i))
}

/** Today → the coming Sunday (inclusive), as ISO dates. Just today when it's Sunday. */
export function weekDates(fromIso: string): string[] {
  const base = new Date(fromIso + 'T00:00:00')
  const toSunday = (7 - base.getDay()) % 7 // getDay(): 0=Sun … 6=Sat
  const out: string[] = []
  for (let i = 0; i <= toSunday; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }
  return out
}
