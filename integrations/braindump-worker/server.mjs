// ── OSLIFE · braindump media worker ───────────────────────────────────────────
// The one thing Supabase Edge Functions can't do: reliably download media and run
// ffmpeg. This tiny service takes a braindump_entries id + source, downloads the
// media (yt-dlp for URLs, Supabase Storage for shared files), extracts compact
// audio, transcribes it with Groq Whisper, summarises the transcript into a
// Markdown note with Claude Haiku, and writes the finished row back with the
// service role. Called only by the braindump-ingest edge function.
//
// Env (see .env.example): PORT, WORKER_SECRET, GROQ_API_KEY, ANTHROPIC_API_KEY,
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import http from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, writeFile, rm, stat, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const execFileP = promisify(execFile)

const PORT = Number(process.env.PORT || 8080)
const WORKER_SECRET = process.env.WORKER_SECRET || ''
const GROQ_API_KEY = process.env.GROQ_API_KEY || ''
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const GROQ_MODEL = 'whisper-large-v3-turbo'
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'
const MAX_BYTES = 24 * 1024 * 1024 // Groq single-request cap headroom (25MB)

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const VALID_DOMAINS = ['parkingyou', 'prjct', 'buurtkaart', 'personal', 'cross']
const VALID_KINDS = ['task', 'note', 'vent', 'link', 'voice', 'transaction', 'event', 'health', 'email', 'idea']
const VALID_SENTIMENTS = ['positive', 'neutral', 'negative', 'stressed']

// ── media acquisition ──────────────────────────────────────────────────────────

/** Download a URL's audio via yt-dlp into `dir`, return { audioPath, meta }. */
async function fetchFromUrl(url, dir) {
  const out = join(dir, 'audio.%(ext)s')
  // bestaudio → 16k mono ogg/opus (tiny; keeps most content under the Groq cap).
  await execFileP('yt-dlp', [
    '--no-playlist', '--no-warnings', '--quiet',
    '-f', 'bestaudio/best',
    '--extract-audio', '--audio-format', 'opus',
    '--postprocessor-args', 'ffmpeg:-ac 1 -ar 16000 -b:a 16k',
    '-o', out, url,
  ], { maxBuffer: 1024 * 1024 * 64, timeout: 1000 * 60 * 20 })

  let meta = {}
  try {
    const { stdout } = await execFileP('yt-dlp', ['--no-playlist', '--dump-single-json', '--no-warnings', url],
      { maxBuffer: 1024 * 1024 * 64, timeout: 1000 * 60 * 5 })
    const j = JSON.parse(stdout)
    meta = { title: j.title ?? null, channel: j.uploader ?? j.channel ?? null, duration: j.duration ?? null, thumbnail: j.thumbnail ?? null }
  } catch { /* metadata is best-effort */ }

  const files = await readdir(dir)
  const audio = files.find((f) => f.startsWith('audio.'))
  if (!audio) throw new Error('yt-dlp produced no audio')
  return { audioPath: join(dir, audio), meta }
}

/** Pull a shared file from Supabase Storage and transcode it to compact audio. */
async function fetchFromStorage(storagePath, dir) {
  const { data, error } = await sb.storage.from('braindump').download(storagePath)
  if (error || !data) throw new Error('storage download failed: ' + (error?.message || 'no data'))
  const srcPath = join(dir, 'source')
  await writeFile(srcPath, Buffer.from(await data.arrayBuffer()))
  const audioPath = join(dir, 'audio.ogg')
  await execFileP('ffmpeg', ['-y', '-i', srcPath, '-ac', '1', '-ar', '16000', '-c:a', 'libopus', '-b:a', '16k', audioPath],
    { maxBuffer: 1024 * 1024 * 64, timeout: 1000 * 60 * 20 })
  return { audioPath, meta: {} }
}

// ── transcription (Groq Whisper) ────────────────────────────────────────────────

async function transcribeFile(path) {
  const size = (await stat(path)).size
  if (size <= MAX_BYTES) return await groqTranscribe(path)

  // Too big for one request → split into 10-minute chunks and concatenate.
  const dir = join(path, '..')
  const pattern = join(dir, 'chunk_%03d.ogg')
  await execFileP('ffmpeg', ['-y', '-i', path, '-f', 'segment', '-segment_time', '600', '-c', 'copy', pattern],
    { maxBuffer: 1024 * 1024 * 64, timeout: 1000 * 60 * 20 })
  const chunks = (await readdir(dir)).filter((f) => f.startsWith('chunk_')).sort()
  const parts = []
  for (const c of chunks) parts.push(await groqTranscribe(join(dir, c)))
  return parts.join('\n')
}

async function groqTranscribe(path) {
  const buf = await readFile(path)
  const form = new FormData()
  form.append('file', new Blob([buf], { type: 'audio/ogg' }), 'audio.ogg')
  form.append('model', GROQ_MODEL)
  form.append('response_format', 'text')
  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${GROQ_API_KEY}` },
    body: form,
  })
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`)
  return (await res.text()).trim()
}

// ── summary (Claude Haiku) → the Markdown note ───────────────────────────────────

