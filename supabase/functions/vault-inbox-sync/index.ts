/**
 * Supabase Edge Function: vault-inbox-sync
 * --------------------------------------------
 * The write direction of the Obsidian integration. Rick drops a plain
 * Markdown note into the `vault-inbox` Storage bucket (synced from an
 * Obsidian "inbox" folder over the S3 protocol — see docs/SECRETS.md §7);
 * this function, on a pg_cron tick, turns every new note into a
 * braindump_entries row and fires braindump-ingest on it — same pipeline as
 * pasting the note into HEYRA chat or sharing a link, so it gets the same
 * Claude conversion, domain/tag classification, embeddings and vault mirror.
 * Processed files move under `processed/` so a note is never re-ingested; a
 * failed move just means the next tick sees it again — braindump-ingest's own
 * content-hash dedup (20260715020000_braindump_dedup.sql) turns that into a
 * harmless `duplicate` row instead of a second real entry.
 *
 * Single-user app, triggered by pg_cron (no per-request user JWT to thread
 * through) — same shared-secret + service-role shape as notify-tick and
 * embed-memory-backfill, and the same "insert the row, then POST to
 * braindump-ingest with the service-role key as bearer" trick telegram-webhook
 * already uses for its own JWT-less capture path.
 *
 *   request:  {} (pg_cron sends an empty body; Authorization: Bearer <CRON_SECRET>)
 *   response: { "ok": true, "processed": <n>, "skipped": <n> }
 *
 * Deploy:
 *   supabase functions deploy vault-inbox-sync --project-ref nhyunnnmdcmojvkxrbpl
 * Then in the Dashboard: Edge Functions -> vault-inbox-sync -> Settings ->
 * turn "Enforce JWT verification" OFF (pg_cron cannot send a Supabase JWT).
 * Secrets: CRON_SECRET (same value as notify-tick/embed-memory-backfill),
 * OSLIFE_USER_ID.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseFrontmatter } from "../_shared/frontmatter.ts";
import { CORS, SUPABASE_SERVICE_KEY, SUPABASE_URL, USER_ID, corsPreflight, jsonResponder } from "../_shared/http.ts";

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const BUCKET = "vault-inbox";
const MAX_PER_RUN = 20; // bounds one tick's execution time; the rest waits for the next tick

const json = jsonResponder(CORS);
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/** Fire-and-forget, same contract as telegram-webhook's triggerBraindumpIngest(). */
function triggerBraindumpIngest(entryId: string): void {
  fetch(`${SUPABASE_URL}/functions/v1/braindump-ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    body: JSON.stringify({ entryId }),
  }).catch(() => {});
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight(CORS);

  const auth = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!CRON_SECRET || auth !== CRON_SECRET) return json({ error: "Unauthorized" }, 401);

  const { data: entries, error: listErr } = await sb.storage.from(BUCKET).list("", {
    limit: MAX_PER_RUN,
    sortBy: { column: "created_at", order: "asc" },
  });
  if (listErr || !entries) return json({ ok: false, error: listErr?.message ?? "list failed" }, 502);

  // .list("") also returns the "processed" pseudo-folder entry (id === null
  // for a folder placeholder) — only real .md files at the inbox's top level
  // are candidates; anything already filed under processed/ is a past run.
  const candidates = entries.filter((e) => e.id !== null && e.name.toLowerCase().endsWith(".md"));

  let processed = 0;
  let skipped = 0;

  for (const entry of candidates) {
    const path = entry.name;
    const { data: blob, error: dlErr } = await sb.storage.from(BUCKET).download(path);
    if (dlErr || !blob) {
      skipped++;
      continue;
    }

    const raw = await blob.text();
    const { frontmatter, body } = parseFrontmatter(raw);
    if (!body.trim()) {
      skipped++;
      continue;
    }

    // The only frontmatter field honoured on the way in: a hand-typed
    // `tier: geheim` opts a note out of embeddings/vault-mirror/cognee exactly
    // like a geheim capture anywhere else in OSLIFE. Everything else (domain,
    // tags, title) is re-derived by braindump-ingest's own Claude call, same
    // as every other capture path — a folder-synced file shouldn't skip that
    // classification just because the human wrote something in frontmatter.
    const tier = frontmatter.tier === "geheim" ? "geheim" : "normaal";

    const { data: row, error: insErr } = await sb
      .from("braindump_entries")
      .insert({
        user_id: USER_ID,
        source_kind: "text",
        status: "pending",
        tier,
        meta: { rawText: body, filename: path, source: "obsidian-vault-inbox" },
      })
      .select("id")
      .single();

    if (insErr || !row) {
      skipped++;
      continue;
    }

    triggerBraindumpIngest(row.id as string);

    // Move (not delete) so the note stays visible/recoverable in the vault,
    // and so a move failure just means the next tick sees it again — that
    // duplicate insert degrades to braindump-ingest's own dedup, never data loss.
    await sb.storage.from(BUCKET).move(path, `processed/${Date.now()}_${path}`).catch(() => {});
    processed++;
  }

  return json({ ok: true, processed, skipped });
});
