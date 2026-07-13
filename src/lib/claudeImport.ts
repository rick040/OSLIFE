// ── Claude chat export → knowledge import ─────────────────────────────────────
// Turns a claude.ai data export (Settings → Privacy → "Export data", which mails
// you a zip containing conversations.json) into normalized knowledge records
// that the store imports as `ready` braindump entries — so HEYRA can search and
// reference your past Claude conversations from inside Life OS. There is no API
// to read a claude.ai account live; this manual export is the realistic path.
//
// Deliberately pure and network-free: it only parses + shapes JSON, so it's
// fully unit-testable and the store/UI own all the I/O. Robust to both export
// shapes seen in the wild — the old `chat_messages[].text` string and the newer
// `chat_messages[].content[]` block array — and skips anything it can't read
// rather than throwing, so one malformed conversation never sinks the import.

/** One conversation, normalized into an importable knowledge record. */
export interface ClaudeImportRecord {
  conversationId: string
  title: string
  createdAt: string // ISO
  updatedAt: string | null
  messageCount: number
  markdown: string // "# title" + full transcript, capped
  summary: string // one-liner for the grid card
  tags: string[]
}

/** Hard cap on a single conversation's transcript so one row can't blow up. */
const MAX_MARKDOWN_CHARS = 16000

function asString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function isoOrNull(v: unknown): string | null {
  const s = asString(v).trim()
  return s ? s : null
}

/** Pull the readable text out of one message, tolerating both export shapes. */
function messageText(msg: Record<string, unknown>): string {
  // Newer exports: content is an array of typed blocks; keep only text blocks.
  const content = msg.content
  if (Array.isArray(content)) {
    const parts = content
      .map((b) => (b && typeof b === 'object' && (b as { type?: unknown }).type === 'text'
        ? asString((b as { text?: unknown }).text)
        : ''))
      .filter((t) => t.trim())
    if (parts.length) return parts.join('\n').trim()
  }
  // Older exports (and simple messages): a plain `text` string.
  return asString(msg.text).trim()
}

/** "human" → "Jij", "assistant" → "Claude", anything else Title-cased. */
function speakerLabel(sender: unknown): string {
  const s = asString(sender).toLowerCase()
  if (s === 'human' || s === 'user') return 'Jij'
  if (s === 'assistant') return 'Claude'
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Onbekend'
}

function buildMarkdown(title: string, turns: { speaker: string; text: string }[]): string {
  const header = `# ${title}\n`
  let body = ''
  let truncated = false
  for (const turn of turns) {
    const block = `\n**${turn.speaker}:**\n${turn.text}\n`
    if (header.length + body.length + block.length > MAX_MARKDOWN_CHARS) {
      truncated = true
      break
    }
    body += block
  }
  return `${header}${body}${truncated ? '\n\n_… gesprek ingekort bij import._\n' : ''}`.trim()
}

/** Normalize one conversation object. Returns null when there's nothing usable. */
function normalizeConversation(conv: unknown): ClaudeImportRecord | null {
  if (!conv || typeof conv !== 'object') return null
  const c = conv as Record<string, unknown>

  const rawMessages = c.chat_messages
  if (!Array.isArray(rawMessages)) return null

  const turns: { speaker: string; text: string }[] = []
  for (const m of rawMessages) {
    if (!m || typeof m !== 'object') continue
    const text = messageText(m as Record<string, unknown>)
    if (!text) continue
    turns.push({ speaker: speakerLabel((m as Record<string, unknown>).sender), text })
  }
  if (!turns.length) return null

  const conversationId = asString(c.uuid) || asString(c.id) || crypto.randomUUID()
  const title = asString(c.name).trim() || 'Claude-gesprek'
  const createdAt = isoOrNull(c.created_at) ?? new Date().toISOString()
  const updatedAt = isoOrNull(c.updated_at)

  const firstUser = turns.find((t) => t.speaker === 'Jij')?.text ?? turns[0].text
  const summary = `Claude-gesprek: ${title} — ${firstUser.replace(/\s+/g, ' ').slice(0, 100)}`.slice(0, 160)

  return {
    conversationId,
    title,
    createdAt,
    updatedAt,
    messageCount: turns.length,
    markdown: buildMarkdown(title, turns),
    summary,
    tags: ['claude', 'import'],
  }
}

/**
 * Parse a raw claude.ai export (the parsed JSON of conversations.json) into
 * importable records. Accepts either the top-level array the export ships, or an
 * object wrapping it under `conversations`. Never throws — unreadable entries are
 * skipped and an unrecognisable payload yields an empty list.
 */
export function parseClaudeExport(raw: unknown): ClaudeImportRecord[] {
  let list: unknown[] = []
  if (Array.isArray(raw)) {
    list = raw
  } else if (raw && typeof raw === 'object' && Array.isArray((raw as { conversations?: unknown }).conversations)) {
    list = (raw as { conversations: unknown[] }).conversations
  } else {
    return []
  }

  const records: ClaudeImportRecord[] = []
  for (const conv of list) {
    const rec = normalizeConversation(conv)
    if (rec) records.push(rec)
  }
  // Newest first, matching how the braindump grid is ordered.
  return records.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}