const SUMMARY_SYSTEM = `Je bent de "Braindump"-verwerker van OSLIFE. Je krijgt een transcript van een video/audio (plus wat metadata) en zet dit om in een compacte, bruikbare Markdown-notitie voor een persoonlijk kennissysteem. Wees feitelijk en beknopt — verzin niets dat niet in het transcript staat.

Geef ALLEEN een fenced \`\`\`json blok terug:
{
  "title": "korte titel (max ~8 woorden)",
  "summary": "één zin die de kern vat",
  "domain": één van ${VALID_DOMAINS.join(', ')},
  "kind": één van ${VALID_KINDS.join(', ')},
  "sentiment": één van ${VALID_SENTIMENTS.join(', ')},
  "tags": ["3-6 lowercase trefwoorden"],
  "markdown": "de notitie: # titel, korte samenvatting, dan de kernpunten als bullets; bronlink onderaan"
}`

async function summarise(transcript, meta, url) {
  const prompt = [
    meta.title ? `Titel: ${meta.title}` : '',
    meta.channel ? `Kanaal/uploader: ${meta.channel}` : '',
    url ? `Bron: ${url}` : '',
    `Transcript:\n"""\n${transcript.slice(0, 24000)}\n"""`,
  ].filter(Boolean).join('\n')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 1500, system: SUMMARY_SYSTEM, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) return null
  const data = await res.json()
  const text = (Array.isArray(data.content) ? data.content : []).filter((b) => b.type === 'text').map((b) => b.text).join('\n')
  return parseNote(text)
}

function parseNote(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : text
  const braced = candidate.match(/\{[\s\S]*\}/)
  let p
  try { p = JSON.parse((braced ? braced[0] : candidate).trim()) } catch { return null }
  if (!p || typeof p !== 'object' || typeof p.markdown !== 'string' || !p.markdown.trim()) return null
  return {
    title: typeof p.title === 'string' ? p.title.trim() : null,
    summary: typeof p.summary === 'string' ? p.summary.trim() : null,
    domain: VALID_DOMAINS.includes(p.domain) ? p.domain : 'personal',
    kind: VALID_KINDS.includes(p.kind) ? p.kind : 'note',
    sentiment: VALID_SENTIMENTS.includes(p.sentiment) ? p.sentiment : 'neutral',
    tags: Array.isArray(p.tags) ? p.tags.map(String).slice(0, 8) : [],
    markdown: p.markdown.trim(),
  }
}

// ── job ──────────────────────────────────────────────────────────────────────────

async function runJob({ entryId, sourceUrl, storagePath }) {
  const dir = await mkdtemp(join(tmpdir(), 'bd-'))
  try {
    await sb.from('braindump_entries').update({ status: 'processing' }).eq('id', entryId)

    const { audioPath, meta } = sourceUrl
      ? await fetchFromUrl(sourceUrl, dir)
      : await fetchFromStorage(storagePath, dir)

    const transcript = await transcribeFile(audioPath)
    if (!transcript) throw new Error('empty transcript')

    const note = (await summarise(transcript, meta, sourceUrl)) ?? {
      title: meta.title ?? 'Transcript',
      summary: transcript.slice(0, 140),
      domain: 'personal', kind: 'note', sentiment: 'neutral', tags: [],
      markdown: `# ${meta.title ?? 'Transcript'}\n\n${transcript}\n\n${sourceUrl ? `[bron](${sourceUrl})` : ''}`,
    }

    await sb.from('braindump_entries').update({
      status: 'ready',
      title: note.title,
      summary: note.summary,
      markdown: note.markdown,
      domain: note.domain,
      kind: note.kind,
      sentiment: note.sentiment,
      tags: note.tags,
      thumb_url: meta.thumbnail ?? null,
      meta: { transcript: true, channel: meta.channel ?? null, duration: meta.duration ?? null, url: sourceUrl ?? null },
      error: null,
    }).eq('id', entryId)

    // No full-size originals: drop the shared media file once transcribed.
    if (storagePath) await sb.storage.from('braindump').remove([storagePath]).catch(() => {})
  } catch (err) {
    await sb.from('braindump_entries').update({ status: 'failed', error: String(err).slice(0, 500) }).eq('id', entryId)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

// ── http ──────────────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }
  if (req.method !== 'POST' || req.url !== '/transcribe') {
    res.writeHead(404); res.end(); return
  }
  const auth = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '')
  if (!WORKER_SECRET || auth !== WORKER_SECRET) {
    res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'unauthorized' })); return
  }
  let body = ''
  req.on('data', (c) => { body += c })
  req.on('end', () => {
    let payload
    try { payload = JSON.parse(body || '{}') } catch { res.writeHead(400); res.end(); return }
    if (!payload.entryId || (!payload.sourceUrl && !payload.storagePath)) {
      res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'entryId + source required' })); return
    }
    // Accept fast; the edge function only needs to know we took the job. The row
    // is finished asynchronously (download + transcription can take a while).
    res.writeHead(202, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ accepted: true }))
    runJob(payload).catch((e) => console.error('[braindump-worker] job failed', e))
  })
})

server.listen(PORT, () => console.log(`[braindump-worker] listening on :${PORT}`))
