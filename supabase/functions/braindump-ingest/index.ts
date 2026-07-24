/**
 * Supabase Edge Function: braindump-ingest
 * ----------------------------------------
 * The conversion pipeline for Braindump v2. Given a braindump_entries row id, it
 * detects the source type, fetches / normalises the content, asks Claude to turn
 * it into a compact Markdown note (+ title / summary / domain / kind / sentiment /
 * tags), stores a thumbnail, and flips the row to `ready`. Everything is
 * best-effort: any branch that fails degrades to a metadata-only note rather than
 * throwing, so an entry is never stuck — mirroring the askBrain() null-fallback
 * contract on the frontend.
 *
 * Handled inline: text, link (Defuddle-extracted article Markdown, falling
 * back to a regex tag-strip), image, pdf, office documents (docx/xlsx/pptx/
 * csv/txt), and image-type instagram/pinterest posts (Claude vision / document
 * blocks).
 * YouTube is also handled inline, no worker required: oEmbed for title/
 * channel/thumbnail, plus a plain fetch() of YouTube's own caption tracks for
 * a transcript (see ../_shared/youtube.ts) — free, no API key, no yt-dlp.
 * IMPORTANT: an unauthenticated request to that endpoint routinely gets
 * YouTube's "log in to confirm you're not a bot" wall (the same anti-bot
 * check yt-dlp hits — it's not something a plain fetch() avoids just by not
 * being yt-dlp), so in practice this needs the optional YOUTUBE_COOKIE_HEADER
 * secret to actually work; see _shared/youtube.ts's doc comment.
 * Covers any video with captions (manual or auto-generated), which is most of
 * them once cookies are configured; a caption-less video still gets a
 * metadata-only note.
 * Delegated to braindump-worker (yt-dlp + ffmpeg + Groq Whisper): video, audio,
 * and video-type instagram/pinterest, plus youtube videos with no captions at
 * all (audio+Whisper is the only way to get a transcript for those). When
 * BRAINDUMP_WORKER_URL is not configured, those fall back to metadata-only
 * (oEmbed / OpenGraph) so the app still works before the worker is deployed.
 *
 *   request:  { "entryId": "<uuid>" }
 *   response: { "ok": true, "status": "ready" | "processing" | "failed" }
 *
 * Deploy:
 *   supabase functions deploy braindump-ingest --project-ref nhyunnnmdcmojvkxrbpl
 * Secrets: ANTHROPIC_API_KEY (required); YOUTUBE_COOKIE_HEADER (optional —
 * needed in practice for YouTube transcripts, see above); INSTAGRAM_COOKIE_HEADER
 * (optional — same fix, same reason, for processSocial()'s og-scrape below,
 * only used when the worker isn't configured or is unreachable); BRAINDUMP_WORKER_URL
 * + WORKER_SECRET (optional — enables real media transcription for
 * non-YouTube video/audio and caption-less YouTube videos).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { ANTHROPIC_API, MODEL, anthropicHeaders, extractText, parseJsonBlock } from "../_shared/anthropic.ts";
import { CORS, SUPABASE_URL, corsPreflight, jsonResponder } from "../_shared/http.ts";
import { extractArticle, extractSocialCaption, fetchText, htmlToText, parseOG } from "../_shared/webpage.ts";
import { extractYoutubeId, fetchYoutubeMeta, fetchYoutubeTranscript } from "../_shared/youtube.ts";

const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
// Same fix as _shared/youtube.ts's YOUTUBE_COOKIE_HEADER, for Instagram: an
// unauthenticated og-scrape increasingly gets redirected to Instagram's login
// wall (no og:image/og:description at all) instead of the real post. Only
// exercised by processSocial() below, and only sent to instagram.com URLs
// specifically — never to Pinterest, which wouldn't recognise this cookie
// anyway and shouldn't see it leaked into its request logs.
const INSTAGRAM_COOKIE_HEADER = Deno.env.get("INSTAGRAM_COOKIE_HEADER") ?? "";

const VALID_DOMAINS = ["parkingyou", "prjct", "buurtkaart", "personal", "cross"];
const VALID_KINDS = ["task", "note", "vent", "link", "voice", "transaction", "event", "health", "email", "idea"];
const VALID_SENTIMENTS = ["positive", "neutral", "negative", "stressed"];
// Kennisbank/wiki learning taxonomy — must match the check constraint on
// wiki_entries.category (20260721020000_wiki_entries_category.sql) and
// LearningCategory in src/heyra/learning.ts. On confirm, the takeaway becomes
// a permanent LearnedFact under this same category (store.ts resolveWikiEntry).
const VALID_LEARNING_CATEGORIES = [
  "life_lesson",
  "way_of_living",
  "business_system",
  "business_practice",
  "implementation",
  "pet",
];

const json = jsonResponder(CORS);

// ── Anthropic ─────────────────────────────────────────────────────────────────

const CONVERT_SYSTEM = `Je bent de "Braindump"-verwerker van OSLIFE: je zet een gedeeld item (tekst, artikel, afbeelding, PDF, social post) om in een compacte, bruikbare Markdown-notitie voor een persoonlijk kennissysteem. De notitie wordt later door HEYRA en OSLife als context gelezen, dus wees feitelijk en beknopt — geen verzinsels.

Geef ALLEEN een fenced \`\`\`json blok terug met exact deze velden:
{
  "title": "korte titel (max ~8 woorden)",
  "summary": "één zin die de kern vat (max ~20 woorden)",
  "domain": één van ${VALID_DOMAINS.join(", ")},
  "kind": één van ${VALID_KINDS.join(", ")},
  "sentiment": één van ${VALID_SENTIMENTS.join(", ")},
  "tags": ["3-6 korte trefwoorden, lowercase"],
  "fields": { "amount": number, "currency": "EUR", "dueDate": "YYYY-MM-DD", "sender": "naam" } of null,
  "markdown": "de notitie in Markdown",
  "wiki": { "category": "...", "takeaway": "...", "application": "..." } of null
}

De "markdown" is lichtgewicht maar volledig: begin met een # titel, dan een korte samenvatting, dan de kernpunten als bullets. Bij een afbeelding: beschrijf wat te zien is en neem gelezen tekst (OCR) op. Bij een artikel/PDF: vat de belangrijkste punten samen. Neem de bronlink onderaan op als die er is. domain: parkingyou/prjct/buurtkaart zijn de bedrijven van de gebruiker, personal = privé, cross = meerdere.

"fields" is alleen voor een rekening/bon/factuur: vul 'm met wat je letterlijk ziet (bedrag, valuta, vervaldatum, afzender/leverancier). Verzin nooit een bedrag of datum die je niet ziet — laat het veld dan gewoon weg. Bij alles wat geen rekening is: "fields": null.

"wiki" is alleen voor content die een concreet, herbruikbaar idee, inzicht of les bevat die Rick mogelijk wil onthouden of implementeren — bijvoorbeeld een interessante Instagram-post over een aanpak/tool/groeistrategie, een slim stukje workflow, een businessmodel-truc, een levensles, of een tip/product voor de hond. Dit is bewust selectief: de meeste braindumps (persoonlijke notities, taken, venten, routine-linkjes, transacties) krijgen GEEN wiki-veld — laat het dan gewoon "wiki": null. Alleen als het item duidelijk het karakter heeft van "dit is een idee/inzicht om te bewaren en ooit toe te passen", vul je 'm:
  - "category": één van ${VALID_LEARNING_CATEGORIES.join(", ")} — kies de beste match:
      - life_lesson: een persoonlijke levensles of inzicht over hoe je denkt, leeft of reageert
      - way_of_living: een gewoonte, routine of manier van leven (gezondheid, huishouden, mindset, dagritme)
      - business_system: een systeem, proces of tool om een bedrijf te runnen (bijv. workflow-automatisering, CRM-aanpak, rapportagestructuur)
      - business_practice: een concrete zakelijke tactiek of gewoonte (bijv. prijsstrategie, salesaanpak, marketingtruc)
      - implementation: een concreet idee over hoe je iets nieuws bouwt, lanceert of implementeert
      - pet: iets over de hond/huisdier — een product, tip, aanpak of aandachtspunt
  - "takeaway": één tot twee zinnen, de kern van het idee/inzicht/les (niet de hele inhoud herhalen).
  - "application": concreet en specifiek hoe dit zou kunnen toepassen op Rick — zijn eigen bedrijven (ParkingYou, PRJCT Agency, Geldrop Buurtkaart), lopende projecten, zijn persoonlijk leven of zijn hond, of een nieuw soort project dat dit idee zou kunnen inspireren. Geen vage algemeenheden ("dit kun je toepassen op je bedrijf") — noem een concreet aanknopingspunt.
Bij twijfel: "wiki": null. Beter een goede suggestie missen dan de kennisbank vervuilen met ruis.`;

interface ContentBlock {
  type: string;
  text?: string;
  source?: { type: string; url?: string; media_type?: string; data?: string };
}

interface WikiSuggestion {
  category: string | null;
  takeaway: string;
  application: string;
}

interface Converted {
  title: string | null;
  summary: string | null;
  domain: string;
  kind: string;
  sentiment: string;
  tags: string[];
  fields: Record<string, unknown> | null;
  markdown: string;
  wiki: WikiSuggestion | null;
}

/** A wiki suggestion needs both a real takeaway and a real, non-empty application. Null on anything half-formed. */
function sanitizeWiki(raw: unknown): WikiSuggestion | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const takeaway = String((raw as Record<string, unknown>).takeaway ?? "").trim();
  const application = String((raw as Record<string, unknown>).application ?? "").trim();
  if (!takeaway || !application) return null;
  const rawCategory = String((raw as Record<string, unknown>).category ?? "");
  const category = VALID_LEARNING_CATEGORIES.includes(rawCategory) ? rawCategory : null;
  return { category, takeaway, application };
}

