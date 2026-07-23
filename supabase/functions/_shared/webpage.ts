/**
 * Shared "fetch a web page and pull out something useful" helpers for Deno /
 * Supabase Edge Functions. Extracted from braindump-ingest's processLink() so
 * enrich-client can reuse the exact same fetch/OpenGraph/HTML-to-text pipeline
 * instead of re-implementing it — plain web pages/RSS only, no login-walled
 * platform scraping (fragile and ToS-risky for a single-user app).
 */

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";

export async function fetchText(url: string, ms = 9000, extraHeaders: Record<string, string> = {}): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "user-agent": BROWSER_UA, "accept-language": "nl,en;q=0.8", ...extraHeaders },
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

/** Strip tags → readable-ish text (lightweight; no full readability lib). Used
 * as the fallback when extractArticle() below can't run. */
export function htmlToText(html: string, max = 8000): string {
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return decodeEntities(body).slice(0, max);
}

export interface Article {
  title: string | null;
  author: string | null;
  markdown: string;
}

/**
 * Extract the main article content as Markdown via Defuddle (readability-style
 * boilerplate/nav/ad removal), parsed server-side with linkedom's lightweight
 * DOM. Best-effort: returns null on any failure (malformed HTML, esm.sh import
 * hiccup, no article-shaped content) so the caller falls back to the cruder
 * htmlToText() above — a link must still produce *something*.
 *
 * Two Deno-specific gotchas baked in here, found by actually running this
 * (not just type-checking it):
 *  - `defuddle/node` and plain `linkedom` transitively pull in the `canvas`
 *    native binding, which esm.sh can't resolve under Deno → import throws.
 *    `defuddle/full` (self-contained, bundles turndown) + `linkedom/worker`
 *    (canvas-free) sidestep that entirely.
 *  - Defuddle's bundled turndown calls `new DOMParser()` internally assuming
 *    a browser global that Deno doesn't have — borrow linkedom's DOMParser
 *    onto `globalThis` before parsing, or markdown conversion silently
 *    degrades to an error string instead of throwing.
 */
export async function extractArticle(html: string, url: string, max = 12000): Promise<Article | null> {
  try {
    // Order matters: defuddle/full's bundle reads globalThis.DOMParser at
    // module-evaluation time, so linkedom must be imported (and the global
    // set) *before* defuddle/full is imported — a Promise.all race loses this.
    const linkedom: any = await import("https://esm.sh/linkedom@0.18/worker");
    (globalThis as unknown as { DOMParser?: unknown }).DOMParser = linkedom.DOMParser;
    const { default: Defuddle }: any = await import("https://esm.sh/defuddle@0.19.1/full");
    const { document } = linkedom.parseHTML(html);
    const result = new Defuddle(document, { url, markdown: true }).parse();
    const markdown = typeof result?.content === "string" ? result.content.trim() : "";
    if (!markdown || /^partial conversion completed with errors/i.test(markdown)) return null;
    return {
      title: typeof result.title === "string" && result.title.trim() ? result.title.trim() : null,
      author: typeof result.author === "string" && result.author.trim() ? result.author.trim() : null,
      markdown: markdown.slice(0, max),
    };
  } catch {
    return null;
  }
}

/**
 * Instagram/Facebook's og:description is boilerplate like
 * `12K Likes, 340 Comments - user on Instagram: "the actual caption"` — pull
 * out just the quoted caption. Falls back to the raw string when it doesn't
 * match that shape (Pinterest and plain pages don't use it).
 */
export function extractSocialCaption(description: string): string {
  const m = description.match(/on (?:Instagram|Facebook)[^:]*:\s*"([\s\S]*)"\s*$/i);
  return m ? m[1].trim() : description;
}
