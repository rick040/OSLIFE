// ── Derive CRM inbox conversations from the synced Gmail mirror ────────────────
// gmail_messages already carries everything Gmail sends over (Apps Script
// syncGmail, every ~15 min): from address, subject, snippet and Gmail labels.
// Rather than a separate ingestion pipeline, the unified Berichten inbox reads
// this same table (via the `emails` store slice) and classifies each row into
// a channel:
//   - a Gmail label matching /fiverr/i              → channel 'fiverr'
//   - sender address matches a known client's email  → channel 'email'
// Anything else (personal mail, newsletters, ...) is left out of the CRM inbox
// on purpose — it isn't client correspondence. These rows are read-only here:
// marking one read persists back to gmail_messages (via markEmailRead), never
// written into client_messages.
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

/** Turn synced Gmail rows into unified-inbox Message entries for client/Fiverr correspondence. */
export function deriveGmailMessages(emails: EmailItem[], clients: Client[]): Message[] {
  const clientByEmail = new Map<string, Client>()
  for (const c of clients) if (c.email) clientByEmail.set(c.email.trim().toLowerCase(), c)

  const out: Message[] = []
  for (const e of emails) {
    const fromAddr = extractAddress(e.from)
    const fiverr = (e.labels ?? []).some((l) => /fiverr/i.test(l))
    const client = clientByEmail.get(fromAddr)
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
