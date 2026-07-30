// ── HEYRA · context registry ──────────────────────────────────────────────────
// The fix for "HEYRA can't see everything, it's all segmented": one
// declarative list of what's available, instead of buildMemorySnapshot(),
// buildSearchCard() and every domain agent each hand-writing their own
// separate list of which store fields to read. Adding a new data source HEYRA
// should know about is now one entry here, not an edit spread across three
// files hoping nobody forgets one — which is exactly how project_tasks and
// project_milestones stayed invisible to chat/search for as long as they did
// (see the 2026-07-29 data audit).
//
// Every agent already receives the FULL app store at the type level
// (`Store = ReturnType<typeof useStore.getState>`) — nothing technical stops
// any of them from reading any field. This registry doesn't add a new access
// mechanism; it's the one place that says what SHOULD be read, so that
// decision lives in one auditable list instead of nowhere in particular.
//
// Scope of this first wave: the snapshot (buildMemorySnapshot) and search
// (buildSearchCard) surfaces only. proposeAction()'s entity resolution
// (resolveEntity.ts) is NOT migrated here yet — project_tasks/project_
// milestones still can't be targeted by a chat-driven action beyond what
// log_project_activity's analyzeActivity() already resolves internally.
// That's a deliberate, separate follow-up, not an oversight.
//
// tier is REQUIRED on every entry (no default) so a new source can't quietly
// skip the privacy gate the way most non-braindump/interaction/summaries
// tables do today — get one wrong here and it simply never renders, rather
// than rendering unless someone remembers to add the check.

import type { useStore } from '../store'
import type { Domain } from '../types'
import { TODAY, daysBetween, fmtDate } from '../domains'

type Store = ReturnType<typeof useStore.getState>

export type ContextSurface = 'snapshot' | 'search'

/** One row this entry contributes to buildSearchCard()'s keyword match. cards.ts owns the actual scoring (matchScore) — this only declares WHAT to search, not HOW, so there's one scoring algorithm, not one per entry. */
export interface SearchableRow {
  id: string
  title: string
  domain: Domain
  kind: string
  detail?: string | null
  /** Fields matchScore() checks against. */
  matchFields: (string | null | undefined)[]
}

export interface ContextEntry {
  key: string
  tier: 'normaal' | 'geheim'
  surfaces: ContextSurface[]
  /**
   * Lines to fold into buildMemorySnapshot()'s always-on factual dump. `days`
   * is the same due-soon horizon buildMemorySnapshot() already takes (default
   * 7). Return [] when there's genuinely nothing worth surfacing right now —
   * never a placeholder or an empty section header.
   */
  snapshot?: (store: Store, days: number) => string[]
  /** Rows to feed into buildSearchCard()'s keyword match. */
  search?: (store: Store) => SearchableRow[]
}

function withinDays(date: string | null | undefined, days: number): boolean {
  if (!date) return false
  const d = daysBetween(TODAY, date)
  return d >= 0 && d <= days
}

/** Project name for a row that hangs off a project (task/milestone/invoice) — falls back rather than silently dropping the row when the parent project is somehow missing. */
function projectLabel(store: Store, projectId: string): { name: string; domain: Domain } {
  const p = store.projects.find((x) => x.id === projectId)
  return { name: p?.name ?? 'onbekend project', domain: p?.domain ?? 'cross' }
}

