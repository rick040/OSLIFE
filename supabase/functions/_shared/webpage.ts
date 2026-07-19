/**
 * Shared "fetch a web page and pull out something useful" helpers for Deno /
 * Supabase Edge Functions. Extracted from braindump-ingest's processLink() so
 * enrich-client can reuse the exact same fetch/OpenGraph/HTML-to-text pipeline
 * instead of re-implementing it — plain web pages/RSS only, no login-walled
 * platform scraping (fragile and ToS-risky for a single-user app).
 */

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";

export async function fetchText(url: string, ms = 9000): Promise<string | null> {
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

export interface OG {
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

export function parseOG(html: string): OG {
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

export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/gi, "'");
}

/** Strip tags → readable-ish text (lightweight; no full readability lib). */
export function htmlToText(html: string, max = 8000): string {
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return decodeEntities(body).slice(0, max);
}
