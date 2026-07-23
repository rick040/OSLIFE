// ── OSLIFE · braindump media worker ───────────────────────────────────────────
// The one thing Supabase Edge Functions can't do: reliably download media and run
// ffmpeg. This tiny service takes a braindump_entries id + source, downloads the
// media (yt-dlp for URLs, Supabase Storage for shared files), extracts compact
// audio, transcribes it with Groq Whisper, summarises the transcript into a
// Markdown note with Claude Haiku, and writes the finished row back with the
// service role — then fires the same embed-memory / materialize-note /
// cognee-remember follow-ups braindump-ingest's finish() runs for every other
// source type, so a transcribed video is just as searchable/materialised as a
// captured link or text note. Called only by the braindump-ingest edge function.
//
// For YouTube specifically, it tries the video's own caption track first
// (yt-dlp --write-subs/--write-auto-sub — free, seconds instead of minutes,
// no Whisper cost) and only falls back to the audio+Whisper pipeline when the
// video has no captions at all.
//
// For Instagram/Pinterest, braindump-ingest delegates here unconditionally
// (it can't reliably tell video-vs-photo posts apart itself — see that file's
// comment on why). yt-dlp attempts a download first; if the post turns out to
// be a plain photo (no downloadable video), noteFromImagePost() below falls
// back to describing the og:image with Claude vision instead of failing the
// entry outright.
//
// yt-dlp running from a datacenter IP (any cloud host) routinely gets
// "Sign in to confirm you're not a bot" from YouTube — a bot-check on the IP,
// unrelated to the video itself. If a cookies file is present (see
// YT_COOKIES_PATH below), every yt-dlp call passes --cookies to authenticate
// as a real browser session, which avoids it.
//
// Env (see .env.example): PORT, WORKER_SECRET, GROQ_API_KEY, ANTHROPIC_API_KEY,
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, YT_COOKIES_PATH (optional).

import http from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
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
// Netscape-format cookies.txt (e.g. Render's "Secret Files", mounted under
// /etc/secrets/<name>). Absent by default — every call below degrades to an
// unauthenticated request, same as today, when this path doesn't exist.
const YT_COOKIES_PATH = process.env.YT_COOKIES_PATH || '/etc/secrets/youtube-cookies.txt'
const cookieArgs = () => (existsSync(YT_COOKIES_PATH) ? ['--cookies', YT_COOKIES_PATH] : [])

const GROQ_MODEL = 'whisper-large-v3-turbo'
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'
const MAX_BYTES = 24 * 1024 * 1024 // Groq single-request cap headroom (25MB)

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const VALID_DOMAINS = ['parkingyou', 'prjct', 'buurtkaart', 'personal', 'cross']
const VALID_KINDS = ['task', 'note', 'vent', 'link', 'voice', 'transaction', 'event', 'health', 'email', 'idea']
const VALID_SENTIMENTS = ['positive', 'neutral', 'negative', 'stressed']
// Kennisbank/wiki learning taxonomy — must match wiki_entries.category's check
// constraint (20260721020000_wiki_entries_category.sql) and braindump-ingest's
// own VALID_LEARNING_CATEGORIES, so a video/audio/social capture handled by
// this worker gets the exact same Kennisbank-suggestion treatment a text/link
// capture already gets from braindump-ingest itself.
const VALID_LEARNING_CATEGORIES = ['life_lesson', 'way_of_living', 'business_system', 'business_practice', 'implementation', 'pet']
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36'

