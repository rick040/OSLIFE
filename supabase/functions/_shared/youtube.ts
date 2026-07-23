/**
 * Free YouTube helpers — id extraction and oEmbed metadata (title/channel/
 * thumbnail). No API key, no yt-dlp, no cookies, and (unlike the watch page)
 * genuinely not subject to YouTube's anti-bot wall — oEmbed is a lightweight
 * public endpoint that stays open to unauthenticated requests.
 *
 * This module used to also fetch transcripts directly (a plain fetch() of
 * YouTube's caption-track JSON, reusing the `ytInitialPlayerResponse` blob
 * embedded in the watch page). That was proven broken by a live test: an
 * unauthenticated request to the watch page routinely gets served
 * `playabilityStatus: "LOGIN_REQUIRED"` — the SAME anti-bot check yt-dlp
 * hits, applied at the network/session level to any request, not something
 * a plain fetch() dodges by avoiding yt-dlp specifically. Worse, the same
 * wall also withholds videoDetails/description — so this path could never
 * have covered metadata either without the same cookie-expiry maintenance
 * burden yt-dlp already has. See ./supadata.ts for the replacement: a
 * third-party API that has already solved bot-check/cookie-rotation as its
 * entire business, used as the primary transcript+full-metadata path now.
 */

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