/** Keep only the known, well-typed keys a bill/receipt capture can carry. */
function sanitizeFields(raw: Record<string, unknown>): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  if (typeof raw.amount === "number" && Number.isFinite(raw.amount)) out.amount = raw.amount;
  if (typeof raw.currency === "string" && raw.currency.trim()) out.currency = raw.currency.trim().slice(0, 8);
  if (typeof raw.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.dueDate)) out.dueDate = raw.dueDate;
  if (typeof raw.sender === "string" && raw.sender.trim()) out.sender = raw.sender.trim().slice(0, 120);
  return Object.keys(out).length ? out : null;
}

/** SHA-256 hex digest, used for dedup — same input always yields the same hash. */
async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Ask Claude to convert content blocks into the uniform note shape. Null on failure. */
async function convert(apiKey: string, blocks: ContentBlock[]): Promise<Converted | null> {
  let res: Response;
  try {
    res = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: anthropicHeaders(apiKey),
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: CONVERT_SYSTEM,
        messages: [{ role: "user", content: blocks }],
      }),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const data = await res.json();
  const parsed = parseJsonBlock(extractText(data.content));
  if (!parsed) return null;
  const domain = VALID_DOMAINS.includes(String(parsed.domain)) ? String(parsed.domain) : "personal";
  const kind = VALID_KINDS.includes(String(parsed.kind)) ? String(parsed.kind) : "note";
  const sentiment = VALID_SENTIMENTS.includes(String(parsed.sentiment)) ? String(parsed.sentiment) : "neutral";
  const markdown = typeof parsed.markdown === "string" && parsed.markdown.trim() ? parsed.markdown.trim() : "";
  if (!markdown) return null;
  const tags = Array.isArray(parsed.tags) ? parsed.tags.map((t) => String(t)).slice(0, 8) : [];
  const fields = parsed.fields && typeof parsed.fields === "object" && !Array.isArray(parsed.fields)
    ? sanitizeFields(parsed.fields as Record<string, unknown>)
    : null;
  const wiki = sanitizeWiki(parsed.wiki);
  return {
    title: typeof parsed.title === "string" ? parsed.title.trim() : null,
    summary: typeof parsed.summary === "string" ? parsed.summary.trim() : null,
    domain,
    kind,
    sentiment,
    tags,
    fields,
    markdown,
    wiki,
  };
}

