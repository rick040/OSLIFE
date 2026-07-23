/**
 * Lightweight, free YouTube metadata + transcript fetch — no yt-dlp, no
 * external worker, no API key.
 *
 * - Metadata (title/channel/thumbnail): YouTube's public oEmbed endpoint.
 * - Transcript: YouTube ships caption tracks (manual or auto-generated) as
 *   plain XML alongside every watch page. The track list is embedded in the
 *   `ytInitialPlayerResponse` JSON blob in the page HTML — the exact
 *   technique used by the popular `youtube-transcript` (npm) and
 *   `youtube-transcript-api` (PyPI) tools, just reimplemented here with a
 *   plain fetch() so it runs directly in this Deno edge function.
 *
 * IMPORTANT, learned the hard way: an unauthenticated request to this
 * endpoint routinely gets served `playabilityStatus: "LOGIN_REQUIRED"` (the
 * literal reason string is "Log in om te bevestigen dat je geen bot bent" —
 * "log in to confirm you're not a bot") with no `captions` key at all —
 * this is the SAME anti-bot check yt-dlp hits, applied at the network/
 * session level to any request, not something a plain fetch() dodges by
 * avoiding yt-dlp specifically. In practice this meant this "no cookies
 * needed" path never actually produced a transcript in real usage — every
 * real one came through the yt-dlp+cookies worker fallback instead.
 *
 * Fix: an optional YOUTUBE_COOKIE_HEADER secret (a `name=value; name2=...`
 * Cookie header string, derived from the same cookies.txt the worker uses)
 * authenticates this request as a real browser session, same fix as
 * yt-dlp's --cookies flag, just as an HTTP header instead of a CLI flag.
 * Unset by default — falls back to today's unauthenticated (and, per the
 * above, largely non-functional) behaviour when not configured.
 *
 * This covers the vast majority of videos (most uploads get auto-generated
 * captions within minutes) once cookies are configured. Videos with no
 * captions at all still fall back to a metadata-only note — no worse than
 * before.
 */

import { decodeEntities, fetchText } from "./webpage.ts";

const YOUTUBE_COOKIE_HEADER = Deno.env.get("YOUTUBE_COOKIE_HEADER") ?? "";

export interface YoutubeMeta {
  title: string | null;
  author: string | null;
  thumb: string | null;
}

export async function fetchYoutubeMeta(url: string): Promise<YoutubeMeta> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`);
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
  const cookieHeaders = YOUTUBE_COOKIE_HEADER ? { cookie: YOUTUBE_COOKIE_HEADER } : {};
  const html = await fetchText(`https://www.youtube.com/watch?v=${videoId}&hl=en`, 9000, cookieHeaders);
  if (!html) return null;

  // ytInitialPlayerResponse is one giant object; rather than balance braces
  // across the whole thing, slice out just the "captions" value — it's
  // immediately followed by "videoDetails" in every observed player response.
  const marker = '"captions":';
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const afterMarker = html.slice(start + marker.length);
  const end = afterMarker.indexOf(',"videoDetails');
  if (end === -1) return null;

  let captions: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } };
  try {
    captions = JSON.parse(afterMarker.slice(0, end));
  } catch {
    return null;
  }
  const track = pickCaptionTrack(captions.playerCaptionsTracklistRenderer?.captionTracks ?? []);
  if (!track?.baseUrl) return null;

  const xml = await fetchText(track.baseUrl, 9000, cookieHeaders);
  if (!xml) return null;
  const text = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
    .map((m) => decodeEntities(m[1].replace(/<[^>]+>/g, "")).trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}
