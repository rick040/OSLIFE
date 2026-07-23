// ── HEYRA · brain client ──────────────────────────────────────────────────────
// Thin wrapper around the `heyra-brain` Edge Function (a proxy to the Claude
// API — see supabase/functions/heyra-brain/index.ts). Every agent in
// heyra/agents/ calls askBrain() with its own grounded system+prompt instead
// of talking to the network directly, so there's exactly one place that
// handles timeouts and failure. On ANY failure (missing secret, offline,
// timeout, bad response) this resolves to `null` instead of throwing — every
// call site treats `null` as "fall back to the rule-based answer", so HEYRA
// never breaks or hangs when the brain is unavailable.

import { supabase } from '../lib/supabase'

const TIMEOUT_MS = 6000

export interface AskBrainOptions {
  maxTokens?: number
  timeoutMs?: number
}

/** True once a call has succeeded this session — lets callers skip retrying a known-dead brain within one exchange, without persisting any "brain is down" state across sessions. */
let lastCallFailed = false

export function brainRecentlyFailed(): boolean {
  return lastCallFailed
}

export async function askBrain(system: string, prompt: string, opts: AskBrainOptions = {}): Promise<string | null> {
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
  const call = supabase.functions
    .invoke('heyra-brain', { body: { system, prompt, maxTokens: opts.maxTokens } })
    .then(({ data, error }) => (error || !data?.text ? null : String(data.text).trim()))
    .catch(() => null)

  const result = await Promise.race([call, timeout])
  lastCallFailed = result === null
  return result
}

/** A tool definition for the Anthropic Messages API — JSON Schema input, forwarded verbatim by heyra-brain. */
export interface BrainTool {
  name: string
  description?: string
  input_schema: Record<string, unknown>
}

export interface BrainToolUse {
  name: string
  input: Record<string, unknown>
}

/**
 * Same brain-first, null-safe contract as askBrain(), but forces a single
 * structured tool call instead of free text — used by proposeAction.ts to get
 * schema-valid JSON straight from the model instead of hoping it fences a
 * ```json block correctly. Resolves null on any failure (missing secret,
 * offline, timeout, malformed response), exactly like askBrain().
 */
export async function askBrainTool(
  system: string,
  prompt: string,
  tool: BrainTool,
  opts: AskBrainOptions = {},
): Promise<BrainToolUse | null> {
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
  const call = supabase.functions
    .invoke('heyra-brain', {
      body: {
        system,
        prompt,
        maxTokens: opts.maxTokens,
        tools: [tool],
        toolChoice: { type: 'tool', name: tool.name },
      },
    })
    .then(({ data, error }) => (error || !data?.toolUse ? null : (data.toolUse as BrainToolUse)))
    .catch(() => null)

  const result = await Promise.race([call, timeout])
  lastCallFailed = result === null
  return result
}
