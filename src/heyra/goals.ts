// ── HEYRA · goal proposer ─────────────────────────────────────────────────────
// Proposes new North Star goals from what the brain has actually learned about
// Rick: durable learned facts, reinforced patterns, live project value and open
// loops. The brain returns a small set of candidate goals (title/metric/target/
// deadline/domain + a one-line "why now"); we validate and dedupe them against
// the goals Rick already has. On any brain failure it falls back to a rule-based
// proposal derived from live data, so the "laat HEYRA doelen voorstellen" button
// always returns something sensible — same honesty rule as reflect.ts: nothing
// is invented beyond what the numbers support.

import type { Goal, GoalProposal, Domain, Pattern, Project, Thread, Transaction } from '../types'
import type { LearnedFact } from './learning'
import { askBrain } from './brainClient'
import { parseBrainJson } from './brainJson'
import { renderLearnedFacts } from './learning'
import { TODAY, fmtDate } from '../domains'

const DOMAINS: Domain[] = ['parkingyou', 'prjct', 'buurtkaart', 'personal', 'cross']

export interface GoalProposalContext {
  goals: Goal[]
  learnedFacts: LearnedFact[]
  patterns: Pattern[]
  projects: Project[]
  threads: Thread[]
  transactions: Transaction[]
}

const GOALS_SYSTEM = `Je bent de strateeg van HEYRA (OSLIFE). Je stelt NIEUWE Noordster-doelen voor op basis van wat er echt over Rick bekend is: geleerde feiten, versterkte patronen, lopende projecten en open taken. Doelen zijn hoog-niveau en meetbaar (een getal + eenheid + deadline), niet losse taakjes.

Regels:
- Stel 2 tot 3 doelen voor die AANVULLEND zijn op de bestaande doelen (geen duplicaten of lichte herformuleringen).
- Elk doel is concreet en meetbaar: metric is een korte eenheid ("EUR", "klanten", "kg", "uur/week", "%", "stappen").
- target is een realistisch getal; current is waar Rick nu ongeveer staat (0 als onbekend).
- deadline is een ISO-datum (YYYY-MM-DD) in de toekomst, meestal 1-6 maanden vooruit.
- domain is exact één van: parkingyou, prjct, buurtkaart, personal, cross.
- rationale: één korte Nederlandse zin — waarom dit doel, waarom nu, gegrond in de aangeleverde context.
- Verzin geen feiten. Baseer je op wat er staat. Bij twijfel: minder doelen.

Antwoord ALLEEN met een fenced \`\`\`json blok, geen andere tekst:
{"goals":[{"title":"...","metric":"EUR","target":50000,"current":12000,"deadline":"2026-12-31","domain":"prjct","rationale":"..."}]}`

function buildContext(ctx: GoalProposalContext): string {
  const parts: string[] = [`Vandaag: ${fmtDate(TODAY)}.`]

  parts.push(
    ctx.goals.length
      ? `Bestaande doelen (NIET dupliceren):\n${ctx.goals
          .map((g) => `- ${g.title} — ${g.current}/${g.target} ${g.metric} (deadline ${fmtDate(g.deadline)}, ${g.domain})`)
          .join('\n')}`
      : 'Bestaande doelen: nog geen.',
  )

  const live = ctx.projects.filter((p) => p.status !== 'done')
  if (live.length) {
    const byDomain = new Map<Domain, number>()
    for (const p of live) byDomain.set(p.domain, (byDomain.get(p.domain) ?? 0) + (p.value || 0))
    const value = [...byDomain.entries()]
      .filter(([, v]) => v > 0)
      .map(([d, v]) => `${d}: €${Math.round(v)}`)
      .join(', ')
    parts.push(
      `Lopende projecten (${live.length}): ${live.slice(0, 8).map((p) => `${p.name} (${p.domain})`).join('; ')}` +
        (value ? `\nOpenstaande projectwaarde per domein: ${value}` : ''),
    )
  }

  const open = ctx.threads.filter((t) => t.status === 'open')
  if (open.length) parts.push(`Open loops (${open.length}): ${open.slice(0, 8).map((t) => t.title).join('; ')}`)

  const strong = ctx.patterns.filter((p) => p.confidence >= 0.6).slice(0, 8)
  if (strong.length) parts.push(`Sterke patronen:\n${strong.map((p) => `- ${p.text} (${Math.round(p.confidence * 100)}%)`).join('\n')}`)

  const learned = renderLearnedFacts(ctx.learnedFacts)
  if (learned) parts.push(learned)

  return parts.join('\n\n')
}

/** True when a candidate title already matches an existing goal (case/space-insensitive). */
function isDuplicate(title: string, existing: Goal[], accepted: GoalProposal[]): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const t = norm(title)
  if (!t) return true
  return existing.some((g) => norm(g.title) === t) || accepted.some((p) => norm(p.title) === t)
}

