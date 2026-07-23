/**
 * Supadata (https://supadata.ai) — third-party YouTube transcript + metadata
 * API. This is now the primary path for YouTube braindump captures.
 *
 * Why a third-party API instead of scraping YouTube ourselves: three
 * self-hosted approaches were tried and confirmed broken/fragile in this
 * exact codebase before this file existed —
 *   1. The official YouTube Data API's captions.download only works for
 *      videos you (as the OAuth'd account) own — a dead end for arbitrary
 *      shared videos.
 *   2. A plain fetch() of YouTube's own caption-track JSON (this repo's old
 *      `_shared/youtube.ts` fetchYoutubeTranscript) — proven via a live
 *      curl test to hit the exact same `playabilityStatus: LOGIN_REQUIRED`
 *      anti-bot wall yt-dlp hits, just via HTTP instead of yt-dlp. Also
 *      confirmed the SAME wall withholds videoDetails/description, so even
 *      metadata (not just captions) needs auth to fetch this way.
 *   3. yt-dlp + cookies (braindump-worker, still there as the last-resort
 *      fallback) — works, but the cookies are a real logged-in browser
 *      session and *will* expire again; that's inherent to the mechanism,
 *      not a one-time bug to fix.
 * Supadata has already solved bot-check/cookie-rotation/residential-IPs as
 * its entire business, and runs its own Whisper fallback for videos with no
 * caption track — one HTTP call covers what used to need two different
 * tools (caption scrape + yt-dlp/ffmpeg/Groq Whisper).
 *
 * Free tier: 100 requests/month, no card — plausible full coverage for a
 * single-user app's realistic volume. Optional: SUPADATA_API_KEY unset, or
 * any request failing/timing out, returns null — caller falls back to free
 * oEmbed metadata and/or the braindump-worker's yt-dlp+cookies path. Same
 * "app never breaks without this key" contract as every other integration.
 *
 * Videos over ~20 minutes get back a jobId instead of an immediate
 * transcript (Supadata's own async-job cutoff). fetchSupadataTranscript()
 * below does NOT poll that job — polling for up to a couple of minutes
 * would block an edge function request. It treats a jobId response as "no
 * fast transcript", so the caller (braindump-ingest) falls through to
 * braindump-worker, which has no such request-time constraint and polls the
 * job itself (see server.mjs's fetchSupadataWithPoll).
 */
const SUPADATA_API_KEY = Deno.env.get("SUPADATA_API_KEY") ?? "";
const BASE = "https://api.supadata.ai/v1";

async function getJson(url: string, ms: number): Promise<any | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "x-api-key": SUPADATA_API_KEY } });
    // 206 = transcript-unavailable — a valid JSON error body, not a fetch failure.
    if (!res.ok && res.status !== 206) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export interface SupadataMeta {
  title: string | null;
  description: string | null;
  channel: string | null;
  thumbnail: string | null;
  duration: number | null; // seconds
}

export async function fetchSupadataMeta(url: string): Promise<SupadataMeta | null> {
  if (!SUPADATA_API_KEY) return null;
  const d = await getJson(`${BASE}/metadata?url=${encodeURIComponent(url)}`, 12000);
  if (!d || typeof d.title !== "string") return null;
  return {
    title: d.title,
    description: typeof d.description === "string" ? d.description : null,
    channel: typeof d.author?.displayName === "string" ? d.author.displayName : null,
    thumbnail: typeof d.media?.thumbnailUrl === "string" ? d.media.thumbnailUrl : null,
    duration: typeof d.media?.duration === "number" ? d.media.duration : null,
  };
}

/** Immediate transcript only — null if unavailable, errored, or the video is
 * long enough that Supadata handed back an async job instead (see doc comment). */
export async function fetchSupadataTranscript(url: string): Promise<string | null> {
  if (!SUPADATA_API_KEY) return null;
  const d = await getJson(`${BASE}/transcript?url=${encodeURIComponent(url)}&text=true&mode=auto`, 25000);
  return d && typeof d.content === "string" ? d.content : null;
}
