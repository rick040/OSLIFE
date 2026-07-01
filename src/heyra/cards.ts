// ── HEYRA · dynamic card builders ────────────────────────────────────────────
// Once detectSkill() picks a non-task skill, these turn the raw text + store
// into the data a card component renders. Kept separate from skills.ts so the
// router stays about *routing* and this stays about *building the reply*.

import type { useStore } from '../store'
import type { Domain } from '../types'
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

const NOISE = [
  'zoek naar', 'zoeken naar', 'zoek op', 'zoek ', 'wat weet je over', 'wat heb ik over',
  'find ', 'search ', 'look up', 'opzoeken', 'wat staat er over', 'heb ik iets over',
]

function strip(text: string, phrases: string[]): string {
  let s = ` ${text.toLowerCase()} `
  for (const p of phrases) s = s.replace(p, ' ')
  return s.replace(/\s{2,}/g, ' ').trim()
}

/** Free-text search across threads, captured items, projects, clients and payments. */
export function buildSearchCard(text: string, store: Store): SearchCardData {
  const query = strip(text, NOISE)
  const needle = query.toLowerCase()
  const results: SearchResultItem[] = []

  if (needle) {
    for (const t of store.threads) {
      if (t.title.toLowerCase().includes(needle)) {
        results.push({ id: t.id, title: t.title, domain: t.domain, kind: t.status === 'open' ? 'open taak' : 'afgeronde taak', detail: t.due ? `deadline ${t.due.slice(5)}` : null })
      }
    }
    for (const p of store.projects) {
      if (p.name.toLowerCase().includes(needle) || p.client.toLowerCase().includes(needle)) {
        results.push({ id: p.id, title: p.name, domain: p.domain, kind: 'project', detail: p.client })
      }
    }
    for (const c of store.clients) {
      if (c.name.toLowerCase().includes(needle)) {
        results.push({ id: c.id, title: c.name, domain: c.domain, kind: 'klant', detail: c.clientStatus ?? undefined })
      }
    }
    for (const p of store.payments) {
      if (p.payee.toLowerCase().includes(needle)) {
        results.push({ id: p.id, title: p.payee, domain: p.domain, kind: p.direction === 'incoming' ? 'te ontvangen' : 'te betalen', detail: `€${p.amount}` })
      }
    }
    for (const it of store.items) {
      if (it.text.toLowerCase().includes(needle) || it.summary.toLowerCase().includes(needle)) {
        results.push({ id: it.id, title: it.summary, domain: it.domain, kind: it.kind })
      }
    }
  }

  return { query: query || text.trim(), results: results.slice(0, 8) }
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

/** Fuzzy-matches a project by name or client mentioned in the text. */
export function findProject(text: string, store: Store) {
  const t = text.toLowerCase()
  return store.projects.find((p) => t.includes(p.name.toLowerCase()) || t.includes(p.client.toLowerCase())) ?? null
}