// ── Per-type processors ────────────────────────────────────────────────────────
// Each returns a Converted note. The caller adds thumb_url / meta separately.

interface Row {
  id: string;
  user_id: string;
  source_kind: string;
  source_url: string | null;
  meta: Record<string, unknown>;
  tier: string;
}

type ProcessResult = { note: Converted; thumbUrl: string | null; meta: Record<string, unknown> };

async function processText(apiKey: string, text: string, url: string | null): Promise<ProcessResult | null> {
  const blocks: ContentBlock[] = [{
    type: "text",
    text: `Gedeelde notitie/tekst${url ? ` (bron: ${url})` : ""}:\n"""\n${text}\n"""`,
  }];
  const note = await convert(apiKey, blocks);
  return note ? { note, thumbUrl: null, meta: {} } : null;
}

async function processLink(apiKey: string, url: string): Promise<ProcessResult | null> {
  const html = await fetchText(url);
  const og = html ? parseOG(html) : { title: null, description: null, image: null, video: null };
  // Defuddle strips nav/ads/boilerplate and gives us clean article Markdown;
  // fall back to the crude tag-stripper when it can't make sense of the page.
  const article = html ? await extractArticle(html, url) : null;
  const body = article?.markdown || (html ? htmlToText(html) : "");
  const title = article?.title ?? og.title;
  const blocks: ContentBlock[] = [{
    type: "text",
    text: [
      `Gedeelde link: ${url}`,
      title ? `Titel: ${title}` : "",
      article?.author ? `Auteur: ${article.author}` : "",
      !article && og.description ? `Omschrijving: ${og.description}` : "",
      body ? `Pagina-inhoud:\n"""\n${body}\n"""` : "",
    ].filter(Boolean).join("\n"),
  }];
  const note = await convert(apiKey, blocks);
  if (!note) return null;
  return { note, thumbUrl: og.image, meta: { url } };
}

