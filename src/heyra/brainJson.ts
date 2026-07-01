/** Pulls the first fenced ```json block (or the whole reply) out of a brain response and parses it. Returns null on any malformed output so callers fall back to their rule-based path. */
export function parseBrainJson(raw: string): Record<string, unknown> | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : raw
  try {
    const parsed = JSON.parse(candidate.trim())
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}
