// ── Derive CRM inbox conversations from the synced Gmail mirror ────────────────
// gmail_messages already carries everything the Gmail sync (Apps Script) sends
// over every ~15 min: from address, subject, snippet and Gmail labels. The
// unified Berichten inbox reads this same table (via the `emails` store slice)
// and turns client correspondence into Message rows.
//
// Inclusion is driven by Gmail LABELS, not by guessing from the address:
//   - label "Rick - PRJCT Agency" → agency/client mail (channel 'email')
//   - label "fiverr-logged"       → Fiverr correspondence (channel 'fiverr')
// A labelled mail is client correspondence by definition, so it is shown even
// when we cannot pin it to a specific CRM client yet (grouped by sender). On
// top of that, unlabelled mail is still included when the sender STRONGLY
// matches a known client (exact email or a non-generic email/website domain).
//
// Attribution (which client + which project) is best-effort:
//   client  = exact email → email/website domain → (labelled only) sender name
//             or client-name-appearing-in-subject/snippet
//   project = the client's primary project (active-first), with a
//             "client name appears in the project name" fallback for Fiverr-style
//             projects that have no client link.
//
// These rows are read-only here: marking one read persists back to
// gmail_messages (via markEmailRead), never written into client_messages.
import type { Client, EmailItem, Message, Project, ProjectStatus } from '../../types'

export const PRJCT_LABEL = 'Rick - PRJCT Agency'
export const FIVERR_LABEL = 'fiverr-logged'

/** Prefer the client's active work when choosing their primary project. */
const STATUS_RANK: Record<ProjectStatus, number> = { active: 0, review: 1, lead: 2, blocked: 3, done: 4 }
const statusRank = (s: ProjectStatus): number => STATUS_RANK[s] ?? 5

export function extractSenderName(addr: string): string {
  if (!addr) return '(onbekend)'
  const m = addr.match(/^([^<]+?)\s*<.*>$/)
  if (m) return m[1].replace(/(^"|"$)/g, '').trim()
  const at = addr.indexOf('@')
  return at !== -1 ? addr.slice(0, at) : addr
}

function extractAddress(addr: string): string {
  const m = addr.match(/<([^>]+)>/)
  return (m ? m[1] : addr).trim().toLowerCase()
}

/** Free-provider domains that say nothing about which client a sender is. */
const GENERIC_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.nl', 'outlook.com', 'outlook.nl',
  'live.com', 'live.nl', 'yahoo.com', 'yahoo.co.uk', 'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'protonmail.com', 'proton.me', 'gmx.com', 'gmx.net',
  // common NL consumer ISPs
  'ziggo.nl', 'kpnmail.nl', 'telfort.nl', 'home.nl', 'planet.nl', 'hetnet.nl',
  'chello.nl', 'casema.nl', 'upcmail.nl', 'xs4all.nl', 'quicknet.nl', 'online.nl',
])

/** The domain of an email address ("jan@studio-x.nl" → "studio-x.nl"), or ''. */
function domainOfEmail(addr: string): string {
  const at = addr.lastIndexOf('@')
  return at !== -1 ? addr.slice(at + 1).trim().toLowerCase() : ''
}

