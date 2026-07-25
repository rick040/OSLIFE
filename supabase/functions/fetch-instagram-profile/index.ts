/**
 * Supabase Edge Function: fetch-instagram-profile
 * ------------------------------------------------
 * Given a public Instagram profile URL, fetches the page and reads whatever
 * Open Graph meta tags Instagram serves for link-preview purposes (the same
 * data Slack/iMessage/WhatsApp show when you paste the link) — display name,
 * profile photo, and the follower/following/post-count line. This is a
 * deliberately narrow, best-effort read of public unfurl metadata, NOT a
 * logged-in scrape: Instagram's actual bio text is not exposed here (their
 * profile pages don't put it in <meta> tags for logged-out/bot requests), so
 * `bio` is only ever a fallback guess and will often come back null.
 *
 *   request:  { "url": "https://www.instagram.com/username/" }
 *   response: { ok: true, username, displayName, bio, imageUrl, statsText }
 *           | { ok: false, error: "<message>" }
 *
 * Deploy:
 *   supabase functions deploy fetch-instagram-profile --project-ref nhyunnnmdcmojvkxrbpl
 */

import { CORS, bearerToken, corsPreflight, jsonResponder } from "../_shared/http.ts";
import { fetchText, parseOG, decodeEntities } from "../_shared/webpage.ts";

const json = jsonResponder(CORS);

/** Instagram's profile og:description reads like
 *  "123 Followers, 45 Following, 6 Posts - See Instagram photos and videos from Jane Doe (@janedoe)" */
const STATS_RE = /^([\d.,KMk]+\s*Followers,\s*[\d.,KMk]+\s*Following,\s*[\d.,KMk]+\s*Posts)\s*-\s*See Instagram/i;

function parseUsernameFromUrl(url: URL): string | null {
  const seg = url.pathname.split("/").filter(Boolean)[0];
  return seg && /^[a-zA-Z0-9_.]+$/.test(seg) ? seg : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight(CORS);
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  if (!bearerToken(req)) return json({ ok: false, error: "Unauthorized" }, 401);

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  let url: URL;
  try {
    url = new URL(body.url ?? "");
    if (!/^https?:$/.test(url.protocol)) throw new Error("not http(s)");
    // Only ever fetch instagram.com on this endpoint's behalf — it must never
    // become a general-purpose URL-fetch proxy for an authenticated client.
    if (!/(^|\.)instagram\.com$/i.test(url.hostname)) throw new Error("not instagram.com");
  } catch {
    return json({ ok: false, error: "A valid instagram.com profile URL is required" }, 400);
  }

  const html = await fetchText(url.toString());
  if (!html) return json({ ok: false, error: "Kon het profiel niet ophalen (privé, verwijderd, of Instagram blokkeerde het verzoek)" }, 502);

  const og = parseOG(html);
  if (!og.title) return json({ ok: false, error: "Geen profielgegevens gevonden op deze pagina" }, 404);

  const usernameFromTitle = og.title.match(/\(@([a-zA-Z0-9_.]+)\)/)?.[1] ?? null;
  const username = usernameFromTitle ?? parseUsernameFromUrl(url);
  const displayName = decodeEntities(og.title.replace(/\s*\(@[^)]+\)\s*(•.*)?$/, "").trim()) || null;

  let statsText: string | null = null;
  let bio: string | null = null;
  if (og.description) {
    const statsMatch = og.description.match(STATS_RE);
    if (statsMatch) {
      statsText = statsMatch[1];
    } else {
      // Doesn't match the usual stats boilerplate — best-effort treat it as bio text.
      bio = decodeEntities(og.description).trim() || null;
    }
  }

  return json({
    ok: true,
    username,
    displayName,
    bio,
    imageUrl: og.image ?? null,
    statsText,
  });
});
