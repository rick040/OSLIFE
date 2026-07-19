/**
 * Supabase Edge Function: cognee-remember
 * ------------------------------------------
 * Feeds one note's text into the cognee knowledge-graph worker
 * (integrations/cognee-worker/), which extracts entities/relationships and
 * builds an actual queryable graph — a different, additive capability from
 * search_memory()'s vector+full-text hybrid recall. Silent no-op when
 * COGNEE_WORKER_URL/COGNEE_WORKER_SECRET aren't configured, so callers never
 * need a special case for "the worker isn't deployed yet."
 *
 * Called fire-and-forget from the same write sites as embed-memory /
 * materialize-note: braindump-ingest's finish(), createInteractionRow,
 * createMessageRow, and embed-memory-backfill's catch-all sweep.
 *
 *   request:  { "source": "braindump"|"interaction"|"summary"|"message", "id": "<uuid>", "text": "..." }
 *   response: { "ok": true } | { "ok": false, "error"?: "<message>" }
 *
 * Deploy:
 *   supabase functions deploy cognee-remember --project-ref nhyunnnmdcmojvkxrbpl
 * Secrets: COGNEE_WORKER_URL, COGNEE_WORKER_SECRET (both optional — a no-op
 * response is returned without them).
 */

import { cogneeRemember } from "../_shared/cognee.ts";
import { CORS, bearerToken, corsPreflight, jsonResponder } from "../_shared/http.ts";

const SOURCE_LABEL: Record<string, string> = {
  braindump: "braindump-notitie",
  interaction: "contactmoment",
  summary: "periode-samenvatting",
  message: "bericht",
};

const json = jsonResponder(CORS);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight(CORS);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!bearerToken(req)) return json({ error: "Unauthorized" }, 401);

  let body: { source?: string; id?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const text = (body.text ?? "").trim();
  if (!text) return json({ error: "text is required" }, 400);

  const label = SOURCE_LABEL[body.source ?? ""];
  const tagged = label ? `[${label}]\n${text}` : text;

  const ok = await cogneeRemember(tagged);
  return json({ ok });
});
