/**
 * Supabase Edge Function: embed-memory-backfill
 * ------------------------------------------------
 * Catch-all embedding + vault-materialisation pass, triggered by pg_cron via
 * net.http_post with a bearer CRON_SECRET (same shared-secret pattern as
 * notify-tick — see the one-time SQL in docs/SECRETS.md). Finds rows across
 * braindump_entries, interaction and summaries that don't have an embedding
 * yet — the nightly summaries roll-up (build_summaries(), plain SQL/pg_cron,
 * no HTTP access) can't call Voyage or Storage itself, and this is also the
 * backstop for anything the fire-and-forget embed-memory/materialize-note
 * calls missed (offline client, race, etc). "Missing embedding" doubles as
 * the "not yet materialised as a vault note" signal — both happen together,
 * once, the first time a row is picked up here.
 *
 * Single-user app: no per-user loop, just OSLIFE_USER_ID's rows, service role
 * (bypasses RLS, same as notify-tick — and unlike materialize-note/embed-memory,
 * there's no per-request user JWT to thread through here, so the vault write
 * goes straight through this function's own service-role client instead of
 * calling the materialize-note Edge Function over HTTP).
 *
 * Deploy:
 *   supabase functions deploy embed-memory-backfill --project-ref nhyunnnmdcmojvkxrbpl
 * Then in the Dashboard: Edge Functions -> embed-memory-backfill -> Settings ->
 * turn "Enforce JWT verification" OFF (pg_cron cannot send a Supabase JWT).
 * Secrets: CRON_SECRET, VOYAGE_API_KEY, OSLIFE_USER_ID.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { embed } from "../_shared/embeddings.ts";
import { renderNote, type Frontmatter } from "../_shared/frontmatter.ts";
import { CORS, SUPABASE_SERVICE_KEY, SUPABASE_URL, USER_ID, corsPreflight, jsonResponder } from "../_shared/http.ts";

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const BATCH_PER_TABLE = 25; // keep a single tick well under the function's time limit

const json = jsonResponder(CORS);

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface Job {
  table: string;
  vaultSource: string;
  select: string;
  text: (row: Record<string, unknown>) => string;
  frontmatter: (row: Record<string, unknown>) => Frontmatter;
}

const JOBS: Job[] = [
  {
    table: "braindump_entries",
    vaultSource: "braindump",
    select: "id,title,summary,markdown,domain,kind,tags,sentiment,source_url,tier",
    text: (r) => [r.title, r.summary, r.markdown].filter(Boolean).join("\n"),
    frontmatter: (r) => ({
      kind: r.kind as string, domain: r.domain as string,
      tags: (r.tags as string[]) ?? [], sentiment: r.sentiment as string,
      source_url: r.source_url as string | null,
    }),
  },
  {
    table: "interaction",
    vaultSource: "interaction",
    select: "id,summary,channel,direction,person_id,occurred_at,tier",
    text: (r) => String(r.summary ?? ""),
    frontmatter: (r) => ({
      channel: r.channel as string, direction: r.direction as string,
      person_id: r.person_id as string | null, created: (r.occurred_at as string)?.slice(0, 10),
    }),
  },
  {
    table: "summaries",
    vaultSource: "summary",
    select: "id,text,domain,period,period_start,tier",
    text: (r) => String(r.text ?? ""),
    frontmatter: (r) => ({ period: r.period as string, domain: r.domain as string, created: r.period_start as string }),
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
      if (updErr) {
        failed++;
        continue;
      }
      embedded++;

      // Vault mirror rides along with the first successful embed of a row —
      // a Storage file has no per-row tier gate the way search_memory() does,
      // so geheim rows must be excluded here explicitly.
      if (row.tier !== "geheim") {
        const note = renderNote(job.frontmatter(row), text);
        await sb.storage
          .from("vault")
          .upload(`${job.vaultSource}/${row.id}.md`, new Blob([note], { type: "text/markdown" }), {
            contentType: "text/markdown",
            upsert: true,
          })
          .catch(() => {});
      }
    }
  }

  return json({ ok: true, embedded, failed });
});