/** Instagram / Pinterest: OG scrape → image (vision) or video (worker upstream). */
async function processSocial(apiKey: string, url: string): Promise<{ delegate: boolean; result?: ProcessResult | null }> {
  const isInstagram = /instagram\.com/i.test(url);
  const cookieHeaders = isInstagram && INSTAGRAM_COOKIE_HEADER ? { cookie: INSTAGRAM_COOKIE_HEADER } : {};
  const html = await fetchText(url, 9000, cookieHeaders);
  const og = html ? parseOG(html) : { title: null, description: null, image: null, video: null };
  if (og.video) return { delegate: true };

  const blocks: ContentBlock[] = [{
    type: "text",
    text: [
      `Gedeelde social post: ${url}`,
      og.title ? `Titel: ${og.title}` : "",
      og.description ? `Bijschrift: ${extractSocialCaption(og.description)}` : "",
      og.image ? "Hieronder de afbeelding van de post — beschrijf wat te zien is en neem eventuele tekst (OCR) op." : "",
    ].filter(Boolean).join("\n"),
  }];
  if (og.image) blocks.push({ type: "image", source: { type: "url", url: og.image } });
  const note = await convert(apiKey, blocks);
  return { delegate: false, result: note ? { note, thumbUrl: og.image, meta: { url } } : null };
}

async function processImage(apiKey: string, bytes: Uint8Array, mime: string, url: string | null): Promise<ProcessResult | null> {
  const blocks: ContentBlock[] = [
    { type: "text", text: "Gedeelde afbeelding — beschrijf wat te zien is en neem alle gelezen tekst (OCR) letterlijk op." },
    { type: "image", source: { type: "base64", media_type: mime, data: encodeBase64(bytes) } },
  ];
  const note = await convert(apiKey, blocks);
  return note ? { note, thumbUrl: url, meta: {} } : null;
}

async function processPdf(apiKey: string, bytes: Uint8Array): Promise<ProcessResult | null> {
  const blocks: ContentBlock[] = [
    { type: "text", text: "Gedeelde PDF — vat de belangrijkste punten samen als Markdown." },
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: encodeBase64(bytes) } },
  ];
  const note = await convert(apiKey, blocks);
  return note ? { note, thumbUrl: null, meta: {} } : null;
}

/**
 * Office documents / plain text (docx, xlsx/xls/csv, pptx, txt/md) — no
 * catch-all Claude document block for these like PDF gets, so we extract text
 * ourselves and feed it through the same convert() pipeline. Each format's
 * parser is loaded lazily via esm.sh; any failure (corrupt file, unsupported
 * subtype) returns null rather than throwing.
 */
