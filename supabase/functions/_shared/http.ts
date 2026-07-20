/**
 * Shared HTTP + env boilerplate for Deno / Supabase Edge Functions.
 * CORS constants, a JSON responder factory, preflight + bearer helpers, and the
 * Supabase env preamble every service-role function repeats.
 *
 * IMPORTANT: the three CORS constants are deliberately NOT unified — each
 * function keeps sending exactly the headers it sent before this file existed.
 */

/** Full CORS headers used by browser-invoked functions (supabase.functions.invoke). */
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};

/**
 * Build the per-function `json(body, status)` helper. Pass the function's CORS
 * headers (or nothing for cron/webhook functions that never serve a browser).
 */
export function jsonResponder(extraHeaders: Record<string, string> = {}) {
  return (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...extraHeaders },
    });
}

/** Empty 200 response for an OPTIONS preflight, carrying the given CORS headers. */
export function corsPreflight(headers: Record<string, string> = CORS): Response {
  return new Response(null, { headers });
}

/** Authorization header value with any `Bearer ` prefix stripped ("" when absent). */
export function bearerToken(req: Request): string {
  return (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
}

// ── Supabase env preamble ────────────────────────────────────────────────────
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are auto-injected at deploy time;
// USER_ID is the single OSLIFE account (OSLIFE_USER_ID, legacy RICK_USER_ID).

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export const USER_ID = Deno.env.get("OSLIFE_USER_ID") ?? Deno.env.get("RICK_USER_ID")!;