// Shared "wiki" field instructions, appended to every system prompt below —
// same selection criteria as braindump-ingest/index.ts's CONVERT_SYSTEM.
// Deliberately selective: most captures get no wiki field at all.
const WIKI_PROMPT_BLOCK = `
"wiki" is alleen voor content die een concreet, herbruikbaar idee, inzicht of les bevat die Rick mogelijk wil onthouden of implementeren — bijvoorbeeld een aanpak/tool/groeistrategie, een slim stukje workflow, een businessmodel-truc, een levensles, of een tip/product voor de hond. Dit is bewust selectief: de meeste braindumps krijgen GEEN wiki-veld — laat het dan gewoon "wiki": null. Alleen als het duidelijk het karakter heeft van "dit is een idee/inzicht om te bewaren en ooit toe te passen", vul je 'm:
  - "category": één van ${VALID_LEARNING_CATEGORIES.join(', ')} — kies de beste match:
      - life_lesson: een persoonlijke levensles of inzicht over hoe je denkt, leeft of reageert
      - way_of_living: een gewoonte, routine of manier van leven (gezondheid, huishouden, mindset, dagritme)
      - business_system: een systeem, proces of tool om een bedrijf te runnen
      - business_practice: een concrete zakelijke tactiek of gewoonte
      - implementation: een concreet idee over hoe je iets nieuws bouwt, lanceert of implementeert
      - pet: iets over de hond/huisdier
  - "takeaway": één tot twee zinnen, de kern van het idee/inzicht/les (niet de hele inhoud herhalen).
  - "application": concreet en specifiek hoe dit zou kunnen toepassen op Rick — zijn eigen bedrijven (ParkingYou, PRJCT Agency, Geldrop Buurtkaart), lopende projecten, zijn persoonlijk leven of zijn hond.
Bij twijfel: "wiki": null. Beter een goede suggestie missen dan de kennisbank vervuilen met ruis.`

// ── image-post fallback (Instagram/Pinterest posts with no downloadable video) ──

function ogTag(html, prop) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i')
  const m = html.match(re) ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'))
  return m ? decodeEntities(m[1]) : null
}
function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
}
// Instagram/Facebook og:description is "N Likes, M Comments - user on
// Instagram: "the actual caption"" boilerplate — pull out just the caption.
function extractCaption(desc) {
  const m = desc.match(/on (?:Instagram|Facebook)[^:]*:\s*"([\s\S]*)"\s*$/i)
  return m ? m[1].trim() : desc
}

const IMAGE_SYSTEM = `Je bent de "Braindump"-verwerker van OSLIFE. Je krijgt een social media post (afbeelding + bijschrift) en zet dit om in een compacte Markdown-notitie voor een persoonlijk kennissysteem. Wees feitelijk en beknopt.

Geef ALLEEN een fenced \`\`\`json blok terug:
{
  "title": "korte titel (max ~8 woorden)",
  "summary": "één zin die de kern vat",
  "domain": één van ${VALID_DOMAINS.join(', ')},
  "kind": één van ${VALID_KINDS.join(', ')},
  "sentiment": één van ${VALID_SENTIMENTS.join(', ')},
  "tags": ["3-6 lowercase trefwoorden"],
  "markdown": "de notitie: # titel, korte samenvatting van wat te zien is + bijschrift, bronlink onderaan",
  "wiki": { "category": "...", "takeaway": "...", "application": "..." } of null
}
${WIKI_PROMPT_BLOCK}`

/** Describe a social post's og:image with Claude vision when it isn't a video at all. */
async function noteFromImagePost(url) {
  const res = await fetch(url, { headers: { 'user-agent': BROWSER_UA, 'accept-language': 'nl,en;q=0.8' } })
  if (!res.ok) throw new Error(`fetch ${res.status}`)
  const html = await res.text()
  const title = ogTag(html, 'og:title')
  const descRaw = ogTag(html, 'og:description')
  const image = ogTag(html, 'og:image')
  if (!image) throw new Error('no og:image found')
  const description = descRaw ? extractCaption(descRaw) : null

  const content = [
    {
      type: 'text',
      text: [
        `Gedeelde social post: ${url}`,
        title ? `Titel: ${title}` : '',
        description ? `Bijschrift: ${description}` : '',
        'Hieronder de afbeelding van de post — beschrijf wat te zien is en neem eventuele tekst (OCR) op.',
      ].filter(Boolean).join('\n'),
    },
    { type: 'image', source: { type: 'url', url: image } },
  ]
  const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 1500, system: IMAGE_SYSTEM, messages: [{ role: 'user', content }] }),
  })
  if (!apiRes.ok) throw new Error(`anthropic ${apiRes.status}: ${await apiRes.text()}`)
  const data = await apiRes.json()
  const text = (Array.isArray(data.content) ? data.content : []).filter((b) => b.type === 'text').map((b) => b.text).join('\n')
  const note = parseNote(text)
  if (!note) throw new Error('convert failed')
  return { note, thumbUrl: image }
}

