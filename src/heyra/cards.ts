// ── HEYRA · dynamic card builders ────────────────────────────────────────────
// Once detectSkill() picks a non-task skill, these turn the raw text + store
// into the data a card component renders. Kept separate from skills.ts so the
// router stays about *routing* and this stays about *building the reply*.

import type { useStore } from '../store'
import type { Domain, Channel } from '../types'
import { DOMAIN_META, TODAY } from '../domains'

type Store = ReturnType<typeof useStore.getState>

export interface SearchResultItem {
  id: string
  title: string
  domain: Domain
  kind: string
  detail?: string | null
}

export interface SearchCardData {
  query: string
  results: SearchResultItem[]
}

export interface ChartPoint {
  label: string
  value: number
}

export interface ChartCardData {
  title: string
  unit?: string
  kind: 'bar' | 'line'
  points: ChartPoint[]
}

/** HEYRA Klant-intake draft — a parsed, editable client message before any CRM write happens. */
export interface ClientIntakeDraft {
  sourceText: string // the original pasted message, kept for the communication-log entry
  language: 'nl' | 'en'
  clientName: string
  email: string | null
  matchedClientId: string | null // set when it resolved to an existing store.clients row
  projectType: string[]
  budgetGuess: number | null
  deadlineGuess: string | null // ISO date, best-effort
  deliverables: string[]
  reply: string
  channelGuess: Channel
  fromBrain: boolean
}

const NOISE_PHRASES = [
  'zoek naar', 'zoeken naar', 'zoek op', 'zoek ', 'wat weet je over', 'wat heb ik over',
  'find ', 'search ', 'look up', 'opzoeken', 'wat staat er over', 'heb ik iets over',
]

// Connector words that are almost never the thing you're actually searching
// for — left in, they either dilute a substring match ("mijn klant leverage"
// never appears literally anywhere) or, worse, matched everything once one
// of the stripped fields turned out empty (e.g. `t.includes('')` is true for
// any project with no client set). Tokenizing + filtering these out fixes both.
const STOPWORDS = new Set([
  'mijn', 'je', 'jouw', 'de', 'het', 'een', 'over', 'naar', 'aan', 'voor', 'van', 'bij',
  'met', 'wat', 'is', 'er', 'op', 'in', 'en', 'of', 'staat', 'heb', 'ik', 'nog', 'the', 'my',
])

function extractKeywords(text: string): string[] {
  let s = ` ${text.toLowerCase()} `
  for (const p of NOISE_PHRASES) s = s.split(p).join(' ')
  return s
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
}

function matchScore(keywords: string[], ...fields: (string | null | undefined)[]): number {
  const hay = fields.filter(Boolean).join(' ').toLowerCase()
  if (!hay) return 0
  return keywords.reduce((n, k) => n + (hay.includes(k) ? 1 : 0), 0)
}

/** Free-text search across threads, captured items, projects, clients and payments. */
export function buildSearchCard(text: string, store: Store): SearchCardData {
  const keywords = extractKeywords(text)
  const query = keywords.join(' ') || text.trim()
  const scored: { item: SearchResultItem; score: number }[] = []

  if (keywords.length) {
    for (const t of store.threads) {
      const score = matchScore(keywords, t.title)
      if (score > 0) scored.push({ score, item: { id: t.id, title: t.title, domain: t.domain, kind: t.status === 'open' ? 'open taak' : 'afgeronde taak', detail: t.due ? `deadline ${t.due.slice(5)}` : null } })
    }
    for (const p of store.projects) {
      const score = matchScore(keywords, p.name, p.client)
      if (score > 0) scored.push({ score, item: { id: p.id, title: p.name, domain: p.domain, kind: 'project', detail: p.client } })
    }
    for (const c of store.clients) {
      const score = matchScore(keywords, c.name)
      if (score > 0) scored.push({ score, item: { id: c.id, title: c.name, domain: c.domain, kind: 'klant', detail: c.clientStatus ?? undefined } })
    }
    for (const p of store.payments) {
      const score = matchScore(keywords, p.payee)
      if (score > 0) scored.push({ score, item: { id: p.id, title: p.payee, domain: p.domain, kind: p.direction === 'incoming' ? 'te ontvangen' : 'te betalen', detail: `€${p.amount}` } })
    }
    for (const it of store.items) {
      const score = matchScore(keywords, it.text, it.summary)
      if (score > 0) scored.push({ score, item: { id: it.id, title: it.summary, domain: it.domain, kind: it.kind } })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  return { query, results: scored.slice(0, 8).map((s) => s.item) }
}

function isoDaysAgo(n: number): string {
  const d = new Date(TODAY + 'T00:00:00')
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}
const last7 = Array.from({ length: 7 }, (_, i) => isoDaysAgo(6 - i))

/** Picks the metric that best matches the question and renders it as points. */
export function buildChartCard(text: string, store: Store): ChartCardData {
  const t = text.toLowerCase()

  if (/geld|uitgaven|spend|financ|kosten/.test(t)) {
    const points = last7.map((iso) => ({
      label: iso.slice(5),
      value: Math.round(store.transactions.filter((tx) => tx.date === iso && tx.amount < 0).reduce((a, tx) => a + Math.abs(tx.amount), 0)),
    }))
    return { title: 'Uitgaven per dag (7d)', unit: '€', kind: 'bar', points }
  }

  if (/energie|slaap|energy|sleep|moe/.test(t)) {
    const points = store.dayLogs.slice(-7).map((d) => ({ label: d.date.slice(5), value: d.energy }))
    return { title: 'Energie per dag (7d)', unit: '/5', kind: 'line', points }
  }

  if (/stap|steps|beweg/.test(t)) {
    const points = store.healthDays.slice(-7).map((d) => ({ label: d.date.slice(5), value: d.steps }))
    return { title: 'Stappen per dag (7d)', unit: 'stappen', kind: 'bar', points }
  }

  if (/gewoonte|habit|streak/.test(t)) {
    const points = store.habits.map((h) => ({ label: h.name, value: h.streak }))
    return { title: 'Streak per gewoonte', unit: 'dagen', kind: 'bar', points }
  }

  // Default: open loops per domain — always has data to show.
  const domains: Domain[] = ['parkingyou', 'prjct', 'buurtkaart', 'personal', 'cross']
  const points = domains
    .map((d) => ({ label: DOMAIN_META[d].label, value: store.threads.filter((th) => th.domain === d && th.status === 'open').length }))
    .filter((p) => p.value > 0)
  return { title: 'Open taken per domein', kind: 'bar', points }
}

/**
 * Fuzzy-matches a project by name or client mentioned in the text. Requires a
 * non-trivial (3+ char) name/client so an empty or very short field can't
 * match every message via `"...".includes('')`.
 */
export function findProject(text: string, store: Store) {
  const t = text.toLowerCase()
  return (
    store.projects.find((p) => {
      const name = p.name.trim().toLowerCase()
      const client = p.client.trim().toLowerCase()
      return (name.length >= 3 && t.includes(name)) || (client.length >= 3 && t.includes(client))
    }) ?? null
  )
}