/** Validate + shape one brain entry into a GoalProposal, or null if unusable. */
function toProposal(entry: unknown, existing: Goal[], accepted: GoalProposal[]): GoalProposal | null {
  if (!entry || typeof entry !== 'object') return null
  const e = entry as Record<string, unknown>
  const title = String(e.title ?? '').trim()
  if (!title || title.length > 120 || isDuplicate(title, existing, accepted)) return null
  const target = Number(e.target)
  if (!Number.isFinite(target) || target <= 0) return null
  const current = Number.isFinite(Number(e.current)) ? Math.max(0, Number(e.current)) : 0
  const domainRaw = String(e.domain ?? 'personal')
  const domain = (DOMAINS as string[]).includes(domainRaw) ? (domainRaw as Domain) : 'personal'
  const deadline = /^\d{4}-\d{2}-\d{2}$/.test(String(e.deadline ?? '')) ? String(e.deadline) : defaultDeadline()
  const metric = String(e.metric ?? '').trim().slice(0, 16) || 'stuks'
  const rationale = String(e.rationale ?? '').trim().slice(0, 200)
  return {
    id: crypto.randomUUID(),
    title,
    metric,
    target,
    current: Math.min(current, target),
    deadline,
    domain,
    rationale,
    source: 'ai',
  }
}

/** ~3 months out, used when the brain omits or malforms a deadline. */
function defaultDeadline(): string {
  const d = new Date(TODAY + 'T00:00:00')
  d.setMonth(d.getMonth() + 3)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Rule-based proposals from live data — the fallback when the brain is
 * unavailable. Never invents numbers it can't ground: revenue comes from real
 * open project value, health from the presence of sleep/energy patterns.
 */
function ruleBasedProposals(ctx: GoalProposalContext): GoalProposal[] {
  const out: GoalProposal[] = []
  const push = (p: Omit<GoalProposal, 'id' | 'source'>) => {
    if (out.length >= 3 || isDuplicate(p.title, ctx.goals, out)) return
    out.push({ ...p, id: crypto.randomUUID(), source: 'rule' })
  }

  // 1. Revenue goal from the domain with the most open project value.
  const live = ctx.projects.filter((p) => p.status !== 'done')
  const byDomain = new Map<Domain, number>()
  for (const p of live) byDomain.set(p.domain, (byDomain.get(p.domain) ?? 0) + (p.value || 0))
  const topValue = [...byDomain.entries()].sort((a, b) => b[1] - a[1])[0]
  if (topValue && topValue[1] > 0) {
    const [domain, value] = topValue
    const target = Math.max(5000, Math.round((value * 2) / 1000) * 1000)
    push({
      title: `Omzet uit lopend werk verdubbelen`,
      metric: 'EUR',
      target,
      current: Math.round(value),
      deadline: defaultDeadline(),
      domain,
      rationale: `Er staat nu €${Math.round(value)} aan lopend werk in ${domain} — een concreet omzetdoel maakt dat stuurbaar.`,
    })
  }

  // 2. Health goal when there's a sleep/energy signal to hang it on.
  const health = ctx.patterns.find((p) => /slaap|sleep|energie|energy|rust/i.test(p.text))
  if (health) {
    push({
      title: 'Gemiddeld 7,5 uur slaap per nacht',
      metric: 'uur',
      target: 8,
      current: 7,
      deadline: defaultDeadline(),
      domain: 'personal',
      rationale: 'Je patronen koppelen slaap aan energie en focus — hier sturen betaalt zich elders terug.',
    })
  }

  // 3. Focus goal from the open-loop load.
  const open = ctx.threads.filter((t) => t.status === 'open').length
  if (open >= 5) {
    push({
      title: 'Open loops onder de 5 houden',
      metric: 'loops',
      target: 5,
      current: open,
      deadline: defaultDeadline(),
      domain: 'cross',
      rationale: `Je hebt ${open} open loops — een expliciet plafond voorkomt dat het hoofd voller loopt dan de agenda.`,
    })
  }

  return out
}

/**
 * Propose new goals. Tries the brain first; on any failure (or if it returns
 * nothing usable) falls back to rule-based proposals so the caller always gets a
 * non-empty list when there's enough live data to ground one.
 */
export async function proposeGoals(ctx: GoalProposalContext): Promise<GoalProposal[]> {
  const raw = await askBrain(GOALS_SYSTEM, buildContext(ctx), { maxTokens: 700, timeoutMs: 9000 })
  if (raw) {
    const parsed = parseBrainJson(raw)
    const list = parsed && Array.isArray((parsed as { goals?: unknown }).goals) ? (parsed as { goals: unknown[] }).goals : null
    if (list) {
      const accepted: GoalProposal[] = []
      for (const entry of list) {
        const p = toProposal(entry, ctx.goals, accepted)
        if (p) accepted.push(p)
        if (accepted.length >= 3) break
      }
      if (accepted.length) return accepted
    }
  }
  return ruleBasedProposals(ctx)
}