async function processOfficeDoc(
  apiKey: string,
  bytes: Uint8Array,
  mime: string,
  filename: string | null,
): Promise<ProcessResult | null> {
  const ext = (filename ?? "").split(".").pop()?.toLowerCase() ?? "";
  let text = "";
  let label = "bestand";
  try {
    if (mime.includes("wordprocessingml") || ext === "docx") {
      const mammoth: any = await import("https://esm.sh/mammoth@1.8.0");
      // esm.sh resolves mammoth to its Node-oriented bundle here, which wants
      // {buffer: Uint8Array} — the browser-only {arrayBuffer} shape throws
      // "Could not find file in options" (verified by actually running it).
      const result = await mammoth.extractRawText({ buffer: bytes });
      text = typeof result?.value === "string" ? result.value : "";
      label = "Word-document";
    } else if (
      mime.includes("spreadsheetml") || ext === "xlsx" || ext === "xls" || mime === "text/csv" || ext === "csv"
    ) {
      const XLSX: any = await import("https://esm.sh/xlsx@0.18.5");
      const wb = XLSX.read(bytes, { type: "array" });
      text = wb.SheetNames
        .map((name: string) => `## ${name}\n${XLSX.utils.sheet_to_csv(wb.Sheets[name])}`)
        .join("\n\n");
      label = "spreadsheet";
    } else if (mime.includes("presentationml") || ext === "pptx") {
      text = await extractPptxText(bytes);
      label = "presentatie";
    } else if (mime.startsWith("text/") || ext === "txt" || ext === "md") {
      text = new TextDecoder().decode(bytes);
      label = "tekstbestand";
    } else {
      return null;
    }
  } catch {
    return null;
  }
  text = text.trim();
  if (!text) return null;
  const blocks: ContentBlock[] = [{
    type: "text",
    text: `Gedeeld ${label}${filename ? ` (${filename})` : ""} — vat de belangrijkste punten samen als Markdown.\n"""\n${
      text.slice(0, 20000)
    }\n"""`,
  }];
  const note = await convert(apiKey, blocks);
  return note ? { note, thumbUrl: null, meta: { filename } } : null;
}

/** pptx is a zip of slide XML — pull the literal text runs out of each slide. */
async function extractPptxText(bytes: Uint8Array): Promise<string> {
  const { default: JSZip }: any = await import("https://esm.sh/jszip@3.10.1");
  const zip = await JSZip.loadAsync(bytes);
  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/(\d+)/)?.[1] ?? 0) - Number(b.match(/(\d+)/)?.[1] ?? 0));
  const parts: string[] = [];
  for (const f of slideFiles) {
    const xml: string = await zip.files[f].async("text");
    const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]);
    if (texts.length) parts.push(`### Slide ${parts.length + 1}\n${texts.join(" ")}`);
  }
  return parts.join("\n\n");
}

/**
 * YouTube: oEmbed for metadata (title/channel/thumbnail) plus a free, direct
 * fetch of YouTube's own caption tracks for a transcript — see
 * ../_shared/youtube.ts. When a transcript is found, Claude gets the full
 * text and produces a real summary, same quality bar as every other source.
 * When the video simply has no captions, this degrades to the old
 * metadata-only note (title/channel/link) — the caller may then hand off to
 * the audio+Whisper worker if one is configured.
 */
async function processYoutube(apiKey: string, url: string): Promise<ProcessResult | null> {
  const videoId = extractYoutubeId(url);
  const [{ title, author, thumb }, transcript] = await Promise.all([
    fetchYoutubeMeta(url),
    videoId ? fetchYoutubeTranscript(videoId) : Promise.resolve(null),
  ]);
  const blocks: ContentBlock[] = [{
    type: "text",
    text: [
      `Gedeelde YouTube-video: ${url}`,
      title ? `Titel: ${title}` : "",
      author ? `Kanaal: ${author}` : "",
      transcript
        ? `Transcript:\n"""\n${transcript.slice(0, 15000)}\n"""`
        : "Er is geen transcript beschikbaar voor deze video — maak een korte notitie met titel, kanaal en link.",
    ].filter(Boolean).join("\n"),
  }];
  const note = await convert(apiKey, blocks);
  // YouTube's thumbnail CDN is deterministic from the video id — prefer it
  // over oEmbed's own thumbnail field (still a fallback for a malformed/
  // shortened url extractYoutubeId() can't parse), so a thumbnail never
  // silently depends on oEmbed alone succeeding.
  const deterministicThumb = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
  return note ? { note, thumbUrl: deterministicThumb ?? thumb, meta: { url, transcript: !!transcript } } : null;
}

// ── Main ────────────────────────────────────────────────────────────────────────

