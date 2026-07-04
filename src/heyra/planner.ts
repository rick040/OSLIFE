// ── HEYRA · day planner ───────────────────────────────────────────────────────
// Builds an optimal day plan for today + the rest of the week, planned AROUND
// what's fixed: your scheduled calendar events (day_blocks), your routines
// (habits) and your learned high-energy window. The brain proposes the blocks
// that fill the gaps (deep work in the peak, routines, breaks, wind-down); a
// rule-based planner is the fallback so a plan always appears even when the
// brain is unavailable. Nothing here writes anywhere — the store persists a
// block only when Rick locks it. Same honesty rule: plan around real data.

import type { PlanBlock, PlanBlockKind, Domain, Habit, Goal, Thread, Pattern } from '../types'
import { askBrain } from './brainClient'
import { parseBrainJson } from './brainJson'
import { fmtDate } from '../domains'

// The learned high-energy window — deep work is protected here (mirrors the
// banner that DayBuilder already showed).
export const PEAK_START = '09:30'
export const PEAK_END = '12:30'

const DAY_START = '06:00'
const DAY_END = '23:00'
const DOMAINS: Domain[] = ['parkingyou', 'prjct', 'buurtkaart', 'personal', 'cross']
const KINDS: PlanBlockKind[] = ['event', 'focus', 'routine', 'break', 'meal', 'admin', 'wind-down', 'personal']

