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
 * Handled inline: text, link, image, pdf, and image-type instagram/pinterest
 * posts (Claude vision / document blocks).
 * Delegated to braindump-worker (yt-dlp + ffmpeg + Groq Whisper): youtube, video,
 * audio, and video-type instagram/pinterest. When BRAINDUMP_WORKER_URL is not
 * configured, media falls back to metadata-only (oEmbed / OpenGraph) so the app
 * still works before the worker is deployed.
 *
 *   request:  { "entryId": "<uuid>" }
 *   response: { "ok": true, "status": "ready" | "processing" | "failed" }
 *
 * Deploy:
 *   supabase functions deploy braindump-ingest --project-ref nhyunnnmdcmojvkxrbpl
 * Secrets: ANTHROPIC_API_KEY (required); BRAINDUMP_WORKER_URL + WORKER_SECRET
 * (optional — enables real media transcription).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-haiku-4-5-20251001";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const VALID_DOMAINS = ["parkingyou", "prjct", "buurtkaart", "personal", "cross"];
const VALID_KINDS = ["task", "note", "vent", "link", "voice", "transaction", "event", "health", "email", "idea"];
const VALID_SENTIMENTS = ["positive", "neutral", "negative", "stressed"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

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
  "markdown": "de notitie in Markdown"
}

De "markdown" is lichtgewicht maar volledig: begin met een # titel, dan een korte samenvatting, dan de kernpunten als bullets. Bij een afbeelding: beschrijf wat te zien is en neem gelezen tekst (OCR) op. Bij een artikel/PDF: vat de belangrijkste punten samen. Neem de bronlink onderaan op als die er is. domain: parkingyou/prjct/buurtkaart zijn de bedrijven van de gebruiker, personal = privé, cross = meerdere.`;

interface ContentBlock {
  type: string;
  text?: string;
  source?: { type: string; url?: string; media_type?: string; data?: string };
}

interface Converted {
  title: string | null;
  summary: string | null;
  domain: string;
  kind: string;
  sentiment: string;
  tags: string[];
  markdown: string;
}

function extractText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((b): b is { type: string; text?: string } => !!b && (b as { type: string }).type === "text")
    .map((b) => b.text ?? "")
    .join("\n")
    .trim();
}

function parseJsonBlock(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const braced = candidate.match(/\{[\s\S]*\}/);
  try {
    const parsed = JSON.parse((braced ? braced[0] : candidate).trim());
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Ask Claude to convert content blocks into the uniform note shape. Null on failure. */
async function convert(apiKey: string, blocks: ContentBlock[]): Promise<Converted | null> {
  let res: Response;
  try {
    res = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION, "content-type": "application/json" },
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
  return {
    title: typeof parsed.title === "string" ? parsed.title.trim() : null,
    summary: typeof parsed.summary === "string" ? parsed.summary.trim() : null,
    domain,
    kind,
    sentiment,
    tags,
    markdown,
  };
}

// ── Fetch / OpenGraph helpers ─────────────────────────────────────────────────

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";

async function fetchText(url: string, ms = 9000): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "user-agent": BROWSER_UA, "accept-language": "nl,en;q=0.8" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

interface OG {
  title: string | null;
  description: string | null;
  image: string | null;
  video: string | null;
}

function metaContent(html: string, prop: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const m = html.match(re) ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, "i"));
  return m ? m[1] : null;
}

function parseOG(html: string): OG {
  const title =
    metaContent(html, "og:title") ?? (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? null);
  const desc = metaContent(html, "og:description") ?? metaContent(html, "description");
  return {
    title: title ? decodeEntities(title) : null,
    description: desc ? decodeEntities(desc) : null,
    image: metaContent(html, "og:image"),
    video: metaContent(html, "og:video") ?? metaContent(html, "og:video:url") ?? metaContent(html, "og:video:secure_url"),
  };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/gi, "'");
}

/** Strip tags → readable-ish text (lightweight; no full readability lib). */
function htmlToText(html: string, max = 8000): string {
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return decodeEntities(body).slice(0, max);
}

// ── Per-type processors ────────────────────────────────────────────────────────
// Each returns a Converted note. The caller adds thumb_url / meta separately.

interface Row {
  id: string;
  source_kind: string;
  source_url: string | null;
  meta: Record<string, unknown>;
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
  const article = html ? htmlToText(html) : "";
  const blocks: ContentBlock[] = [{
    type: "text",
    text: [
      `Gedeelde link: ${url}`,
      og.title ? `Titel: ${og.title}` : "",
      og.description ? `Omschrijving: ${og.description}` : "",
      article ? `Pagina-inhoud:\n"""\n${article}\n"""` : "",
    ].filter(Boolean).join("\n"),
  }];
  const note = await convert(apiKey, blocks);
  if (!note) return null;
  return { note, thumbUrl: og.image, meta: { url } };
}