const MEDIA_KINDS = new Set(["video", "audio"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight(CORS);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "ANTHROPIC_API_KEY secret is not set" }, 503);

  let entryId: string;
  try {
    entryId = String((await req.json()).entryId ?? "");
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!entryId) return json({ error: "entryId is required" }, 400);

  // JWT-scoped client: RLS confines every read/write and every storage upload to
  // the caller (owner = auth.uid()), so no service role is needed here.
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: row, error: readErr } = await sb
    .from("braindump_entries")
    .select("id,user_id,source_kind,source_url,meta,tier")
    .eq("id", entryId)
    .single();
  if (readErr || !row) return json({ error: "Entry not found" }, 404);

  const r = row as Row;
  const meta = r.meta ?? {};
  const rawText = typeof meta.rawText === "string" ? meta.rawText : null;
  const storagePath = typeof meta.storagePath === "string" ? meta.storagePath : null;
  const url = r.source_url;
  let kind = r.source_kind;

  const fail = async (msg: string) => {
    await sb.from("braindump_entries").update({ status: "failed", error: msg.slice(0, 500) }).eq("id", entryId);
    return json({ ok: false, status: "failed" });
  };
  const DEDUP_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

  const finish = async (res: ProcessResult, contentHash: string | null = null) => {
    // Duplicate check: same user + same content hash, seen ready within the
    // lookback window. Marks the new row `duplicate` instead of `ready` —
    // still visible/recoverable in the Capture grid, but excluded from
    // search_memory() (see 20260715020000_braindump_dedup.sql) so re-shares
    // never pollute recall.
    if (contentHash) {
      const cutoff = new Date(Date.now() - DEDUP_LOOKBACK_MS).toISOString();
      const { data: dup } = await sb
        .from("braindump_entries")
        .select("id")
        .eq("user_id", r.user_id)
        .eq("content_hash", contentHash)
        .eq("status", "ready")
        .neq("id", entryId)
        .gte("created_at", cutoff)
        .limit(1)
        .maybeSingle();
      if (dup) {
        await sb.from("braindump_entries").update({
          status: "duplicate",
          content_hash: contentHash,
          meta: { ...meta, ...res.meta, duplicateOf: dup.id },
          error: null,
        }).eq("id", entryId);
        return json({ ok: true, status: "duplicate" });
      }
    }

    await sb.from("braindump_entries").update({
      status: "ready",
      title: res.note.title,
      summary: res.note.summary,
      markdown: res.note.markdown,
      domain: res.note.domain,
      kind: res.note.kind,
      sentiment: res.note.sentiment,
      tags: res.note.tags,
      thumb_url: res.thumbUrl,
      content_hash: contentHash,
      meta: { ...meta, ...res.meta, ...(res.note.fields ? { fields: res.note.fields } : {}) },
      error: null,
    }).eq("id", entryId);
    // Claude flagged this as an actionable idea/insight worth a spot in the
    // Kennisbank — propose it (status='suggested'); Rick confirms/rejects in
    // the app, same shape as the inference engine. geheim entries are skipped,
    // same tier gate as materialize-note/cognee-remember below.
    if (res.note.wiki && r.tier !== "geheim") {
      await sb.from("wiki_entries").insert({
        user_id: r.user_id,
        braindump_entry_id: entryId,
        status: "suggested",
        title: res.note.title ?? "Zonder titel",
        transcript: res.note.markdown,
        takeaway: res.note.wiki.takeaway,
        application: res.note.wiki.application,
        category: res.note.wiki.category,
        domain: res.note.domain,
        tags: res.note.tags,
        source_url: url,
      });
    }
    // Fire-and-forget: feed search_memory()'s hybrid recall. A missing
    // VOYAGE_API_KEY or any embedding failure is a silent no-op — the entry
    // is already "ready" regardless.
    fetch(`${SUPABASE_URL}/functions/v1/embed-memory`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: authHeader },
      body: JSON.stringify({
        source: "braindump",
        id: entryId,
        text: [res.note.title, res.note.summary, res.note.markdown].filter(Boolean).join("\n"),
      }),
    }).catch(() => {});
    // Fire-and-forget: mirror as a real vault note. geheim entries are never
    // materialised — a Storage file has no per-row tier gate the way
    // search_memory() does, so this must be excluded here explicitly.
    if (r.tier !== "geheim") {
      fetch(`${SUPABASE_URL}/functions/v1/materialize-note`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: authHeader },
        body: JSON.stringify({
          source: "braindump",
          id: entryId,
          frontmatter: { kind: res.note.kind, domain: res.note.domain, tags: res.note.tags, sentiment: res.note.sentiment, source_url: url },
          body: res.note.markdown,
        }),
      }).catch(() => {});
      // Fire-and-forget: feed the cognee knowledge-graph worker, same tier
      // gate as materialize-note (a real service with no per-row tier
      // enforcement of its own).
      fetch(`${SUPABASE_URL}/functions/v1/cognee-remember`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: authHeader },
        body: JSON.stringify({ source: "braindump", id: entryId, text: res.note.markdown }),
      }).catch(() => {});
    }
    return json({ ok: true, status: "ready" });
  };

  await sb.from("braindump_entries").update({ status: "processing" }).eq("id", entryId);

  const workerUrl = Deno.env.get("BRAINDUMP_WORKER_URL");
  const workerSecret = Deno.env.get("WORKER_SECRET");

  try {
    // ── Social: when the worker is configured, always hand Instagram/Pinterest
    // to it and let yt-dlp decide video-vs-not — a plain server-side fetch()
    // of the post (used by processSocial's og:video check) routinely gets
    // blocked/redirected to a login wall by Instagram, which would otherwise
    // silently misroute a real video post into the image-only path below.
    // Only fall back to the og-scrape decision when there's no worker to ask.
    if ((kind === "instagram" || kind === "pinterest") && url) {
      if (workerUrl && workerSecret) {
        kind = "video"; // fall through to media handling below
      } else {
        const social = await processSocial(apiKey, url);
        return social.result ? await finish(social.result, await sha256Hex(url.trim().toLowerCase())) : await fail("Kon de social post niet verwerken");
      }
    }

    // ── YouTube: try the free, inline caption-track pipeline first — no
    // worker round-trip needed at all when the video has captions (most do).
    // Only a caption-less video falls through to the audio+Whisper worker.
    if (kind === "youtube" && url) {
      const yt = await processYoutube(apiKey, url);
      if (yt && yt.meta.transcript) return await finish(yt);
      if (workerUrl && workerSecret) {
        const res = await fetch(workerUrl.replace(/\/$/, "") + "/transcribe", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${workerSecret}` },
          body: JSON.stringify({ entryId, sourceUrl: url, storagePath, sourceKind: r.source_kind }),
        }).catch(() => null);
        if (res && res.ok) return json({ ok: true, status: "processing" });
      }
      // No captions and no worker (or worker unreachable) → the metadata-only
      // note processYoutube() already produced.
      return yt ? await finish(yt) : await fail("Kon de YouTube-metadata niet ophalen");
    }

    // ── Media: hand off to the worker, or metadata-only fallback ──
    if (MEDIA_KINDS.has(kind) || ((kind === "instagram" || kind === "pinterest") && url)) {
      if (workerUrl && workerSecret) {
        const res = await fetch(workerUrl.replace(/\/$/, "") + "/transcribe", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${workerSecret}` },
          body: JSON.stringify({ entryId, sourceUrl: url, storagePath, sourceKind: r.source_kind }),
        }).catch(() => null);
        // Worker finishes the row itself (status → ready) via the service role
        // — it downloads the video, transcribes it, and deletes the temp
        // file/audio regardless of outcome (or, if yt-dlp says it isn't a
        // downloadable video at all, falls back to describing the og:image).
        if (res && res.ok) return json({ ok: true, status: "processing" });
        // Worker unreachable → graceful metadata fallback below.
      }
      if (url && (r.source_kind === "instagram" || r.source_kind === "pinterest")) {
        const social = await processSocial(apiKey, url);
        return social.result ? await finish(social.result, await sha256Hex(url.trim().toLowerCase())) : await fail("Kon de social post niet verwerken (worker onbereikbaar)");
      }
      if (url) {
        const link = await processLink(apiKey, url);
        return link ? await finish(link, await sha256Hex(url.trim().toLowerCase())) : await fail("Media-worker niet beschikbaar en geen metadata");
      }
      return await fail("Media-worker niet geconfigureerd voor dit bestand");
    }

    // ── Files in storage: image / pdf ──
    if ((kind === "image" || kind === "pdf") && storagePath) {
      const { data: file, error: dlErr } = await sb.storage.from("braindump").download(storagePath);
      if (dlErr || !file) return await fail("Kon het bestand niet downloaden");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mime = file.type || (kind === "pdf" ? "application/pdf" : "image/jpeg");
      const contentHash = await sha256Hex(bytes);

      let result: ProcessResult | null;
      let thumbUrl: string | null = null;
      let thumbCreated = false;
      if (kind === "pdf") {
        result = await processPdf(apiKey, bytes);
        // No full-size originals: drop the PDF once summarised (no thumb kept).
        await sb.storage.from("braindump").remove([storagePath]).catch(() => {});
      } else {
        // Keep a lightweight thumbnail; drop the full-size original afterwards.
        const thumb = await makeThumb(sb, storagePath, bytes, mime);
        thumbUrl = thumb.url;
        thumbCreated = thumb.createdThumb;
        result = await processImage(apiKey, bytes, mime, thumbUrl);
        // Only remove the original if a separate thumbnail was actually created —
        // otherwise thumbUrl points at the original and must survive.
        if (thumbCreated) await sb.storage.from("braindump").remove([storagePath]).catch(() => {});
      }
      if (!result) return await fail("Kon het bestand niet verwerken");
      if (thumbUrl) result.thumbUrl = thumbUrl;
      return await finish(result, contentHash);
    }

    // ── Files in storage: office documents (docx/xlsx/pptx/csv/txt) ──
    if (kind === "file" && storagePath) {
      const { data: file, error: dlErr } = await sb.storage.from("braindump").download(storagePath);
      if (dlErr || !file) return await fail("Kon het bestand niet downloaden");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mime = file.type || "application/octet-stream";
      const filename = storagePath.split("/").pop()?.replace(/^\d+_/, "") ?? null;
      const contentHash = await sha256Hex(bytes);
      const result = await processOfficeDoc(apiKey, bytes, mime, filename);
      // No full-size originals: drop the file once summarised, same as PDFs.
      await sb.storage.from("braindump").remove([storagePath]).catch(() => {});
      if (!result) return await fail("Bestandstype niet ondersteund of kon niet worden gelezen");
      return await finish(result, contentHash);
    }

    // ── Link ──
    if (kind === "link" && url) {
      const link = await processLink(apiKey, url);
      return link ? await finish(link, await sha256Hex(url.trim().toLowerCase())) : await fail("Kon de link niet verwerken");
    }

    // ── Plain text (default) ──
    if (rawText) {
      const t = await processText(apiKey, rawText, url);
      return t ? await finish(t, await sha256Hex(rawText.trim().toLowerCase())) : await fail("Kon de tekst niet verwerken");
    }
    if (url) {
      const link = await processLink(apiKey, url);
      return link ? await finish(link, await sha256Hex(url.trim().toLowerCase())) : await fail("Kon de link niet verwerken");
    }
    return await fail("Geen inhoud om te verwerken");
  } catch (err) {
    return await fail(`Verwerking mislukt: ${String(err)}`);
  }
});

