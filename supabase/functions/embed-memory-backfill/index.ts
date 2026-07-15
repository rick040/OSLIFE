/**
 * Supabase Edge Function: embed-memory-backfill
 * ------------------------------------------------
 * Catch-all embedding pass, triggered by pg_cron via net.http_post with a
 * bearer CRON_SECRET (same shared-secret pattern as notify-tick — see the
 * one-time SQL in docs/SECRETS.md). Finds rows across braindump_entries,
 * interaction and summaries that don't have an embedding yet — the nightly
 * summaries roll-up (build_summaries(), plain SQL/pg_cron, no HTTP access)
 * can't call Voyage itself, and this is also the backstop for anything the
 * fire-and-forget embed-memory calls missed (offline client, race, etc).
 *
 * Single-user app: no per-user loop, just OSLIFE_USER_ID's rows, service role
 * (bypasses RLS, same as notify-tick).
 *
 * Deploy:
 *   supabase functions deploy embed-memory-backfill --project-ref nhyunnnmdcmojvkxrbpl
 * Then in the Dashboard: Edge Functions -> embed-memory-backfill -> Settings ->
 * turn "Enforce JWT verification" OFF (pg_cron cannot send a Supabase JWT).
 * Secrets: CRON_SECRET, VOYAGE_API_KEY, OSLIFE_USER_ID.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { embed } from "../_shared/embeddings.ts";
import { CORS, SUPABASE_SERVICE_KEY, SUPABASE_URL, USER_ID, corsPreflight, jsonResponder } from "../_shared/http.ts";

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const BATCH_PER_TABLE = 25; // keep a single tick well under the function's time limit

const json = jsonResponder(CORS);

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface Job {
  table: string;
  select: string;
  text: (row: Record<string, unknown>) => string;
}

const JOBS: Job[] = [
  {
    table: "braindump_entries",
    select: "id,title,summary,markdown",
    text: (r) => [r.title, r.summary, r.markdown].filter(Boolean).join("\n"),
  },
  {
    table: "interaction",
    select: "id,summary",
    text: (r) => String(r.summary ?? ""),
  },
  {
    table: "summaries",
    select: "id,text",
    text: (r) => String(r.text ?? ""),
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight(CORS);

  const auth = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!CRON_SECRET || auth !== CRON_SECRET) return json({ error: "Unauthorized" }, 401);

  let embedded = 0;
  let failed = 0;

  for (const job of JOBS) {
    const { data: rows, error } = await sb
      .from(job.table)
      .select(job.select)
      .eq("user_id", USER_ID)
      .is("embedding", null)
      .limit(BATCH_PER_TABLE);
    if (error || !rows) continue;

    for (const row of rows as Record<string, unknown>[]) {
      const text = job.text(row).trim();
      if (!text) continue;
      const vector = await embed(text, "document");
      if (!vector) {
        failed++;
        continue;
      }
      const { error: updErr } = await sb.from(job.table).update({ embedding: vector }).eq("id", row.id as string);
      if (updErr) failed++;
      else embedded++;
    }
  }

  return json({ ok: true, embedded, failed });
});
