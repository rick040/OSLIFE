/**
 * Supabase Edge Function: cognee-search
 * -----------------------------------------
 * Queries the cognee knowledge-graph worker for a graph-aware answer —
 * distinct from memory-search's vector+full-text hybrid recall over
 * search_memory(). Returns null (not an error) whenever the worker isn't
 * configured/reachable, so callers (HEYRA's Zoeken skill) can treat this as
 * "no graph insight available" and fall back to their existing behaviour.
 *
 *   request:  { "query": "..." }
 *   response: { "insight": "<cognee's answer text>" | null }
 *
 * Deploy:
 *   supabase functions deploy cognee-search --project-ref nhyunnnmdcmojvkxrbpl
 * Secrets: COGNEE_WORKER_URL, COGNEE_WORKER_SECRET (both optional).
 */

import { cogneeRecall, extractInsight } from "../_shared/cognee.ts";
import { CORS, bearerToken, corsPreflight, jsonResponder } from "../_shared/http.ts";

const json = jsonResponder(CORS);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight(CORS);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!bearerToken(req)) return json({ error: "Unauthorized" }, 401);

  let body: { query?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const query = (body.query ?? "").trim();
  if (!query) return json({ insight: null });

  const payload = await cogneeRecall(query);
  return json({ insight: extractInsight(payload) });
});
