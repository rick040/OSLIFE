// ── In-app email classification ───────────────────────────────────────────────
// The Gmail sync's stored `importance` is unreliable (it flags Facebook/Instagram
// newsletters as high), and the "Rick - PRJCT Agency" label just means "landed in
// the PRJCT mailbox" — not "client work". So OSLIFE reclassifies locally:
//   - DOMAIN TAG comes from the Gmail labels (PRJCT / ParkingYou / Betalen / Fiverr
//     / Persoonlijk) — reliable as an *area* signal.
//   - IMPORTANCE comes from sender + subject heuristics — social/marketing bulk
//     senders are Ruis; real people, replies, invoices/orders and Fiverr client
//     messages are Belangrijk.
import type { Domain, EmailItem } from '../../types'

export type Importance = 'high' | 'med' | 'low'

export interface EmailTag {
  key: string
  label: string
  hex: string
}

const TAGS = {
  fiverr: { key: 'fiverr', label: 'Fiverr', hex: '#5A9E86' },
  prjct: { key: 'prjct', label: 'PRJCT', hex: '#A78BFA' },
  parkingyou: { key: 'parkingyou', label: 'ParkingYou', hex: '#60A5FA' },
  finance: { key: 'finance', label: 'Betalen', hex: '#F87171' },
  personal: { key: 'personal', label: 'Persoonlijk', hex: '#FBBF24' },
} as const

/** All domain tags in display order — used to render the inbox domain filter. */
export const ALL_EMAIL_TAGS: EmailTag[] = [TAGS.prjct, TAGS.parkingyou, TAGS.finance, TAGS.fiverr, TAGS.personal]

/** Domain/area tags for an email, derived from its Gmail labels (deduped, ordered). */
export function emailTags(email: EmailItem): EmailTag[] {
  const labels = email.labels ?? []
  const has = (re: RegExp) => labels.some((l) => re.test(l))
  const out: EmailTag[] = []
  if (has(/fiverr/i)) out.push(TAGS.fiverr)
  if (has(/prjct|buurtkaart/i)) out.push(TAGS.prjct)
  if (has(/parkingyou|🅿️/i)) out.push(TAGS.parkingyou)
  if (has(/betalen|factuur|finance/i)) out.push(TAGS.finance)
  if (out.length === 0) out.push(TAGS.personal)
  return out
}

/** Domain-tag key → app-wide Domain, for turning an AI-detected email reminder into a
 * Taken-screen task (store.addTasksFromEmailReminders). Fiverr client work bills to
 * PRJCT; a "Betalen" tag alone doesn't say which business it's for, so it falls back
 * to personal rather than guessing. */
const TASK_DOMAIN: Record<string, Domain> = {
  fiverr: 'prjct',
  prjct: 'prjct',
  parkingyou: 'parkingyou',
  finance: 'personal',
  personal: 'personal',
}

/** Best-effort Domain for a task created from this email's highest-priority tag. */
export function emailTaskDomain(email: EmailItem): Domain {
  const tag = emailTags(email)[0]
  return TASK_DOMAIN[tag?.key ?? 'personal'] ?? 'personal'
}

// ── Importance heuristics ─────────────────────────────────────────────────────

function address(from: string): string {
  const m = from.match(/<([^>]+)>/)
  return (m ? m[1] : from).trim().toLowerCase()
}

/** Bulk social/marketing sender domains — always Ruis. */
const NOISE_DOMAINS = [
  'facebookmail.com', 'facebook.com', 'instagram.com', 'mail.instagram.com',
  'metamail.com', 'whoppah.com', 'linkedin.com',
  'pinterest.com', 'x.com', 'twitter.com', 'medium.com', 'substack.com',
  'youtube.com', 'tiktok.com', 'spotify.com', 'nextdoor.com',
]

/** Sender local-parts that mark automated / newsletter / notification mail. */
const NOISE_LOCALPARTS = [
  'newsletter', 'nieuwsbrief', 'news', 'updates', 'update', 'pageupdates',
  'groupupdates', 'notification', 'notifications', 'notify', 'notificatie',
  'notificaties', 'meldingen', 'reminder', 'reminders', 'posts-recaps',
  'follow-suggestions', 'unread-messages', 'recaps', 'digest', 'marketing',
  'promo', 'promotions', 'mailer', 'mailing', 'campaign', 'nieuws',
]

const REPLY_RE = /^\s*(re|antw|aw|fwd|fw)\s*:/i
/** Money TROUBLE / invoices worth surfacing — not generic order receipts. */
const MONEY_RE = /factu|incasso|aanmaning|betalingsherinner|herinnering|openstaand|mislukte|geweigerd|achterstand|rechtsmaatregel|deurwaarder|betaling ontbreekt|aanmaning/i
/** A real Fiverr client conversation (vs. Fiverr ads/marketing). */
const FIVERR_CONVO_RE = /message|bericht|order|custom offer|reageer|delivered|revision|requirement|inbox/i

function isNoiseSender(addr: string): boolean {
  const at = addr.lastIndexOf('@')
  const local = at !== -1 ? addr.slice(0, at) : addr
  const domain = at !== -1 ? addr.slice(at + 1) : ''
  if (NOISE_DOMAINS.some((d) => domain === d || domain.endsWith('.' + d))) return true
  // any address that is a no-reply mailbox (noreply, no-reply, googleplay-noreply, …)
  if (/no-?reply|donotreply|do-not-reply/.test(local)) return true
  return NOISE_LOCALPARTS.some((p) => local === p || local.startsWith(p) || local.includes('.' + p))
}

/**
 * Reclassify an email into high/med/low, independent of the unreliable stored
 * importance. Order matters: Fiverr is split into client-vs-marketing first,
 * then bulk senders are demoted, then real replies / money-trouble promoted.
 */
export function classifyImportance(email: EmailItem): Importance {
  const subject = (email.subject ?? '').trim()
  const addr = address(email.from ?? '')
  const isFiverr = /fiverr/i.test(addr) || (email.labels ?? []).some((l) => /fiverr/i.test(l))

  // 1. Fiverr: a real client conversation matters; ads/marketing is Ruis.
  if (isFiverr) return FIVERR_CONVO_RE.test(subject) ? 'high' : 'low'
  // 2. Social / marketing / no-reply / notification bulk → Ruis.
  if (isNoiseSender(addr)) return 'low'
  // 3. A real reply/forward thread → Belangrijk.
  if (REPLY_RE.test(subject)) return 'high'
  // 4. Invoices & money trouble (dunning, failed payment) → Belangrijk.
  if (MONEY_RE.test(subject)) return 'high'
  // 5. Everything else from a real human/company → Misschien.
  return 'med'
}
