// ── HEYRA agent helper · cognee knowledge-graph search ─────────────────────────
// Thin wrapper around the `cognee-search` Edge Function. Returns a graph-aware
// insight string, or `null` on ANY failure (worker not configured, offline,
// timeout, empty result) — same graceful-degradation contract as
// categorizeVendor()/enrichClient(), so callers never block or special-case
// "the worker isn't deployed yet."

import { supabase } from '../../lib/supabase'

const TIMEOUT_MS = 15000 // graph traversal is slower than a plain completion

export async function cogneeSearch(query: string): Promise<string | null> {
  if (!query.trim()) return null
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS))
  const call = supabase.functions
    .invoke('cognee-search', { body: { query } })
    .then(({ data, error }) => {
      if (error || !data || typeof data.insight !== 'string' || !data.insight.trim()) return null
      return data.insight.trim()
    })
    .catch(() => null)

  return await Promise.race([call, timeout])
}