/** Instagram / Pinterest: OG scrape → image (vision) or video (worker upstream). */
async function processSocial(apiKey: string, url: string): Promise<{ delegate: boolean; result?: ProcessResult | null }> {
  const html = await fetchText(url);
  const og = html ? parseOG(html) : { title: null, description: null, image: null, video: null };
  if (og.video) return { delegate: true };

  const blocks: ContentBlock[] = [{
    type: "text",
    text: [
      `Gedeelde social post: ${url}`,
      og.title ? `Titel: ${og.title}` : "",
      og.description ? `Bijschrift: ${og.description}` : "",
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

/** YouTube metadata-only fallback via oEmbed (used when the worker isn't configured). */
async function processYoutubeFallback(apiKey: string, url: string): Promise<ProcessResult | null> {
  let title: string | null = null, author: string | null = null, thumb: string | null = null;
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`);
    if (res.ok) {
      const d = await res.json();
      title = d.title ?? null;
      author = d.author_name ?? null;
      thumb = d.thumbnail_url ?? null;
    }
  } catch { /* ignore */ }
  const blocks: ContentBlock[] = [{
    type: "text",
    text: [
      `Gedeelde YouTube-video: ${url}`,
      title ? `Titel: ${title}` : "",
      author ? `Kanaal: ${author}` : "",
      "Er is (nog) geen transcript beschikbaar — maak een korte notitie met titel, kanaal en link.",
    ].filter(Boolean).join("\n"),
  }];
  const note = await convert(apiKey, blocks);
  return note ? { note, thumbUrl: thumb, meta: { url, transcript: false } } : null;
}

// ── Main ────────────────────────────────────────────────────────────────────────

const MEDIA_KINDS = new Set(["youtube", "video", "audio"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
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
    .select("id,source_kind,source_url,meta")
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
  const finish = async (res: ProcessResult) => {
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
      meta: { ...meta, ...res.meta },
      error: null,
    }).eq("id", entryId);
    return json({ ok: true, status: "ready" });
  };

  await sb.from("braindump_entries").update({ status: "processing" }).eq("id", entryId);

  const workerUrl = Deno.env.get("BRAINDUMP_WORKER_URL");
  const workerSecret = Deno.env.get("WORKER_SECRET");

  try {
    // ── Social: decide image (inline) vs video (delegate) ──
    if ((kind === "instagram" || kind === "pinterest") && url) {
      const social = await processSocial(apiKey, url);
      if (social.delegate) kind = "video"; // fall through to media handling below
      else return social.result ? await finish(social.result) : await fail("Kon de social post niet verwerken");
    }

    // ── Media: hand off to the worker, or metadata-only fallback ──
    if (MEDIA_KINDS.has(kind) || ((kind === "instagram" || kind === "pinterest") && url)) {
      if (workerUrl && workerSecret) {
        const res = await fetch(workerUrl.replace(/\/$/, "") + "/transcribe", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${workerSecret}` },
          body: JSON.stringify({ entryId, sourceUrl: url, storagePath, sourceKind: r.source_kind }),
        }).catch(() => null);
        // Worker finishes the row itself (status → ready) via the service role.
        if (res && res.ok) return json({ ok: true, status: "processing" });
        // Worker unreachable → graceful metadata fallback below.
      }
      if (kind === "youtube" && url) {
        const yt = await processYoutubeFallback(apiKey, url);
        return yt ? await finish(yt) : await fail("Kon de YouTube-metadata niet ophalen");
      }
      if (url) {
        const link = await processLink(apiKey, url);
        return link ? await finish(link) : await fail("Media-worker niet beschikbaar en geen metadata");
      }
      return await fail("Media-worker niet geconfigureerd voor dit bestand");
    }

    // ── Files in storage: image / pdf ──
    if ((kind === "image" || kind === "pdf") && storagePath) {
      const { data: file, error: dlErr } = await sb.storage.from("braindump").download(storagePath);
      if (dlErr || !file) return await fail("Kon het bestand niet downloaden");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mime = file.type || (kind === "pdf" ? "application/pdf" : "image/jpeg");

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
      return await finish(result);
    }

    // ── Link ──
    if (kind === "link" && url) {
      const link = await processLink(apiKey, url);
      return link ? await finish(link) : await fail("Kon de link niet verwerken");
    }

    // ── Plain text (default) ──
    if (rawText) {
      const t = await processText(apiKey, rawText, url);
      return t ? await finish(t) : await fail("Kon de tekst niet verwerken");
    }
    if (url) {
      const link = await processLink(apiKey, url);
      return link ? await finish(link) : await fail("Kon de link niet verwerken");
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
