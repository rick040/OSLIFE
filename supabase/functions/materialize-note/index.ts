/**
 * Supabase Edge Function: materialize-note
 * --------------------------------------------
 * Writes one "note" (braindump entry, interaction, summary, or client
 * message) as a real Obsidian-shaped Markdown file — YAML frontmatter plus a
 * body — into the private `vault` Storage bucket. Purely a generated mirror:
 * Postgres stays the source of truth (RLS, realtime, search_memory's hybrid
 * recall all keep working exactly as before); this just materialises the
 * same content as a browsable/exportable file, one per row, at a stable path
 * so re-materialising an edited row overwrites rather than orphans a file.
 *
 * Deliberately scoped to prose/notes only (braindump/interaction/summary/
 * message) — not numeric data (finance, health, habits), which gains nothing
 * from becoming a markdown file. Called fire-and-forget from the same write
 * sites that already feed search_memory()'s embeddings (braindump-ingest,
 * createInteractionRow, createMessageRow) plus embed-memory-backfill's
 * catch-all sweep for summaries (built by the non-HTTP build_summaries()).
 *
 *   request:  { "source": "braindump"|"interaction"|"summary"|"message",
 *               "id": "<uuid>", "frontmatter": {...}, "body": "..." }
 *   response: { "ok": true } | { "ok": false, "error": "<message>" }
 *
 * Deploy:
 *   supabase functions deploy materialize-note --project-ref nhyunnnmdcmojvkxrbpl
 * No secrets required — this only writes to Storage.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderNote, type Frontmatter } from "../_shared/frontmatter.ts";
import { CORS, SUPABASE_URL, bearerToken, corsPreflight, jsonResponder } from "../_shared/http.ts";

const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const VALID_SOURCES = new Set(["braindump", "interaction", "summary", "message"]);

const json = jsonResponder(CORS);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight(CORS);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!bearerToken(req)) return json({ error: "Unauthorized" }, 401);

  let payload: { source?: string; id?: string; frontmatter?: Frontmatter; body?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const source = payload.source ?? "";
  const id = (payload.id ?? "").trim();
  const body = (payload.body ?? "").trim();
  if (!VALID_SOURCES.has(source) || !id || !body) {
    return json({ error: "source (braindump|interaction|summary|message), id and body are required" }, 400);
  }

  const note = renderNote(
    { id, type: source, created: new Date().toISOString().slice(0, 10), ...payload.frontmatter },
    body,
  );

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  // RLS confines this to the caller's own vault folder — no service role needed.
  const { error } = await sb.storage
    .from("vault")
    .upload(`${source}/${id}.md`, new Blob([note], { type: "text/markdown" }), {
      contentType: "text/markdown",
      upsert: true,
    });
  if (error) return json({ ok: false, error: error.message });

  return json({ ok: true });
});
