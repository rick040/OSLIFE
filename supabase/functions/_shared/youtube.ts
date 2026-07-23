/**
 * Lightweight, free YouTube metadata + transcript fetch — no yt-dlp, no
 * cookies, no external worker, no API key.
 *
 * - Metadata (title/channel/thumbnail): YouTube's public oEmbed endpoint.
 * - Transcript: YouTube ships caption tracks (manual or auto-generated) as
 *   plain XML alongside every watch page. The track list is embedded in the
 *   `ytInitialPlayerResponse` JSON blob in the page HTML — the exact
 *   technique used by the popular `youtube-transcript` (npm) and
 *   `youtube-transcript-api` (PyPI) tools, just reimplemented here with a
 *   plain fetch() so it runs directly in this Deno edge function.
 *
 * This covers the vast majority of videos (most uploads get auto-generated
 * captions within minutes). Videos with no captions at all still fall back
 * to a metadata-only note — no worse than before, and everything above is
 * free and needs nothing deployed or maintained.
 */

import { decodeEntities, fetchText } from "./webpage.ts";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";

interface WatchPageResult {
  html: string | null;
  debug: string;
}

/**
 * Fetch the watch page HTML. A plain fetch() from an EU IP (this edge
 * function runs in eu-west-1) gets served YouTube's cookie-consent
 * interstitial ("Before you continue to YouTube") instead of the real page —
 * no ytInitialPlayerResponse, so caption detection silently finds nothing.
 * The CONSENT cookie is the standard, widely-used bypass for that wall.
 */
async function fetchYoutubeWatchPage(videoId: string, ms: number): Promise<WatchPageResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
      signal: ctrl.signal,
      headers: {
        "user-agent": BROWSER_UA,
        "accept-language": "en-US,en;q=0.9",
        cookie: "CONSENT=YES+1",
      },
    });
    if (!res.ok) return { html: null, debug: `watch-page HTTP ${res.status}` };
    const text = await res.text();
    return { html: text, debug: `watch-page ok ${text.length}b` };
  } catch (err) {
    return { html: null, debug: `watch-page threw ${String(err).slice(0, 200)}` };
  } finally {
    clearTimeout(t);
  }
}

export interface YoutubeMeta {
  title: string | null;
  author: string | null;
  thumb: string | null;
}

/**
 * Title/channel via oEmbed. Sent with the same browser-ish headers as the
 * watch-page fetch — a bare, header-less fetch() (what this used to be)
 * reads as more bot-like than the parallel watch-page request and appears to
 * get quietly rate-limited/blocked under load, which silently produced a
 * `{title: null, author: null, thumb: null}` note with no visible error.
 */
export async function fetchYoutubeMeta(url: string): Promise<YoutubeMeta> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, {
      headers: {
        "user-agent": BROWSER_UA,
        "accept-language": "en-US,en;q=0.9",
        cookie: "CONSENT=YES+1",
      },
    });
    if (res.ok) {
      const d = await res.json();
      return { title: d.title ?? null, author: d.author_name ?? null, thumb: d.thumbnail_url ?? null };
    }
  } catch { /* ignore */ }
  return { title: null, author: null, thumb: null };
}

export function extractYoutubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/))([\w-]{11})/);
  return m ? m[1] : null;
}

/**
 * Every indexed YouTube video serves a thumbnail at this predictable CDN
 * path — no network call, no oEmbed dependency, so it can't fail the way a
 * fetch can. Preferred over oEmbed's thumbnail_url whenever a video id is
 * available; oEmbed's thumb is only a fallback for it.
 */
export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string; // "asr" = auto-generated
}

/** Manual beats auto-generated; Dutch beats English beats anything else. */
function pickCaptionTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (!tracks.length) return null;
  const score = (t: CaptionTrack) => {
    let s = t.kind === "asr" ? 0 : 10;
    if (t.languageCode?.startsWith("nl")) s += 5;
    else if (t.languageCode?.startsWith("en")) s += 3;
    return s;
  };
  return [...tracks].sort((a, b) => score(b) - score(a))[0];
}

export interface TranscriptResult {
  text: string | null;
  /** Short, human-readable trace of what happened — stashed in the entry's
   * meta column (console logs from this runtime aren't otherwise reachable)
   * so a real failure can be diagnosed from the database instead of guessed. */
  debug: string;
}

/**
 * Fetch a plain-text transcript for a video, or null if it has no captions
 * (manual or auto-generated) at all. Two fetches: the watch page (to find the
 * caption track list), then the track itself (small XML file).
 */
export async function fetchYoutubeTranscript(videoId: string): Promise<TranscriptResult> {
  const page = await fetchYoutubeWatchPage(videoId, 9000);
  if (!page.html) return { text: null, debug: page.debug };
  const html = page.html;

  // ytInitialPlayerResponse is one giant object; rather than balance braces
  // across the whole thing, slice out just the "captions" value — it's
  // immediately followed by "videoDetails" in every observed player response.
  const marker = '"captions":';
  const start = html.indexOf(marker);
  if (start === -1) return { text: null, debug: `${page.debug}; no captions marker` };
  const afterMarker = html.slice(start + marker.length);
  const end = afterMarker.indexOf(',"videoDetails');
  if (end === -1) return { text: null, debug: `${page.debug}; no videoDetails delimiter` };

  let captions: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } };
  try {
    captions = JSON.parse(afterMarker.slice(0, end));
  } catch (err) {
    return { text: null, debug: `${page.debug}; JSON.parse failed ${String(err).slice(0, 150)}` };
  }
  const tracks = captions.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  const track = pickCaptionTrack(tracks);
  if (!track?.baseUrl) return { text: null, debug: `${page.debug}; ${tracks.length} caption tracks found` };

  const xml = await fetchText(track.baseUrl, 9000);
  if (!xml) return { text: null, debug: `${page.debug}; track picked (${track.languageCode}) but xml fetch failed` };
  const text = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
    .map((m) => decodeEntities(m[1].replace(/<[^>]+>/g, "")).trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return { text: null, debug: `${page.debug}; xml ${xml.length}b but no <text> nodes` };
  return { text, debug: `ok, ${text.length} chars from ${track.languageCode}${track.kind === "asr" ? " (auto)" : ""}` };
}