// ── media acquisition ──────────────────────────────────────────────────────────

/** Title/channel/thumbnail via YouTube's public oEmbed endpoint — a plain fetch,
 * not yt-dlp, so it isn't subject to the same bot-check as the calls below. */
async function fetchYoutubeOEmbed(url) {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`)
    if (res.ok) {
      const d = await res.json()
      return { title: d.title ?? null, author: d.author_name ?? null, thumbnail: d.thumbnail_url ?? null }
    }
  } catch { /* ignore */ }
  return { title: null, author: null, thumbnail: null }
}

/** Metadata-only note (title/channel/link, no transcript) for a YouTube video
 * that has no captions and whose audio yt-dlp couldn't fetch either — keeps
 * the entry from dead-ending on a raw yt-dlp error, same contract as every
 * other braindump source ("never stuck"). */
async function noteFromYoutubeMetaOnly(url) {
  const meta = await fetchYoutubeOEmbed(url)
  const prompt = [
    `Gedeelde YouTube-video: ${url}`,
    meta.title ? `Titel: ${meta.title}` : '',
    meta.author ? `Kanaal: ${meta.author}` : '',
    'Er is geen transcript beschikbaar voor deze video — maak een korte notitie met titel, kanaal en link.',
  ].filter(Boolean).join('\n')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 800, system: SUMMARY_SYSTEM, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) throw new Error(`anthropic ${res.status}`)
  const data = await res.json()
  const text = (Array.isArray(data.content) ? data.content : []).filter((b) => b.type === 'text').map((b) => b.text).join('\n')
  const note = parseNote(text)
  if (!note) throw new Error('convert failed')
  return { note, thumbUrl: meta.thumbnail }
}

/** Video/channel metadata via yt-dlp's own JSON dump. Best-effort — {} on failure. */
async function fetchYoutubeMeta(url) {
  try {
    const { stdout } = await execFileP('yt-dlp', ['--no-playlist', '--dump-single-json', '--no-warnings', ...cookieArgs(), url],
      { maxBuffer: 1024 * 1024 * 64, timeout: 1000 * 60 * 5 })
    const j = JSON.parse(stdout)
    return { title: j.title ?? null, channel: j.uploader ?? j.channel ?? null, duration: j.duration ?? null, thumbnail: j.thumbnail ?? null }
  } catch {
    return {}
  }
}

/**
 * Try to grab YouTube's own subtitle track (manual or auto-generated) with
 * --skip-download — no audio/video transfer, no Whisper call. Returns plain
 * text, or null if the video has no captions in a language we asked for.
 */
async function fetchYoutubeCaptions(url, dir) {
  const out = join(dir, 'subs.%(ext)s')
  await execFileP('yt-dlp', [
    '--no-playlist', '--no-warnings', '--quiet', '--skip-download',
    '--write-subs', '--write-auto-sub',
    '--sub-langs', 'nl,en,nl.*,en.*',
    '--convert-subs', 'srt',
    ...cookieArgs(),
    '-o', out, url,
  ], { maxBuffer: 1024 * 1024 * 64, timeout: 1000 * 60 * 5 })
  const files = (await readdir(dir)).filter((f) => f.startsWith('subs.') && f.endsWith('.srt'))
  if (!files.length) return null
  const pick = files.find((f) => f.includes('.nl.')) ?? files.find((f) => f.includes('.en.')) ?? files[0]
  const raw = await readFile(join(dir, pick), 'utf8')
  const text = srtToText(raw)
  return text || null
}

/** Strip SRT sequence numbers + timestamps, dedupe the rolling-caption repeats. */
function srtToText(srt) {
  const lines = []
  for (const block of srt.replace(/\r/g, '').split(/\n\n+/)) {
    for (const line of block.split('\n')) {
      if (!line || /^\d+$/.test(line) || line.includes('-->')) continue
      lines.push(line.replace(/<[^>]+>/g, '').trim())
    }
  }
  const out = []
  for (const l of lines) if (l && l !== out[out.length - 1]) out.push(l)
  return out.join(' ').replace(/\s+/g, ' ').trim()
}

/** Download a URL's audio via yt-dlp into `dir`, return { audioPath, meta }. */
async function fetchFromUrl(url, dir) {
  const out = join(dir, 'audio.%(ext)s')
  // bestaudio → 16k mono ogg/opus (tiny; keeps most content under the Groq cap).
  await execFileP('yt-dlp', [
    '--no-playlist', '--no-warnings', '--quiet',
    '-f', 'bestaudio/best',
    '--extract-audio', '--audio-format', 'opus',
    '--postprocessor-args', 'ffmpeg:-ac 1 -ar 16000 -b:a 16k',
    ...cookieArgs(),
    '-o', out, url,
  ], { maxBuffer: 1024 * 1024 * 64, timeout: 1000 * 60 * 20 })

  const meta = await fetchYoutubeMeta(url)
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
  "markdown": "de notitie: # titel, korte samenvatting, dan de kernpunten als bullets; bronlink onderaan",
  "wiki": { "category": "...", "takeaway": "...", "application": "..." } of null
}
${WIKI_PROMPT_BLOCK}`

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

/** A wiki suggestion needs both a real takeaway and a real, non-empty application — same rule as braindump-ingest's sanitizeWiki(). */
function sanitizeWiki(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const takeaway = String(raw.takeaway ?? '').trim()
  const application = String(raw.application ?? '').trim()
  if (!takeaway || !application) return null
  const category = VALID_LEARNING_CATEGORIES.includes(raw.category) ? raw.category : null
  return { category, takeaway, application }
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
    wiki: sanitizeWiki(p.wiki),
  }
}

