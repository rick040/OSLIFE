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

/**
 * Fetch the watch page HTML. A plain fetch() from an EU IP (this edge
 * function runs in eu-west-1) gets served YouTube's cookie-consent
 * interstitial ("Before you continue to YouTube") instead of the real page —
 * no ytInitialPlayerResponse, so caption detection silently finds nothing.
 * The CONSENT cookie is the standard, widely-used bypass for that wall.
 */
async function fetchYoutubeWatchPage(videoId: string, ms: number): Promise<string | null> {
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
    if (!res.ok) {
      console.error(`[youtube] watch page fetch ${videoId}: HTTP ${res.status}`);
      return null;
    }
    const text = await res.text();
    console.error(`[youtube] watch page fetch ${videoId}: ok, ${text.length} bytes`);
    return text;
  } catch (err) {
    console.error(`[youtube] watch page fetch ${videoId}: threw ${String(err)}`);
    return null;
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

/**
 * Fetch a plain-text transcript for a video, or null if it has no captions
 * (manual or auto-generated) at all. Two fetches: the watch page (to find the
 * caption track list), then the track itself (small XML file).
 */
export async function fetchYoutubeTranscript(videoId: string): Promise<string | null> {
  const html = await fetchYoutubeWatchPage(videoId, 9000);
  if (!html) return null;

  // ytInitialPlayerResponse is one giant object; rather than balance braces
  // across the whole thing, slice out just the "captions" value — it's
  // immediately followed by "videoDetails" in every observed player response.
  const marker = '"captions":';
  const start = html.indexOf(marker);
  if (start === -1) {
    console.error(`[youtube] ${videoId}: no "captions" marker in page (bot-check/consent page, or genuinely no captions)`);
    return null;
  }
  const afterMarker = html.slice(start + marker.length);
  const end = afterMarker.indexOf(',"videoDetails');
  if (end === -1) {
    console.error(`[youtube] ${videoId}: found captions marker but no ,"videoDetails" delimiter after it`);
    return null;
  }

  let captions: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } };
  try {
    captions = JSON.parse(afterMarker.slice(0, end));
  } catch (err) {
    console.error(`[youtube] ${videoId}: captions JSON.parse failed: ${String(err)}`);
    return null;
  }
  const tracks = captions.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  const track = pickCaptionTrack(tracks);
  if (!track?.baseUrl) {
    console.error(`[youtube] ${videoId}: parsed captions object but found ${tracks.length} caption tracks`);
    return null;
  }
  console.error(`[youtube] ${videoId}: picked caption track lang=${track.languageCode} kind=${track.kind ?? "manual"}`);

  const xml = await fetchText(track.baseUrl, 9000);
  if (!xml) {
    console.error(`[youtube] ${videoId}: caption track fetch failed`);
    return null;
  }
  const text = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
    .map((m) => decodeEntities(m[1].replace(/<[^>]+>/g, "")).trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) console.error(`[youtube] ${videoId}: caption XML had no <text> nodes (${xml.length} bytes)`);
  return text || null;
}
