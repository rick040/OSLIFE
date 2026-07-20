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

import { cogneeRecall } from "../_shared/cognee.ts";
import { CORS, bearerToken, corsPreflight, jsonResponder } from "../_shared/http.ts";

const json = jsonResponder(CORS);

/**
 * cognee's /api/v1/search returns an array of `{ search_result, dataset_id,
 * dataset_name }` objects (per docs.cognee.ai) rather than a single object —
 * read defensively since the exact inner shape of search_result isn't fully
 * pinned down for every search type.
 */
function extractInsight(payload: unknown): string | null {
  if (!payload) return null;

  const fromOne = (r: Record<string, unknown>): string | null => {
    const candidate = r.search_result ?? r.answer ?? r.result ?? r.text;
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (Array.isArray(candidate) && candidate.length) return candidate.map(String).join("\n");
    return null;
  };

  if (Array.isArray(payload)) {
    const parts = payload
      .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
      .map(fromOne)
      .filter((s): s is string => !!s);
    return parts.length ? parts.join("\n\n") : null;
  }
  if (typeof payload === "object") return fromOne(payload as Record<string, unknown>);
  return null;
}

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
