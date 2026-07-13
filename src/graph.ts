// ── The "second brain" graph: hierarchical hubs + a subtle cross-category web ─
// Top categories (WORK/MONEY/HEALTH/HABITS/GOALS/MIND) are the root hubs.
// Under them sit entity hubs (clients/people) and goal hubs; leaves are the
// individual records. Everything stays one memory, so cross-category links
// (e.g. a client whose project is WORK but whose invoice is MONEY) form the web.

import type {
  Domain,
  StructuredItem,
  Thread,
  Payment,
  Project,
  EmailItem,
  Pattern,
  Transaction,
  DayLog,
  Habit,
  Goal,
  Milestone,
} from './types'
import { TODAY, daysBetween } from './domains'
import { computeCorrelations } from './reflect'

export type CatId = 'work' | 'money' | 'health' | 'habits' | 'goals' | 'mind'
export type GFlag = 'overdue' | 'open' | 'stressed' | 'paid' | 'done' | null
export type BKind = 'category' | 'entity' | 'record'

export interface BNode {
  id: string
  kind: BKind
  recordType?: string
  label: string
  detail: string
  cat: CatId
  parent: string | null
  flag: GFlag
  hub: boolean // has children (filled in at the end)
}

export interface BEdge {
  id: string
  a: string
  b: string
  kind: 'parent' | 'cross'
}

export interface CatLink {
  a: CatId
  b: CatId
  weight: number
}

export interface GSuggestion {
  id: string
  title: string
  detail: string
  cat: CatId
  nodeIds: string[]
  tone: 'action' | 'insight' | 'watch'
}

export interface Brain {
  categories: { id: CatId; label: string }[]
  nodes: BNode[]
  edges: BEdge[]
  catLinks: CatLink[]
  suggestions: GSuggestion[]
}

export const CATEGORIES: { id: CatId; label: string }[] = [
  { id: 'work', label: 'WORK' },
  { id: 'money', label: 'MONEY' },
  { id: 'health', label: 'HEALTH' },
  { id: 'habits', label: 'HABITS' },
  { id: 'goals', label: 'GOALS' },
  { id: 'mind', label: 'MIND' },
]

const WORK_DOMAINS: Domain[] = ['prjct', 'parkingyou', 'buurtkaart']
const HEALTH_KW = /slaap|sleep|energie|energy|moe\b|tired|stap|step|walk|wandel|mood|stemming|hartslag|rust|gym|sport|workout/i
const MONEY_KW = /€|euro|spent|spend|invoice|factuur|betaal|betal|geld|kosten|uitgave|takeout|thuisbezorg|deposit/i