/** The registrable-ish domain of a website URL ("https://www.studio-x.nl/x" → "studio-x.nl"). */
function domainOfWebsite(url: string): string {
  if (!url) return ''
  let s = url.trim().toLowerCase()
  s = s.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '')
  s = s.split(/[/?#]/)[0]
  return s
}

/** Normalise a name/company for loose comparison: lowercase, alnum tokens only. */
function normName(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()
}

export interface ClientProjectMatcher {
  /** Strong sender→client match (exact email / non-generic domain), or null. */
  strong(fromAddr: string): Client | null
  /** Weak sender→client match (display name / name in text) — use for labelled mail only. */
  weak(senderName: string, text: string): Client | null
  /** The client's primary project (active-first, with name-in-project-name fallback). */
  projectFor(clientId: string): { id: string; name: string } | null
}

/** Build the client/project lookup once per render, mirroring rick-os buildMatcher. */
export function buildMatcher(clients: Client[], projects: Project[]): ClientProjectMatcher {
  const byEmail = new Map<string, Client>()
  const byDomain = new Map<string, Client>()
  const named: { c: Client; key: string }[] = []

  for (const c of clients) {
    if (c.email) {
      const e = c.email.trim().toLowerCase()
      byEmail.set(e, c)
      const d = domainOfEmail(e)
      if (d && !GENERIC_DOMAINS.has(d) && !byDomain.has(d)) byDomain.set(d, c)
    }
    const wd = domainOfWebsite(c.website ?? '')
    if (wd && !GENERIC_DOMAINS.has(wd) && !byDomain.has(wd)) byDomain.set(wd, c)
    const n = normName(c.name)
    if (n.length >= 4) named.push({ c, key: n })
  }

  // client → primary project: prefer active work, then by status rank.
  const clientToProject = new Map<string, { id: string; name: string }>()
  const ranked = [...projects].sort((a, b) => statusRank(a.status) - statusRank(b.status))
  for (const p of ranked) {
    if (p.clientId && !clientToProject.has(p.clientId)) clientToProject.set(p.clientId, { id: p.id, name: p.name })
  }
  // fallback: link by client name appearing in the project name — Fiverr-imported
  // projects often have no client link ("Logo Design – studio x").
  for (const { c, key } of named) {
    if (clientToProject.has(c.id)) continue
    const p = ranked.find((p) => normName(p.name).includes(key))
    if (p) clientToProject.set(c.id, { id: p.id, name: p.name })
  }

  return {
    strong(fromAddr) {
      const exact = byEmail.get(fromAddr)
      if (exact) return exact
      const dom = domainOfEmail(fromAddr)
      if (dom && !GENERIC_DOMAINS.has(dom)) return byDomain.get(dom) ?? null
      return null
    },
    weak(senderName, text) {
      const sn = normName(senderName)
      if (sn.length >= 4) {
        for (const { c, key } of named) if (sn === key || sn.includes(key) || key.includes(sn)) return c
      }
      const hay = normName(text)
      if (hay) for (const { c, key } of named) if (hay.includes(key)) return c
      return null
    },
    projectFor(clientId) {
      return clientToProject.get(clientId) ?? null
    },
  }
}

/** Turn synced Gmail rows into unified-inbox Message entries for client/Fiverr correspondence. */
export function deriveGmailMessages(emails: EmailItem[], clients: Client[], projects: Project[] = []): Message[] {
  const matcher = buildMatcher(clients, projects)
  const out: Message[] = []

  for (const e of emails) {
    const labels = e.labels ?? []
    const fiverr = labels.includes(FIVERR_LABEL) || labels.some((l) => /fiverr/i.test(l))
    const labelled = fiverr || labels.includes(PRJCT_LABEL)
    const fromAddr = extractAddress(e.from)

    // Attribution: strong signals always; weak signals only when the label already
    // proved this is client correspondence (avoids weak matches on random mail).
    const text = `${e.subject ?? ''} ${e.snippet ?? ''}`
    const client = matcher.strong(fromAddr) ?? (labelled ? matcher.weak(extractSenderName(e.from), text) : null)

    // Inclusion gate: CRM-labelled mail, or a strong sender→client match.
    if (!labelled && !client) continue

    const proj = client ? matcher.projectFor(client.id) : null
    const channel = fiverr ? 'fiverr' : 'email'
    const contact = client ? client.name : fiverr ? 'Fiverr' : extractSenderName(e.from)
    const contactKey = client ? `cli:${client.id}` : fiverr ? 'fiverr:inbox' : `email:${fromAddr}`

    out.push({
      id: e.id,
      contact,
      contactKey,
      clientId: client?.id ?? null,
      projectId: proj?.id ?? null,
      projectName: proj?.name ?? null,
      channel,
      direction: 'in', // the Gmail sync only scans the inbox, never Sent
      subject: e.subject || null,
      snippet: e.snippet,
      body: null, // gmail_messages stores only a snippet, not the full body
      ts: e.receivedAt,
      unread: e.unread,
      source: fiverr ? 'fiverr' : 'gmail',
      externalId: e.id,
    })
  }
  return out
}
