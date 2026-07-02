// ── Braindump v2 · client helpers ─────────────────────────────────────────────
// Small, pure-ish helpers used by the capture box, the share-sheet intake and the
// store: figure out what was shared, and kick the server-side ingest pipeline.
// The heavy lifting (fetch/transcribe/vision → Markdown) all happens server-side
// in the braindump-ingest edge function (+ the media worker); this file only
// classifies the raw share payload and invokes.

import { supabase } from './supabase'
import type { BraindumpSourceKind } from '../types'

const YT_RE = /(?:youtube\.com|youtu\.be)/i
const IG_RE = /instagram\.com/i
const PIN_RE = /(?:pinterest\.[a-z.]+|pin\.it)/i
const URL_RE = /^https?:\/\/\S+$/i

/** Pull the first http(s) URL out of a blob of shared text (apps often dump a URL into `text`). */
export function extractUrl(text: string | null | undefined): string | null {
  if (!text) return null
  const m = text.match(/https?:\/\/[^\s]+/i)
  return m ? m[0] : null
}

/** Classify a shared link into the right source kind. */
export function detectUrlKind(url: string): BraindumpSourceKind {
  if (YT_RE.test(url)) return 'youtube'
  if (IG_RE.test(url)) return 'instagram'
  if (PIN_RE.test(url)) return 'pinterest'
  return 'link'
}

/** Classify a shared file by its MIME type. */
export function detectFileKind(mime: string): BraindumpSourceKind {
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'file'
}

/**
 * Classify a plain text/url share (no file). Returns the kind plus, when the
 * text is really just a URL, the extracted url so the caller can store it as
 * `source_url` and drop the redundant text.
 */
export function detectTextShare(raw: string): { kind: BraindumpSourceKind; url: string | null; text: string } {
  const trimmed = raw.trim()
  const url = URL_RE.test(trimmed) ? trimmed : extractUrl(trimmed)
  // Treat it as a link only when the text is essentially just the URL.
  if (url && (trimmed === url || trimmed.length - url.length < 12)) {
    return { kind: detectUrlKind(url), url, text: trimmed }
  }
  return { kind: 'text', url, text: trimmed }
}

/**
 * Fire the server-side ingest pipeline for an entry. Best-effort: on any failure
 * the entry simply stays `pending` (the grid shows it and offers a retry), so
 * this never throws — same resilience contract as askBrain().
 */
export async function invokeBraindumpIngest(entryId: string): Promise<void> {
  try {
    await supabase.functions.invoke('braindump-ingest', { body: { entryId } })
  } catch (err) {
    console.warn('[OSLIFE] braindump-ingest invoke failed', err)
  }
}

/** A signed URL for a stored thumbnail path (private bucket), or null. */
export async function braindumpThumbUrl(path: string | null): Promise<string | null> {
  if (!path) return null
  // Already a full URL (some rows store the public/signed URL directly).
  if (/^https?:\/\//i.test(path)) return path
  const { data } = await supabase.storage.from('braindump').createSignedUrl(path, 60 * 60)
  return data?.signedUrl ?? null
}
