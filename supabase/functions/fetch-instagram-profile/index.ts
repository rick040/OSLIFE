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
 * Every *expected* outcome (bad url, private/blocked profile, no og tags)
 * comes back as HTTP 200 with `ok: false` — never a non-2xx status. The
 * supabase-js client discards the response body on a non-2xx status and
 * only surfaces a generic "Edge Function returned a non-2xx status code",
 * so a 4xx/5xx here would silently swallow the actual reason before the
 * caller ever sees it. Non-2xx is reserved for genuine infra/auth failures.
 *
 * Deploy:
 *   supabase functions deploy fetch-instagram-profile --project-ref nhyunnnmdcmojvkxrbpl
 * Secrets: INSTAGRAM_COOKIE_HEADER (optional but in practice needed — see below).
 */

import { CORS, bearerToken, corsPreflight, jsonResponder } from "../_shared/http.ts";
import { fetchText, parseOG, decodeEntities } from "../_shared/webpage.ts";

const json = jsonResponder(CORS);

// Same fix as braindump-ingest's processSocial(): an unauthenticated request
// increasingly gets redirected to Instagram's login wall (a page with no
// og:title/og:description at all) instead of the real profile. Set this to a
// real logged-in browser's `Cookie` header value (sessionid=...; csrftoken=...
// etc., copied from devtools on instagram.com) to fetch as that session
// instead. Every call here is restricted to instagram.com (validated below),
// so there's no risk of the cookie leaking to any other host.
const INSTAGRAM_COOKIE_HEADER = Deno.env.get("INSTAGRAM_COOKIE_HEADER") ?? "";

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
    return json({ ok: false, error: "Ongeldig verzoek" }, 200);
  }

  let url: URL;
  try {
    url = new URL(body.url ?? "");
    if (!/^https?:$/.test(url.protocol)) throw new Error("not http(s)");
    // Only ever fetch instagram.com on this endpoint's behalf — it must never
    // become a general-purpose URL-fetch proxy for an authenticated client.
    if (!/(^|\.)instagram\.com$/i.test(url.hostname)) throw new Error("not instagram.com");
  } catch {
    return json({ ok: false, error: "Dit is geen geldige instagram.com profiellink" }, 200);
  }

  try {
    const cookieHeaders = INSTAGRAM_COOKIE_HEADER ? { cookie: INSTAGRAM_COOKIE_HEADER } : {};
    const html = await fetchText(url.toString(), 9000, cookieHeaders);
    if (!html) return json({ ok: false, error: "Kon het profiel niet ophalen (privé, verwijderd, of Instagram blokkeerde het verzoek)" }, 200);

    const og = parseOG(html);
    if (!og.title) {
      const hint = INSTAGRAM_COOKIE_HEADER
        ? "Instagram gaf een pagina zonder profielgegevens terug (login-wall of geblokkeerd)."
        : "Instagram gaf een login-pagina terug in plaats van het profiel — stel de INSTAGRAM_COOKIE_HEADER secret in (zelfde als bij de braindump) om als ingelogde sessie te lezen.";
      return json({ ok: false, error: hint }, 200);
    }

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
  } catch (err) {
    // Any unexpected failure still degrades to a readable 200 ok:false —
    // never an opaque non-2xx the client would have to discard.
    return json({ ok: false, error: `Onverwachte fout: ${String(err)}` }, 200);
  }
});