// ── job ──────────────────────────────────────────────────────────────────────────

/** SHA-256 hex digest — same convention as braindump-ingest's dedup hash. */
async function sha256Hex(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

const DEDUP_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000 // 30 days, same window as braindump-ingest

/**
 * Mark the row ready (or duplicate) and fire the same follow-ups
 * braindump-ingest's finish() runs for every other source type. The worker
 * writes with the service role (no user JWT to forward), so these downstream
 * calls authenticate as service role too — consistent with the trust this
 * worker already has to write the row directly.
 */
async function finishReady(entryId, userId, tier, note, { thumbUrl = null, meta = {}, contentHash = null, url = null }) {
  if (contentHash && userId) {
    const cutoff = new Date(Date.now() - DEDUP_LOOKBACK_MS).toISOString()
    const { data: dup } = await sb.from('braindump_entries').select('id')
      .eq('user_id', userId).eq('content_hash', contentHash).eq('status', 'ready')
      .neq('id', entryId).gte('created_at', cutoff).limit(1).maybeSingle()
    if (dup) {
      await sb.from('braindump_entries').update({
        status: 'duplicate', content_hash: contentHash, meta: { ...meta, duplicateOf: dup.id }, error: null,
      }).eq('id', entryId)
      return
    }
  }

  await sb.from('braindump_entries').update({
    status: 'ready',
    title: note.title, summary: note.summary, markdown: note.markdown,
    domain: note.domain, kind: note.kind, sentiment: note.sentiment, tags: note.tags,
    thumb_url: thumbUrl, content_hash: contentHash, meta, error: null,
  }).eq('id', entryId)

  // Claude flagged this as an actionable idea/insight worth a spot in the
  // Kennisbank — same suggest-then-confirm insert braindump-ingest's finish()
  // does for text/link/image captures. This was the missing piece: every
  // video/audio/social capture routed to this worker previously never got a
  // chance at a wiki suggestion at all (the old SUMMARY_SYSTEM/IMAGE_SYSTEM
  // prompts didn't even ask for one).
  if (note.wiki && tier !== 'geheim') {
    await sb.from('wiki_entries').insert({
      user_id: userId,
      braindump_entry_id: entryId,
      status: 'suggested',
      title: note.title ?? 'Zonder titel',
      transcript: note.markdown,
      takeaway: note.wiki.takeaway,
      application: note.wiki.application,
      category: note.wiki.category,
      domain: note.domain,
      tags: note.tags,
      source_url: url,
    })
  }

  const authHeader = `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
  const text = [note.title, note.summary, note.markdown].filter(Boolean).join('\n')
  fetch(`${SUPABASE_URL}/functions/v1/embed-memory`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: authHeader },
    body: JSON.stringify({ source: 'braindump', id: entryId, text }),
  }).catch(() => {})

  // geheim entries never get materialised/graphed — no per-row tier gate on
  // Storage/the cognee worker the way search_memory() has, so it's enforced here.
  if (tier !== 'geheim') {
    fetch(`${SUPABASE_URL}/functions/v1/materialize-note`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: authHeader },
      body: JSON.stringify({
        source: 'braindump', id: entryId,
        frontmatter: { kind: note.kind, domain: note.domain, tags: note.tags, sentiment: note.sentiment, source_url: url },
        body: note.markdown,
      }),
    }).catch(() => {})
    fetch(`${SUPABASE_URL}/functions/v1/cognee-remember`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: authHeader },
      body: JSON.stringify({ source: 'braindump', id: entryId, text: note.markdown }),
    }).catch(() => {})
  }
}

async function runJob({ entryId, sourceUrl, storagePath, sourceKind }) {
  const dir = await mkdtemp(join(tmpdir(), 'bd-'))
  try {
    await sb.from('braindump_entries').update({ status: 'processing' }).eq('id', entryId)
    const { data: row } = await sb.from('braindump_entries').select('user_id,tier').eq('id', entryId).single()
    const userId = row?.user_id ?? null
    const tier = row?.tier ?? 'normaal'
    const contentHash = sourceUrl ? await sha256Hex(sourceUrl.trim().toLowerCase()) : null

    let transcript = null
    let meta = {}
    let captionSource = 'whisper'

    if (sourceKind === 'youtube' && sourceUrl) {
      meta = await fetchYoutubeMeta(sourceUrl)
      transcript = await fetchYoutubeCaptions(sourceUrl, dir).catch(() => null)
      if (transcript) captionSource = 'youtube'
    }

    if (!transcript) {
      try {
        const fetched = sourceUrl
          ? await fetchFromUrl(sourceUrl, dir)
          : await fetchFromStorage(storagePath, dir)
        meta = { ...fetched.meta, ...meta } // youtube meta (if already fetched) wins
        transcript = await transcribeFile(fetched.audioPath)
      } catch (err) {
        // Instagram/Pinterest often isn't a video at all (a plain photo
        // post) — yt-dlp fails to find a downloadable stream, so describe
        // the og:image instead of failing the whole entry.
        if ((sourceKind === 'instagram' || sourceKind === 'pinterest') && sourceUrl) {
          const fallback = await noteFromImagePost(sourceUrl)
          await finishReady(entryId, userId, tier, fallback.note, {
            thumbUrl: fallback.thumbUrl, meta: { transcript: false, url: sourceUrl }, contentHash, url: sourceUrl,
          })
          return
        }
        // YouTube with no captions whose audio download also failed (most
        // often yt-dlp's bot-check) — degrade to a metadata-only note via
        // oEmbed (a plain fetch, unaffected by that bot-check) instead of
        // leaving the entry stuck on a raw yt-dlp error.
        if (sourceKind === 'youtube' && sourceUrl) {
          const fallback = await noteFromYoutubeMetaOnly(sourceUrl)
          await finishReady(entryId, userId, tier, fallback.note, {
            thumbUrl: fallback.thumbUrl, meta: { transcript: false, url: sourceUrl }, contentHash, url: sourceUrl,
          })
          return
        }
        throw err
      }
    }
    if (!transcript) throw new Error('empty transcript')

    const note = (await summarise(transcript, meta, sourceUrl)) ?? {
      title: meta.title ?? 'Transcript',
      summary: transcript.slice(0, 140),
      domain: 'personal', kind: 'note', sentiment: 'neutral', tags: [],
      markdown: `# ${meta.title ?? 'Transcript'}\n\n${transcript}\n\n${sourceUrl ? `[bron](${sourceUrl})` : ''}`,
    }

    await finishReady(entryId, userId, tier, note, {
      thumbUrl: meta.thumbnail ?? null,
      meta: { transcript: true, captionSource, channel: meta.channel ?? null, duration: meta.duration ?? null, url: sourceUrl ?? null },
      contentHash,
      url: sourceUrl ?? null,
    })

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