export const CONTEXT_REGISTRY: ContextEntry[] = [
  {
    key: 'threads',
    tier: 'normaal',
    surfaces: ['snapshot', 'search'],
    snapshot: (store, days) => {
      const open = store.threads.filter((t) => t.status === 'open')
      const soon = open.filter((t) => withinDays(t.due, days))
      const lines = [
        `Open loops (${open.length} totaal): ${
          open.slice(0, 10).map((t) => `${t.title}${t.due ? ` (due ${fmtDate(t.due)})` : ''}`).join('; ') || 'geen'
        }`,
      ]
      if (soon.length) lines.push(`Loops met deadline binnen ${days} dagen: ${soon.map((t) => `${t.title} — ${fmtDate(t.due!)}`).join('; ')}`)
      return lines
    },
    search: (store) =>
      store.threads.map((t) => ({
        id: t.id,
        title: t.title,
        domain: t.domain,
        kind: t.status === 'open' ? 'open taak' : 'afgeronde taak',
        detail: t.due ? `deadline ${t.due.slice(5)}` : null,
        matchFields: [t.title],
      })),
  },
  {
    key: 'projects',
    tier: 'normaal',
    surfaces: ['snapshot', 'search'],
    snapshot: (store) => {
      const live = store.projects.filter((p) => p.status !== 'done')
      return [
        `Lopende projecten (${live.length}): ${
          live.slice(0, 10).map((p) => `${p.name} (${p.status}${p.deadline ? `, deadline ${fmtDate(p.deadline)}` : ''})`).join('; ') || 'geen'
        }`,
      ]
    },
    search: (store) =>
      store.projects.map((p) => ({
        id: p.id,
        title: p.name,
        domain: p.domain,
        kind: 'project',
        detail: p.client,
        matchFields: [p.name, p.client],
      })),
  },
  {
    key: 'clients',
    tier: 'normaal',
    // NEW to the snapshot — previously only reachable via keyword search or
    // clientIntakeAgent's name-matching list, never part of the always-on
    // grounding chat/briefing/assistant actually read.
    surfaces: ['snapshot', 'search'],
    snapshot: (store) => {
      const active = store.clients.filter((c) => c.clientStatus && c.clientStatus !== 'Inactive' && c.clientStatus !== 'Past')
      if (!active.length) return []
      return [
        `Klanten (${active.length} actief/lead/prospect): ${
          active.slice(0, 10).map((c) => `${c.name}${c.clientStatus ? ` (${c.clientStatus})` : ''}`).join('; ')
        }`,
      ]
    },
    search: (store) =>
      store.clients.map((c) => ({
        id: c.id,
        title: c.name,
        domain: c.domain,
        kind: 'klant',
        detail: c.clientStatus ?? undefined,
        matchFields: [c.name],
      })),
  },
  {
    key: 'project_tasks',
    tier: 'normaal',
    // NEW — the exact gap behind the "Ik heb de nieuwe preview gestuurd naar
    // Kim" bug: chat grounding had no idea this table existed at all.
    surfaces: ['snapshot', 'search'],
    snapshot: (store) => {
      const open = store.projectTasks.filter((t) => !t.done)
      if (!open.length) return []
      const byProject = new Map<string, string[]>()
      for (const t of open) {
        const { name } = projectLabel(store, t.projectId)
        byProject.set(name, [...(byProject.get(name) ?? []), t.name])
      }
      const lines = [...byProject.entries()]
        .slice(0, 10)
        .map(([proj, names]) => `${proj}: ${names.slice(0, 6).join(', ')}`)
      return [`Open taken per project: ${lines.join('; ')}`]
    },
    search: (store) =>
      store.projectTasks.map((t) => {
        const { name, domain } = projectLabel(store, t.projectId)
        return {
          id: t.id,
          title: t.name,
          domain,
          kind: t.done ? 'afgeronde projecttaak' : 'open projecttaak',
          detail: name,
          matchFields: [t.name, name],
        }
      }),
  },
  {
    key: 'project_milestones',
    tier: 'normaal',
    // NEW — same gap as project_tasks, one level up.
    surfaces: ['snapshot', 'search'],
    snapshot: (store, days) => {
      const due = store.projectMilestones.filter((m) => !m.done && withinDays(m.dueDate, days))
      if (!due.length) return []
      return [
        `Projectmijlpalen binnen ${days} dagen: ${
          due.map((m) => `${m.title} (${projectLabel(store, m.projectId).name}) — ${fmtDate(m.dueDate!)}`).join('; ')
        }`,
      ]
    },
    search: (store) =>
      store.projectMilestones.map((m) => {
        const { name, domain } = projectLabel(store, m.projectId)
        return {
          id: m.id,
          title: m.title,
          domain,
          kind: 'projectmijlpaal',
          detail: name,
          matchFields: [m.title, name],
        }
      }),
  },
  {
    key: 'project_invoices',
    tier: 'normaal',
    // NEW to both surfaces — previously only reachable through invoice-
    // specific proposeAction kinds, invisible to the snapshot and to Zoeken.
    surfaces: ['snapshot', 'search'],
    snapshot: (store) => {
      const unpaid = store.projectInvoices.filter((i) => i.status !== 'paid')
      if (!unpaid.length) return []
      return [
        `Openstaande facturen: ${
          unpaid
            .slice(0, 10)
            .map((i) => `${i.number || 'factuur'} (${projectLabel(store, i.projectId).name}, €${i.amount}, ${i.status})`)
            .join('; ')
        }`,
      ]
    },
    search: (store) =>
      store.projectInvoices.map((i) => {
        const { name, domain } = projectLabel(store, i.projectId)
        return {
          id: i.id,
          title: i.number || 'factuur',
          domain,
          kind: 'factuur',
          detail: `${name} · ${i.status}`,
          matchFields: [i.number, i.note, name],
        }
      }),
  },
  {
    key: 'goals',
    tier: 'normaal',
    // NEW to the snapshot — North Star goals were invisible to every
    // conversational agent (only planner.ts's separate day-plan prompt read them).
    surfaces: ['snapshot', 'search'],
    snapshot: (store) => {
      if (!store.goals.length) return []
      return [
        `Noordster-doelen: ${
          store.goals.slice(0, 8).map((g) => `${g.title} (${g.current}/${g.target} ${g.metric}, deadline ${fmtDate(g.deadline)})`).join('; ')
        }`,
      ]
    },
    search: (store) =>
      store.goals.map((g) => ({
        id: g.id,
        title: g.title,
        domain: g.domain,
        kind: 'doel',
        detail: `${g.current}/${g.target} ${g.metric}`,
        matchFields: [g.title],
      })),
  },
  {
    key: 'person',
    tier: 'normaal',
    // NEW — personal (non-client) contacts had zero path into HEYRA: not the
    // snapshot, not search, not entity resolution. tier is per-row here
    // (Person.tier), unlike most other sources, so it's filtered per-row
    // rather than at the entry level.
    surfaces: ['snapshot', 'search'],
    snapshot: (store) => {
      const visible = store.people.filter((p) => p.tier !== 'geheim')
      if (!visible.length) return []
      return [`Persoonlijke contacten (${visible.length}): ${visible.slice(0, 10).map((p) => p.displayName).join(', ')}`]
    },
    search: (store) =>
      store.people
        .filter((p) => p.tier !== 'geheim')
        .map((p) => ({
          id: p.id,
          title: p.displayName,
          domain: 'personal' as Domain,
          kind: 'contact',
          detail: p.company ?? undefined,
          matchFields: [p.displayName, p.company],
        })),
  },
  {
    key: 'payments',
    tier: 'normaal',
    surfaces: ['snapshot', 'search'],
    snapshot: (store, days) => {
      const due = store.payments.filter((p) => p.status === 'open' && withinDays(p.due, days))
      if (!due.length) return []
      return [
        `Betalingen binnen ${days} dagen: ${
          due.map((p) => `${p.payee} €${p.amount} (${p.direction === 'incoming' ? 'te ontvangen' : 'te betalen'}, ${fmtDate(p.due!)})`).join('; ')
        }`,
      ]
    },
    search: (store) =>
      store.payments.map((p) => ({
        id: p.id,
        title: p.payee,
        domain: p.domain,
        kind: p.direction === 'incoming' ? 'te ontvangen' : 'te betalen',
        detail: `€${p.amount}`,
        matchFields: [p.payee],
      })),
  },
  {
    key: 'habits',
    tier: 'normaal',
    surfaces: ['snapshot'],
    snapshot: (store) => {
      if (!store.habits.length) return []
      const doneToday = store.habits.filter((h) => h.doneToday).length
      return [`Gewoontes: ${doneToday}/${store.habits.length} vandaag afgerond.`]
    },
  },
  {
    key: 'northstar_milestones',
    tier: 'normaal',
    // store.milestones (North Star sub-goals) — unchanged behavior, still
    // the not-yet-persisted data the redesign proposal flags separately
    // (§03); this migration doesn't touch that, only where the line renders from.
    surfaces: ['snapshot'],
    snapshot: (store, days) => {
      const due = store.milestones.filter((m) => !m.done && withinDays(m.due, days))
      if (!due.length) return []
      return [`Mijlpalen binnen ${days} dagen: ${due.map((m) => `${m.title} — ${fmtDate(m.due!)}`).join('; ')}`]
    },
  },
  {
    key: 'braindump_entries',
    tier: 'normaal', // tier='geheim' braindumps are already excluded server-side (search_memory); this client-side list applies the same filter for consistency
    surfaces: ['snapshot', 'search'],
    snapshot: (store) => {
      const ready = (store.braindumpEntries ?? []).filter((e) => e.status === 'ready' && (e.summary || e.title))
      if (!ready.length) return []
      return [
        `Recente braindumps (${ready.length}): ${
          ready.slice(0, 12).map((e) => `${e.title || e.summary}${e.tags.length ? ` [${e.tags.slice(0, 3).join(', ')}]` : ''}`).join('; ')
        }`,
      ]
    },
    search: (store) =>
      (store.braindumpEntries ?? [])
        .filter((b) => b.status === 'ready')
        .map((b) => ({
          id: b.id,
          title: b.title || b.summary || 'Notitie',
          domain: b.domain ?? ('cross' as Domain),
          kind: b.meta?.source === 'claude-export' ? 'claude-chat' : 'notitie',
          detail: b.meta?.source === 'claude-export' ? null : b.summary,
          matchFields: [b.title, b.summary, b.markdown, b.tags.join(' ')],
        })),
  },
]

/** Every registry snapshot line, in registry order — the always-on factual dump's registry-driven half (nudge/learnedFacts/profileFacts/meetingDays stay hand-written in memoryContext.ts, they don't fit this per-table shape). */
export function renderRegistrySnapshot(store: Store, days: number): string[] {
  const lines: string[] = []
  for (const entry of CONTEXT_REGISTRY) {
    if (entry.tier === 'geheim' || !entry.surfaces.includes('snapshot') || !entry.snapshot) continue
    lines.push(...entry.snapshot(store, days))
  }
  return lines
}

/** Every registry search row, unscored — buildSearchCard() (cards.ts) runs matchScore() over these plus its own non-registry sources (captured items). */
export function collectRegistrySearchRows(store: Store): SearchableRow[] {
  const rows: SearchableRow[] = []
  for (const entry of CONTEXT_REGISTRY) {
    if (entry.tier === 'geheim' || !entry.surfaces.includes('search') || !entry.search) continue
    rows.push(...entry.search(store))
  }
  return rows
}
