// ── HEYRA agent helper · Klant-research ────────────────────────────────────────
// Thin wrapper around the `enrich-client` Edge Function (fetch + Claude Haiku).
// Given a website URL it returns a one-line "what does this company do" note —
// or `null` on ANY failure (no url, offline, timeout, unparseable), so intake
// always degrades gracefully and never blocks the drafted reply.

import { supabase } from '../../lib/supabase'

const TIMEOUT_MS = 10000 // page fetch + Claude call is slower than a plain completion

// Common personal-mail providers are never a company's own website — skip
// guessing a domain from these (also avoids fetching gmail.com etc.).
const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com', 'outlook.com', 'hotmail.com', 'live.com', 'proton.me', 'protonmail.com',
  'icloud.com', 'me.com', 'yahoo.com', 'ziggo.nl', 'kpnmail.nl', 'planet.nl', 'xs4all.nl',
])

/** Best-effort candidate website for an intake email, or null if it looks like a personal address. */
export function guessWebsiteFromEmail(email: string | null): string | null {
  const domain = email?.split('@')[1]?.trim().toLowerCase()
  if (!domain || PERSONAL_EMAIL_DOMAINS.has(domain)) return null
  return `https://${domain}`
}

export interface ClientResearchNote {
  note: string
  confidence: number
}

export async function enrichClient(url: string): Promise<ClientResearchNote | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS))
  const call = supabase.functions
    .invoke('enrich-client', { body: { url } })
    .then(({ data, error }) => {
      if (error || !data || data.error || typeof data.note !== 'string' || !data.note.trim()) return null
      const confidence = Number.isFinite(data.confidence) ? Number(data.confidence) : 0.5
      return { note: data.note.trim(), confidence }
    })
    .catch(() => null)

  return await Promise.race([call, timeout])
}