/**
 * Downscale an image to a small thumbnail, upload it next to the original, and
 * return a long-lived signed URL. Best-effort: on any failure, signs the original
 * so the grid still has something to show.
 */
async function makeThumb(
  sb: ReturnType<typeof createClient>,
  originalPath: string,
  bytes: Uint8Array,
  _mime: string,
): Promise<{ url: string | null; createdThumb: boolean }> {
  const YEAR = 60 * 60 * 24 * 365;
  const thumbPath = originalPath.replace(/(\.[^.]+)?$/, "") + "_thumb.jpg";
  try {
    const { Image } = await import("https://deno.land/x/imagescript@1.2.15/mod.ts");
    const img = await Image.decode(bytes);
    const scale = Math.min(1, 480 / Math.max(img.width, img.height));
    if (scale < 1) img.resize(Math.round(img.width * scale), Math.round(img.height * scale));
    const jpg = await img.encodeJPEG(72);
    const { error } = await sb.storage.from("braindump").upload(thumbPath, jpg, {
      contentType: "image/jpeg",
      upsert: true,
    });
    if (!error) {
      const { data } = await sb.storage.from("braindump").createSignedUrl(thumbPath, YEAR);
      if (data?.signedUrl) return { url: data.signedUrl, createdThumb: true };
    }
  } catch { /* fall through to signing the original */ }
  const { data } = await sb.storage.from("braindump").createSignedUrl(originalPath, YEAR);
  return { url: data?.signedUrl ?? null, createdThumb: false };
}
