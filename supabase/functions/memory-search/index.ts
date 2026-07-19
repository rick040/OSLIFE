/**
 * Supabase Edge Function: memory-search
 * ---------------------------------------
 * Proxy in front of the search_memory() RPC so the Voyage embedding key never
 * ships to the frontend (same reasoning as heyra-brain/categorize-vendor).
 * Embeds the query (if VOYAGE_API_KEY is set) and calls search_memory() under
 * the caller's own JWT, so RLS still confines results to the caller's rows.
 * Falls back to a null embedding (today's full-text-only behaviour) on any
 * embedding failure — recall never breaks because of this function.
 *
 *   request:  { "query": "...", "limit"?: 8 }
 *   response: MemoryHit[] (mirrors search_memory()'s columns) | { "error": "..." }
 *
 * Deploy:
 *   supabase functions deploy memory-search --project-ref nhyunnnmdcmojvkxrbpl
 * Secrets: VOYAGE_API_KEY (optional).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { embed } from "../_shared/embeddings.ts";
import { CORS, SUPABASE_URL, bearerToken, corsPreflight, jsonResponder } from "../_shared/http.ts";

const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const json = jsonResponder(CORS);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight(CORS);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!bearerToken(req)) return json({ error: "Unauthorized" }, 401);

  let body: { query?: string; limit?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const query = (body.query ?? "").trim();
  if (!query) return json([]);
  const limit = Number.isFinite(body.limit) ? Number(body.limit) : 8;

  const queryEmbedding = await embed(query, "query");

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await sb.rpc("search_memory", {
    p_query: query,
    p_limit: limit,
    p_query_embedding: queryEmbedding,
  });
  if (error) return json({ error: error.message }, 502);

  return json(data ?? []);
});
