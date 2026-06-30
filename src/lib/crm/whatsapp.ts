// ── WhatsApp export parser ────────────────────────────────────────────────────
// Parses the plain-text export WhatsApp produces ("Export chat → Without media")
// into message drafts. Handles the common locale formats:
//   [12/06/2026, 14:32:11] Naam: bericht
//   12-06-2026 14:32 - Naam: bericht
//   6/12/26, 2:32 PM - Naam: bericht
// Multi-line messages are folded into the preceding entry. Lines without a
// sender (system notices like "Messages are end-to-end encrypted") are skipped.

import type { Message } from '../../types'

interface ParsedLine {
  ts: string // ISO
  sender: string
  text: string
}

// [date, time] sender: text   — bracketed (iOS) form
const BRACKET = /^\[(\d{1,4}[./-]\d{1,2}[./-]\d{1,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][Mm])?)\]\s*([^:]+?):\s(.*)$/
// date, time - sender: text   — dashed (Android) form
const DASH = /^(\d{1,4}[./-]\d{1,2}[./-]\d{1,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][Mm])?)\s+-\s+([^:]+?):\s(.*)$/

function toIso(dateStr: string, timeStr: string): string {
  // Normalise separators, assume day-first (NL/EU). Fall back to "now" on parse failure.
  const parts = dateStr.split(/[./-]/).map((p) => p.trim())
  if (parts.length !== 3) return new Date().toISOString()
  let [a, b, c] = parts
  // Year position: if the first chunk is 4 digits it's Y-M-D, else D-M-Y.
  let year: string, month: string, day: string
  if (a.length === 4) { year = a; month = b; day = c }
  else { day = a; month = b; year = c.length === 2 ? `20${c}` : c }

  let time = timeStr.trim()
  const ampm = time.match(/([APap][Mm])$/)
  time = time.replace(/\s?[APap][Mm]$/, '')
  const [hRaw, m, s] = time.split(':')
  let h = parseInt(hRaw, 10)
  if (ampm) {
    const pm = /pm/i.test(ampm[1])
    if (pm && h < 12) h += 12
    if (!pm && h === 12) h = 0
  }
  const pad = (n: string | number) => String(n).padStart(2, '0')
  const iso = `${year}-${pad(month)}-${pad(day)}T${pad(h)}:${pad(m)}:${pad(s ?? '00')}`
  const d = new Date(iso)
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

function parseLines(raw: string): ParsedLine[] {
  const out: ParsedLine[] = []
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.replace(/‎/g, '') // strip LTR marks iOS adds
    const m = BRACKET.exec(line) ?? DASH.exec(line)
    if (m) {
      out.push({ ts: toIso(m[1], m[2]), sender: m[3].trim(), text: m[4] })
    } else if (out.length && line.trim()) {
      // continuation of the previous message
      out[out.length - 1].text += `\n${line}`
    }
  }
  return out
}

export interface WhatsappImport {
  messages: Omit<Message, 'id'>[]
  senders: string[]
}

/**
 * Parse a WhatsApp export. `meNames` are the sender labels that represent the
 * account owner (their messages become direction 'out'); everything else is 'in'.
 * `opts` attaches the conversation to a client/project.
 */
export function parseWhatsapp(
  raw: string,
  meNames: string[],
  opts: { clientId?: string | null; projectId?: string | null; contact?: string } = {},
): WhatsappImport {
  const lines = parseLines(raw)
  const meSet = new Set(meNames.map((n) => n.toLowerCase().trim()).filter(Boolean))
  const senders = [...new Set(lines.map((l) => l.sender))]

  // The contact is the most frequent non-me sender, unless overridden.
  const freq = new Map<string, number>()
  for (const l of lines) if (!meSet.has(l.sender.toLowerCase())) freq.set(l.sender, (freq.get(l.sender) ?? 0) + 1)
  const topContact = opts.contact || [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || senders[0] || 'WhatsApp'
  const contactKey = `wa:${(opts.clientId || topContact).toLowerCase().replace(/\s+/g, '-')}`

  const messages: Omit<Message, 'id'>[] = lines.map((l, i) => {
    const out = meSet.has(l.sender.toLowerCase())
    return {
      contact: topContact,
      contactKey,
      clientId: opts.clientId ?? null,
      projectId: opts.projectId ?? null,
      channel: 'whatsapp' as const,
      direction: out ? ('out' as const) : ('in' as const),
      subject: null,
      snippet: l.text.slice(0, 140),
      body: l.text,
      ts: l.ts,
      unread: false, // imported history is already-read
      source: 'whatsapp_import' as const,
      // stable id so re-importing the same export doesn't duplicate
      externalId: `wa-${contactKey}-${l.ts}-${i}`,
    }
  })

  return { messages, senders }
}
