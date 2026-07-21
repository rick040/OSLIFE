/**
 * Supabase Edge Function: embed-memory-backfill
 * ------------------------------------------------
 * Catch-all embedding + vault-materialisation pass, triggered by pg_cron via
 * net.http_post with a bearer CRON_SECRET (same shared-secret pattern as
 * notify-tick — see the one-time SQL in docs/SECRETS.md). Covers
 * braindump_entries, interaction and summaries — the nightly summaries
 * roll-up (build_summaries(), plain SQL/pg_cron, no HTTP access) can't call
 * Voyage or Storage itself, and this is also the backstop for anything the
 * fire-and-forget embed-memory/materialize-note calls missed (offline
 * client, race, etc).
 *
 * Two DELIBERATELY INDEPENDENT passes — vault-materialisation used to ride
 * along with a successful embed ("missing embedding" doubled as "not yet
 * materialised"), which meant a missing/rate-limited VOYAGE_API_KEY silently
 * stopped interaction/summaries from ever reaching the vault (summaries have
 * no other path in at all). Pass 1 (materialise) now runs first and never
 * touches Voyage; Pass 2 (embed) runs after and is skipped outright without
 * a key, so it can never eat the whole time budget sleeping toward
 * guaranteed failures either.
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
 * Secrets: CRON_SECRET, VOYAGE_API_KEY (optional — embeddings only), OSLIFE_USER_ID,
 * COGNEE_WORKER_URL/COGNEE_WORKER_SECRET (both optional — a no-op without them).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cogneeRemember } from "../_shared/cognee.ts";
import { embed } from "../_shared/embeddings.ts";
import { renderNote, type Frontmatter } from "../_shared/frontmatter.ts";
import { CORS, SUPABASE_SERVICE_KEY, SUPABASE_URL, USER_ID, corsPreflight, jsonResponder } from "../_shared/http.ts";

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const BATCH_PER_TABLE = 25; // upper bound per table for the (slow, rate-limited) embed pass
const MATERIALIZE_BATCH = 200; // generous — Storage uploads carry no external rate limit

// Voyage AI applies a reduced rate limit (3 requests/minute) to accounts with
// no payment method on file (docs.voyageai.com/docs/pricing) — confirmed live
// against this project's key via a burst test: calls 1-3 returned 200, calls
// 4-6 returned 429 immediately. Pacing every embed() call at this interval
// keeps a nightly run from wasting most of its calls on 429s; once a payment
// method is added on the Voyage dashboard the standard (much higher) limit
// applies and this can be lowered or removed.
const MIN_EMBED_INTERVAL_MS = 21_000;
// Stay well clear of the edge function's own execution ceiling — at the pace
// above, a full BATCH_PER_TABLE*3 sweep would take ~26 minutes, so bail out
// cleanly partway through and let tomorrow's cron tick pick up the rest.
const TIME_BUDGET_MS = 100_000;

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

  let materialized = 0;
  let embedded = 0;
  let failed = 0;
  const startedAt = Date.now();

  // ── Pass 1: vault materialisation — no Voyage/embedding dependency at all.
  // Cheap at this app's scale (tens of rows): just re-upload every non-secret
  // row each run (`upsert: true`) rather than tracking a separate "already
  // materialised" flag that could drift from what's actually in Storage —
  // also self-healing if a file is ever lost or a past write half-failed.
  for (const job of JOBS) {
    const { data: rows, error } = await sb
      .from(job.table)
      .select(job.select)
      .eq("user_id", USER_ID)
      .limit(MATERIALIZE_BATCH);
    if (error || !rows) continue;

    for (const row of rows as Record<string, unknown>[]) {
      if (row.tier === "geheim") continue;
      const text = job.text(row).trim();
      if (!text) continue;

      const note = renderNote(job.frontmatter(row), text);
      try {
        await sb.storage
          .from("vault")
          .upload(`${job.vaultSource}/${row.id}.md`, new Blob([note], { type: "text/markdown" }), {
            contentType: "text/markdown",
            upsert: true,
          });
        materialized++;
      } catch {
        // best-effort — next run retries
      }
    }
  }

  // ── Pass 2: embeddings (Voyage-gated, rate-limited) — unrelated to the
  // vault writes above. Skipped entirely without a key so it never burns the
  // time budget sleeping toward guaranteed failures.
  if (Deno.env.get("VOYAGE_API_KEY")) {
    let lastEmbedAt = 0;
    outer: for (const job of JOBS) {
      const { data: rows, error } = await sb
        .from(job.table)
        .select(job.select)
        .eq("user_id", USER_ID)
        .is("embedding", null)
        .limit(BATCH_PER_TABLE);
      if (error || !rows) continue;

      for (const row of rows as Record<string, unknown>[]) {
        if (Date.now() - startedAt > TIME_BUDGET_MS) break outer;

        const text = job.text(row).trim();
        if (!text) continue;

        const wait = lastEmbedAt + MIN_EMBED_INTERVAL_MS - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        lastEmbedAt = Date.now();

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

        // cognee ride-along stays coupled to a successful embed — unlike the
        // idempotent vault overwrite above, re-running entity-extraction on
        // unchanged text every night would be genuine wasted work.
        const cogneeCall = cogneeRemember(text).catch(() => {});
        const waitUntil = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime
          ?.waitUntil;
        if (waitUntil) waitUntil(cogneeCall);
        else await cogneeCall;
      }
    }
  }

  return json({ ok: true, materialized, embedded, failed });
});