const STOP = new Set([
  'de', 'het', 'een', 'van', 'der', 'den', 'the', 'en', 'bv', 'bakkerij', 'cafe', 'café', 'kapsalon',
  'installaties', 'agency', 'restant', 'aanbetaling', 'jaar', 'annual', 'pro', 'creative', 'cloud',
  'website', 'logo', 'branding', 'factuur', 'kantoor', 'werkplek', 'hosting', 'domeinen', 'rick',
  'owed', 'marketing', 'partner', 'print', 'distro', 'vendor', 'safety', 'deposit', 'client', 'income',
  'software', 'groceries', 'takeout', 'convenience', 'q2', 'ops',
])
const tokensOf = (name: string | null | undefined): string[] =>
  (name ?? '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w))

// Intentionally not src/lib/format: graph labels drop the sign (absolute value),
// which no canonical formatter does — direction is carried by the label text.
const eur = (n: number) => `€${Math.round(Math.abs(n)).toLocaleString('nl-NL')}`
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

export function buildBrain(
  items: StructuredItem[],
  threads: Thread[],
  payments: Payment[],
  projects: Project[],
  emails: EmailItem[],
  patterns: Pattern[],
  transactions: Transaction[],
  dayLogs: DayLog[],
  habits: Habit[],
  goals: Goal[],
  milestones: Milestone[],
  healthDays: { date: string; steps: number; stepGoal: number; sleepHours: number; restingHR: number; energy: number }[],
): Brain {
  const nodes: BNode[] = []
  const search: Record<string, string> = {}
  const rec = (
    id: string,
    recordType: string,
    label: string,
    detail: string,
    cat: CatId,
    flag: GFlag,
    text: string,
  ) => {
    nodes.push({ id, kind: 'record', recordType, label, detail, cat, parent: `cat:${cat}`, flag, hub: false })
    search[id] = text.toLowerCase()
  }

  // categories
  CATEGORIES.forEach((c) =>
    nodes.push({ id: `cat:${c.id}`, kind: 'category', label: c.label, detail: '', cat: c.id, parent: null, flag: null, hub: true }),
  )

  // ── records ────────────────────────────────────────────────────────────────
  items.forEach((i) => {
    const t = `${i.text} ${i.summary}`
    const cat: CatId = HEALTH_KW.test(t) ? 'health' : MONEY_KW.test(t) ? 'money' : WORK_DOMAINS.includes(i.domain) ? 'work' : 'mind'
    rec(`capture:${i.id}`, 'capture', i.summary, `${i.kind} · ${i.sentiment}`, cat, i.sentiment === 'stressed' ? 'stressed' : null, t)
  })
  threads.forEach((t) => {
    const overdue = t.status === 'open' && t.due && daysBetween(t.due, TODAY) > 0
    const cat: CatId = WORK_DOMAINS.includes(t.domain) ? 'work' : HEALTH_KW.test(t.title) ? 'health' : 'mind'
    rec(`thread:${t.id}`, 'thread', t.title, `loop → ${t.owedTo}`, cat, t.status === 'closed' ? 'done' : overdue ? 'overdue' : 'open', `${t.title} ${t.owedTo}`)
  })
  payments.forEach((p) => {
    const overdue = p.status === 'open' && p.due && daysBetween(p.due, TODAY) > 0
    rec(`payment:${p.id}`, 'payment', p.payee, `${p.direction === 'incoming' ? 'te ontvangen' : 'te betalen'} ${eur(p.amount)}`, 'money', p.status === 'paid' ? 'paid' : overdue ? 'overdue' : 'open', p.payee)
  })
  projects.forEach((p) =>
    rec(`project:${p.id}`, 'project', p.name, `${p.client} · ${p.status}`, 'work', p.status === 'blocked' ? 'overdue' : p.status === 'done' ? 'done' : 'open', `${p.name} ${p.client}`),
  )
  emails.forEach((e) => {
    const cat: CatId = e.domain === 'personal' ? 'mind' : 'work'
    rec(`email:${e.id}`, 'email', e.subject, `mail · ${e.from}`, cat, e.unread ? 'open' : null, `${e.from} ${e.subject} ${e.snippet}`)
  })
  patterns.forEach((p) => {
    const cat: CatId = HEALTH_KW.test(p.text) ? 'health' : MONEY_KW.test(p.text) ? 'money' : 'work'
    rec(`pattern:${p.id}`, 'pattern', p.text, `patroon · ${Math.round(p.confidence * 100)}%`, cat, null, p.text)
  })
  habits.forEach((h) =>
    rec(`habit:${h.id}`, 'habit', h.name, `streak ${h.streak}`, 'habits', h.doneToday ? 'done' : 'open', h.name),
  )

  // money: aggregate transactions by category (avoid dozens of leaves)
  const txByCat = new Map<string, { sum: number; n: number }>()
  transactions.forEach((t) => {
    if (t.amount >= 0) return
    const e = txByCat.get(t.category) || { sum: 0, n: 0 }
    e.sum += Math.abs(t.amount)
    e.n++
    txByCat.set(t.category, e)
  })
  ;[...txByCat.entries()].forEach(([c, v]) =>
    rec(`txgroup:${c}`, 'txgroup', c, `${v.n}× · ${eur(v.sum)}`, 'money', null, c),
  )

  // health: a few summary metric nodes from healthDays
  if (healthDays.length) {
    rec('metric:sleep', 'metric', 'Slaap', `Ø ${avg(healthDays.map((h) => h.sleepHours)).toFixed(1)}u`, 'health', null, 'slaap sleep')
    rec('metric:steps', 'metric', 'Stappen', `Ø ${Math.round(avg(healthDays.map((h) => h.steps))).toLocaleString('nl-NL')}`, 'health', null, 'stappen steps')
    rec('metric:hr', 'metric', 'Rust-HR', `Ø ${Math.round(avg(healthDays.map((h) => h.restingHR)))} bpm`, 'health', null, 'hartslag rust')
  }

  // goals + milestones (goal acts as a hub for its milestones)
  goals.forEach((g) => {
    const pct = g.target > 0 ? Math.round((g.current / g.target) * 100) : 0
    nodes.push({ id: `goal:${g.id}`, kind: 'record', recordType: 'goal', label: g.title, detail: `${pct}%`, cat: 'goals', parent: 'cat:goals', flag: pct >= 100 ? 'done' : 'open', hub: false })
    search[`goal:${g.id}`] = g.title.toLowerCase()
  })
  milestones.forEach((m) => {
    nodes.push({ id: `ms:${m.id}`, kind: 'record', recordType: 'milestone', label: m.title, detail: m.done ? 'gehaald' : 'open', cat: 'goals', parent: m.goalId ? `goal:${m.goalId}` : 'cat:goals', flag: m.done ? 'done' : 'open', hub: false })
    search[`ms:${m.id}`] = m.title.toLowerCase()
  })

  // ── entity hubs (clients/people/merchants) ─────────────────────────────────
  interface Ent { name: string; tokens: Set<string> }
  const ents: Ent[] = []
  const addCandidate = (name: string) => {
    const toks = tokensOf(name)
    if (!toks.length) return
    const hit = ents.find((e) => toks.some((t) => e.tokens.has(t)))
    if (hit) {
      toks.forEach((t) => hit.tokens.add(t))
      if (name.length < hit.name.length) hit.name = name
    } else ents.push({ name, tokens: new Set(toks) })
  }
  projects.forEach((p) => addCandidate(p.client))
  payments.forEach((p) => addCandidate(p.payee))
  threads.forEach((t) => addCandidate(t.owedTo))
  emails.forEach((e) => addCandidate(e.from))

  const recordNodes = nodes.filter((n) => n.kind === 'record')
  const entLinks: Record<string, string[]> = {}
  ents.forEach((e) => (entLinks[e.name] = []))
  recordNodes.forEach((n) => {
    const txt = search[n.id]
    ents.forEach((e) => {
      if ([...e.tokens].some((t) => txt.includes(t))) entLinks[e.name].push(n.id)
    })
  })

  const edges: BEdge[] = []
  const catLinkMap = new Map<string, number>()
  const bumpCatLink = (a: CatId, b: CatId) => {
    if (a === b) return
    const key = [a, b].sort().join('|')
    catLinkMap.set(key, (catLinkMap.get(key) || 0) + 1)
  }

  const hubs = ents
    .filter((e) => entLinks[e.name].length >= 2)
    .sort((a, b) => entLinks[b.name].length - entLinks[a.name].length)

  const recCat = (id: string): CatId => nodes.find((n) => n.id === id)!.cat
  const reparented = new Set<string>()

  hubs.forEach((e, idx) => {
    const members = entLinks[e.name]
    // entity category = majority category of its members
    const counts: Record<string, number> = {}
    members.forEach((id) => (counts[recCat(id)] = (counts[recCat(id)] || 0) + 1))
    const cat = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] as CatId) || 'work'
    const eid = `entity:${idx}`
    nodes.push({ id: eid, kind: 'entity', label: e.name, detail: `${members.length} verbonden`, cat, parent: `cat:${cat}`, flag: null, hub: true })
    members.forEach((mid) => {
      if (!reparented.has(mid)) {
        const m = nodes.find((n) => n.id === mid)!
        m.parent = eid
        reparented.add(mid)
        if (m.cat !== cat) bumpCatLink(cat, m.cat) // cross-category web
      }
    })
  })

  // parent edges for everything with a parent
  nodes.forEach((n) => {
    if (n.parent) edges.push({ id: `${n.parent}__${n.id}`, a: n.parent, b: n.id, kind: 'parent' })
  })

  // mark hubs (anything that is a parent)
  const parents = new Set(nodes.map((n) => n.parent).filter(Boolean) as string[])
  nodes.forEach((n) => {
    if (parents.has(n.id)) n.hub = true
  })

  // correlation-driven cross links (health↔money, work↔money …)
  const corrs = computeCorrelations(dayLogs, transactions)
  corrs.forEach((c) => {
    const t = c.title.toLowerCase()
    const cats: CatId[] = []
    if (/slaap|sleep|energie|energy/.test(t)) cats.push('health')
    if (/spend|spent|uitgave|takeout|convenience|€/.test(t)) cats.push('money')
    if (/deadline|prjct|campaign/.test(t)) cats.push('work')
    for (let i = 0; i < cats.length; i++) for (let j = i + 1; j < cats.length; j++) bumpCatLink(cats[i], cats[j])
  })

  // topic-based cross links: connect nodes to a shared anchor across categories,
  // e.g. habit "no screens after 23:00" → health metric "sleep".
  const TOPICS: { re: RegExp; anchor: string }[] = [
    { re: /slaap|sleep|screen|scherm|\bbed\b|nacht|night|23:00|22:30|wind-?down/i, anchor: 'metric:sleep' },
    { re: /\bstap|\bstep|walk|wandel|\bgym\b|sport|beweg|hardloop|run\b/i, anchor: 'metric:steps' },
    { re: /spend|spent|uitgave|takeout|thuisbezorg|invoice|factuur|betaal|convenience/i, anchor: 'cat:money' },
  ]
  TOPICS.forEach((t) => {
    const anchor = nodes.find((n) => n.id === t.anchor)
    if (!anchor) return
    recordNodes.forEach((n) => {
      if (n.id === anchor.id || n.cat === anchor.cat) return
      if (t.re.test(search[n.id]) || t.re.test(n.label.toLowerCase())) {
        edges.push({ id: `cross:${n.id}__${anchor.id}`, a: n.id, b: anchor.id, kind: 'cross' })
        bumpCatLink(n.cat, anchor.cat)
      }
    })
  })

  const catLinks: CatLink[] = [...catLinkMap.entries()].map(([k, w]) => {
    const [a, b] = k.split('|') as [CatId, CatId]
    return { a, b, weight: w }
  })

  // ── suggestions ─────────────────────────────────────────────────────────────
  const suggestions: GSuggestion[] = []
  hubs.forEach((e) => {
    const ids = entLinks[e.name]
    const ns = ids.map((id) => nodes.find((n) => n.id === id)!)
    const types = new Set(ns.map((n) => n.recordType))
    const urgent = ns.filter((n) => n.flag === 'overdue' || n.flag === 'stressed')
    const cat = (ns[0]?.cat as CatId) || 'work'
    if (urgent.length >= 1 && types.size >= 2) {
      suggestions.push({ id: `sg-act-${e.name}`, title: `Pak ${e.name} op`, detail: `${ids.length} dingen hangen samen rond ${e.name}, waarvan ${urgent.length} urgent. Eén actie sluit meerdere loops.`, cat, nodeIds: ids, tone: 'action' })
    } else if (types.size >= 3) {
      suggestions.push({ id: `sg-ins-${e.name}`, title: `${e.name} is een knooppunt`, detail: `Raakt ${ids.length} records across je categorieën. De moeite om als één dossier te zien.`, cat, nodeIds: ids, tone: 'insight' })
    }
  })
  corrs.forEach((c) => {
    const ids = recordNodes.filter((n) => (c.title.toLowerCase().includes('slaap') || c.title.toLowerCase().includes('energ') ? n.cat === 'health' : n.cat === 'money')).slice(0, 5).map((n) => n.id)
    suggestions.push({ id: `sg-corr-${c.id}`, title: c.title, detail: c.detail, cat: 'health', nodeIds: ids, tone: 'insight' })
  })
  const toneRank = { action: 0, insight: 1, watch: 2 }
  suggestions.sort((a, b) => toneRank[a.tone] - toneRank[b.tone])

  return { categories: CATEGORIES, nodes, edges, catLinks, suggestions }
}