export interface PlannerContext {
  /** Fixed blocks across the week the planner must not overlap: calendar events + already-locked blocks. */
  events: PlanBlock[]
  habits: Habit[]
  goals: Goal[]
  threads: Thread[]
  patterns: Pattern[]
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

// ── rule-based template ─────────────────────────────────────────────────────
interface TemplateItem {
  start: string
  end: string
  kind: PlanBlockKind
  title: string
  domain: Domain
  rationale: string
}

/** The single most pressing thing to aim the peak-hours focus block at. */
function focusTarget(ctx: PlannerContext): { title: string; domain: Domain } {
  const open = ctx.threads
    .filter((t) => t.status === 'open')
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
  if (open.length) return { title: `Diep werk: ${open[0].title}`, domain: open[0].domain }
  const goal = ctx.goals[0]
  if (goal) return { title: `Diep werk richting "${goal.title}"`, domain: goal.domain }
  return { title: 'Diep werk (belangrijkste taak)', domain: 'prjct' }
}

function weekdayTemplate(ctx: PlannerContext): TemplateItem[] {
  const focus = focusTarget(ctx)
  const hasHabits = ctx.habits.length > 0
  const items: TemplateItem[] = []
  if (hasHabits) {
    const names = ctx.habits.slice(0, 3).map((h) => h.name).join(', ')
    items.push({ start: '07:30', end: '08:00', kind: 'routine', title: 'Ochtendroutine', domain: 'personal', rationale: names ? `Ruimte voor je vaste routines: ${names}.` : 'Rustige start voor je routines.' })
  }
  items.push(
    { start: PEAK_START, end: '11:00', kind: 'focus', title: focus.title, domain: focus.domain, rationale: 'In je aangeleerde focuspiek (09:30–12:30) — hier landt diep werk het best.' },
    { start: '11:00', end: '11:15', kind: 'break', title: 'Korte pauze', domain: 'personal', rationale: 'Even loskomen houdt de tweede focusblok scherp.' },
    { start: '11:15', end: PEAK_END, kind: 'focus', title: 'Vervolg diep werk', domain: focus.domain, rationale: 'Tweede helft van de focuspiek benutten voordat de energie zakt.' },
    { start: '12:30', end: '13:15', kind: 'meal', title: 'Lunch', domain: 'personal', rationale: 'Echt pauzeren, niet doorwerken — beschermt de middag.' },
    { start: '15:00', end: '15:45', kind: 'admin', title: 'Klanten & mail', domain: 'prjct', rationale: 'Shallow werk in het natuurlijke energiedal van de middag.' },
    { start: '17:15', end: '18:00', kind: 'routine', title: 'Wandeling met Kyra', domain: 'personal', rationale: 'Beweging + de hond uit — koppelt werk los van de avond.' },
    { start: '21:30', end: '22:00', kind: 'wind-down', title: 'Wind-down', domain: 'personal', rationale: 'Schermen uit en tot rust komen om de slaap van morgen te beschermen.' },
  )
  return items
}

function weekendTemplate(ctx: PlannerContext): TemplateItem[] {
  const items: TemplateItem[] = []
  if (ctx.habits.length) items.push({ start: '09:00', end: '09:30', kind: 'routine', title: 'Ochtendroutine', domain: 'personal', rationale: 'Ook in het weekend je routines vasthouden — dat draagt de week.' })
  items.push(
    { start: '11:00', end: '12:00', kind: 'routine', title: 'Lange wandeling met Kyra', domain: 'personal', rationale: 'Meer tijd voor beweging nu de agenda rustiger is.' },
    { start: '14:00', end: '16:00', kind: 'personal', title: 'Persoonlijke tijd', domain: 'personal', rationale: 'Bewust vrije ruimte — herstel is onderdeel van het plan.' },
    { start: '22:00', end: '22:30', kind: 'wind-down', title: 'Wind-down', domain: 'personal', rationale: 'Vaste afsluiting houdt je ritme stabiel.' },
  )
  return items
}

function isWeekend(date: string): boolean {
  const day = new Date(date + 'T00:00:00').getDay()
  return day === 0 || day === 6
}

/** Rule-based proposed blocks for one date, placed only where the day is free. */
export function ruleBasedDayPlan(date: string, ctx: PlannerContext): PlanBlock[] {
  const busy: [number, number][] = ctx.events.filter((e) => e.date === date).map((e) => [toMin(e.start), toMin(e.end)])
  const template = isWeekend(date) ? weekendTemplate(ctx) : weekdayTemplate(ctx)
  const out: PlanBlock[] = []
  for (const t of template) {
    const s = toMin(t.start)
    const e = toMin(t.end)
    if (e <= s || s < toMin(DAY_START) || e > toMin(DAY_END)) continue
    if (busy.some(([bs, be]) => overlaps(s, e, bs, be))) continue
    busy.push([s, e])
    out.push({ id: planId(date, t.start), date, title: t.title, domain: t.domain, start: t.start, end: t.end, rationale: t.rationale, kind: t.kind, source: 'rule', locked: false })
  }
  return out.sort((a, b) => a.start.localeCompare(b.start))
}

// ── brain planner ─────────────────────────────────────────────────────────────
const PLAN_SYSTEM = `Je bent de dagplanner van HEYRA (OSLIFE). Je maakt een optimaal dagplan voor meerdere dagen, gepland ROND de vaste afspraken. Je krijgt per dag de bestaande agenda-afspraken (vast, niet verplaatsen), de routines/gewoontes van Rick, zijn aangeleerde focuspiek en zijn open taken en doelen.

Regels:
- Plan diep werk (kind "focus") zo veel mogelijk IN de focuspiek 09:30–12:30.
- Overlap NOOIT met de bestaande afspraken die je per dag krijgt.
- Bouw een menselijk ritme: ochtendroutine, focus, pauzes, lunch, shallow werk (mail/klanten) in het middagdal, beweging, en een wind-down 's avonds.
- Verwerk de routines/gewoontes als eigen blokken (kind "routine").
- Weekenddagen lichter dan werkdagen.
- Elk blok: date (exact een van de gegeven datums), start en end als "HH:MM" (24u), title (kort, NL), domain (parkingyou|prjct|buurtkaart|personal|cross), kind (focus|routine|break|meal|admin|wind-down|personal), rationale (één korte NL zin: waarom hier).
- Realistisch: 4 tot 7 blokken per dag, geen blok korter dan 15 min of langer dan 3 uur.
- Verzin geen afspraken; plan alleen nieuwe blokken in de vrije ruimte.

Antwoord ALLEEN met een fenced \`\`\`json blok:
{"blocks":[{"date":"2026-07-04","start":"09:30","end":"11:00","title":"Diep werk: ...","domain":"prjct","kind":"focus","rationale":"..."}]}`

function buildPlanPrompt(dates: string[], ctx: PlannerContext): string {
  const parts: string[] = []
  parts.push(`Focuspiek (hoog-energie venster): ${PEAK_START}–${PEAK_END}.`)
  parts.push(
    ctx.habits.length
      ? `Routines/gewoontes: ${ctx.habits.map((h) => h.name).join(', ')}.`
      : 'Routines/gewoontes: nog geen vastgelegd.',
  )
  const open = ctx.threads.filter((t) => t.status === 'open').slice(0, 8)
  if (open.length) parts.push(`Open taken (belangrijk voor de focusblokken): ${open.map((t) => `${t.title}${t.due ? ` (deadline ${fmtDate(t.due)})` : ''} [${t.domain}]`).join('; ')}`)
  if (ctx.goals.length) parts.push(`Doelen: ${ctx.goals.slice(0, 5).map((g) => `${g.title} [${g.domain}]`).join('; ')}`)

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
  if (s < toMin(DAY_START) || en > toMin(DAY_END)) return null
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
  const raw = await askBrain(PLAN_SYSTEM, buildPlanPrompt(dates, ctx), { maxTokens: 1600, timeoutMs: 14000 })
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
  return dates.flatMap((d) => ruleBasedDayPlan(d, ctx))
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
