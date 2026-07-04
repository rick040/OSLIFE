// ── Derive CRM inbox conversations from the synced Gmail mirror ────────────────
// gmail_messages already carries everything Gmail sends over (Apps Script
// syncGmail, every ~15 min): from address, subject, snippet and Gmail labels.
// Rather than a separate ingestion pipeline, the unified Berichten inbox reads
// this same table (via the `emails` store slice) and classifies each row into
// a channel:
//   - a Gmail label matching /fiverr/i               → channel 'fiverr'
//   - sender that resolves to a known client         → channel 'email'
// A sender resolves to a client by, in order: exact email address, a matching
// (non-generic) email/website domain, or a matching display name. Anything that
// resolves to neither a client nor Fiverr is personal mail / newsletters and is
// left out of the CRM inbox on purpose. These rows are read-only here: marking
// one read persists back to gmail_messages (via markEmailRead), never written
// into client_messages.
import type { Client, EmailItem, Message } from '../../types'

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

/** Turn synced Gmail rows into unified-inbox Message entries for client/Fiverr correspondence. */
export function deriveGmailMessages(emails: EmailItem[], clients: Client[]): Message[] {
  const byEmail = new Map<string, Client>()
  const byDomain = new Map<string, Client>()
  const byName = new Map<string, Client>()

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
    // Only index names with real signal (≥4 chars) to avoid matching initials.
    if (n.length >= 4 && !byName.has(n)) byName.set(n, c)
  }

  /** Resolve a Gmail sender to a client via email → domain → name, or null. */
  function resolveClient(fromAddr: string, senderName: string): Client | null {
    const exact = byEmail.get(fromAddr)
    if (exact) return exact
    const dom = domainOfEmail(fromAddr)
    if (dom && !GENERIC_DOMAINS.has(dom)) {
      const byDom = byDomain.get(dom)
      if (byDom) return byDom
    }
    const sn = normName(senderName)
    if (sn.length >= 4) {
      const nameHit = byName.get(sn)
      if (nameHit) return nameHit
      // loose containment for company-style names ("Studio X" ⊂ "Studio X Amsterdam")
      for (const [n, c] of byName) {
        if (n.length >= 4 && (sn.includes(n) || n.includes(sn))) return c
      }
    }
    return null
  }

  const out: Message[] = []
  for (const e of emails) {
    const fromAddr = extractAddress(e.from)
    const fiverr = (e.labels ?? []).some((l) => /fiverr/i.test(l))
    const client = fiverr ? null : resolveClient(fromAddr, extractSenderName(e.from))
    if (!fiverr && !client) continue // not client correspondence — skip

    out.push({
      id: e.id,
      contact: fiverr ? 'Fiverr' : client!.name,
      contactKey: fiverr ? 'fiverr:inbox' : `cli:${client!.id}`,
      clientId: fiverr ? null : client!.id,
      projectId: null,
      projectName: null,
      channel: fiverr ? 'fiverr' : 'email',
      direction: 'in', // syncGmail only scans the inbox, never Sent
      subject: e.subject || null,
      snippet: e.snippet,
      body: null, // gmail_messages doesn't store the full body, only a snippet
      ts: e.receivedAt,
      unread: e.unread,
      source: fiverr ? 'fiverr' : 'gmail',
      externalId: e.id,
    })
  }
  return out
}
