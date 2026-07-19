/**
 * Supabase Edge Function: embed-memory
 * -------------------------------------
 * Given one memory row and its text, embeds it (Voyage AI) and writes the
 * vector back onto that row. Called fire-and-forget right after a row is
 * created/finalised (braindump-ingest's finish(), createInteractionRow()) so
 * search_memory()'s hybrid recall has something to match against. Silently a
 * no-op when VOYAGE_API_KEY isn't set — the caller never has to care.
 *
 *   request:  { "source": "braindump"|"interaction"|"summary"|"business_idea", "id": "<uuid>", "text": "..." }
 *   response: { "ok": true } | { "ok": false, "error": "<message>" }
 *
 * Deploy:
 *   supabase functions deploy embed-memory --project-ref nhyunnnmdcmojvkxrbpl
 * Secrets: VOYAGE_API_KEY (optional — a no-op response is returned without it).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { embed } from "../_shared/embeddings.ts";
import { CORS, SUPABASE_URL, bearerToken, corsPreflight, jsonResponder } from "../_shared/http.ts";

const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const TABLE_BY_SOURCE: Record<string, string> = {
  braindump: "braindump_entries",
  interaction: "interaction",
  summary: "summaries",
  business_idea: "business_ideas",
};

const json = jsonResponder(CORS);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight(CORS);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!bearerToken(req)) return json({ error: "Unauthorized" }, 401);

  let body: { source?: string; id?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const table = TABLE_BY_SOURCE[body.source ?? ""];
  const id = (body.id ?? "").trim();
  const text = (body.text ?? "").trim();
  if (!table || !id || !text) return json({ error: "source, id and text are required" }, 400);

  const vector = await embed(text, "document");
  if (!vector) return json({ ok: false, error: "No embedding produced (missing key or provider error)" });

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  // RLS confines this update to the caller's own row — no service role needed.
  const { error } = await sb.from(table).update({ embedding: vector }).eq("id", id);
  if (error) return json({ ok: false, error: error.message });

  return json({ ok: true });
});
