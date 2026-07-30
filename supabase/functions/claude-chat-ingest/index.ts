/**
 * Supabase Edge Function: claude-chat-ingest
 * -------------------------------------------
 * Receives a key-points summary of a Claude conversation (Claude Desktop,
 * Claude Code, claude.ai) from the `oslife-remember` Claude Skill or the
 * "log to oslife memory" Zapier Skill, and logs it straight into OSLIFE's
 * memory — same destination as a Braindump capture (`braindump_entries`,
 * `source_kind: 'text'`, tagged `claude-chat`), so it shows up in the
 * Capture/Claude-log grid, feeds `search_memory()`'s hybrid recall, mirrors
 * into the Obsidian vault, and reaches the cognee knowledge graph.
 *
 * Unlike braindump-ingest this never calls Claude to convert the content —
 * the caller already IS Claude, mid-conversation, producing a pre-digested
 * summary/key-points/tags, so a second round-trip would just be
 * re-summarizing a summary. Auth is a shared secret (no browser session, no
 * user JWT — same shape as wallet-ingest/geofence-ingest/health-ingest), so
 * every write goes through the service-role client, explicitly scoped to
 * OSLIFE_USER_ID (single-user app).
 *
 * Create-vs-update: omit `entryId` to create a new row (the usual one-shot
 * "log this"); pass the `entryId` an earlier call returned to UPDATE that
 * same row in place instead — this is what lets a live conversation keep one
 * evolving memory entry current as it progresses, rather than one row per
 * "remember this" request. An update skips the content-hash dedup check
 * (it's an explicit edit, not a fresh capture) and skips re-feeding cognee
 * (repeated partial states would just spam the knowledge graph with the same
 * conversation over and over — cognee only hears about a conversation once).
 *
 *   request:  { "summary": "...", "keyPoints"?: string[], "title"?: string,
 *               "tags"?: string[], "domain"?: "parkingyou"|"prjct"|"buurtkaart"|"personal"|"cross",
 *               "sourceUrl"?: string, "conversationTitle"?: string, "entryId"?: "<uuid>",
 *               "insight"?: { "category"?: string, "takeaway": string, "application": string } }
 *   response: { "ok": true, "id": "<uuid>", "status": "ready"|"updated"|"duplicate" }
 *
 * Deploy:
 *   supabase functions deploy claude-chat-ingest --project-ref nhyunnnmdcmojvkxrbpl --no-verify-jwt
 *   supabase secrets set CLAUDE_INGEST_SECRET=<random 32+ char string> --project-ref nhyunnnmdcmojvkxrbpl
 * Secrets: CLAUDE_INGEST_SECRET (required, dedicated — this leaves a laptop/MCP
 * config rather than a phone, so it deliberately does NOT fall back to
 * WALLET_WEBHOOK_SECRET like the MacroDroid ingest functions do), OSLIFE_USER_ID,
 * VOYAGE_API_KEY (optional — embeddings only), COGNEE_WORKER_URL/COGNEE_WORKER_SECRET
 * (optional — knowledge-graph only). Every enrichment step is best-effort: a
 * missing key just means that step is a no-op, the braindump row still lands.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cogneeRemember } from "../_shared/cognee.ts";
import { embed } from "../_shared/embeddings.ts";
import { renderNote } from "../_shared/frontmatter.ts";
import { CORS, SUPABASE_SERVICE_KEY, SUPABASE_URL, USER_ID, bearerToken, corsPreflight, jsonResponder } from "../_shared/http.ts";

const CLAUDE_INGEST_SECRET = Deno.env.get("CLAUDE_INGEST_SECRET") ?? "";

const VALID_DOMAINS = ["parkingyou", "prjct", "buurtkaart", "personal", "cross"];
const VALID_LEARNING_CATEGORIES = [
  "life_lesson",
  "way_of_living",
  "business_system",
  "business_practice",
  "implementation",
  "pet",
];
const DEDUP_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — same window as braindump-ingest

const json = jsonResponder(CORS);

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface InsightInput {
  category?: string;
  takeaway?: string;
  application?: string;
}

interface Payload {
  summary?: string;
  keyPoints?: string[];
  title?: string;
  tags?: string[];
  domain?: string;
  sourceUrl?: string;
  conversationTitle?: string;
  entryId?: string;
  insight?: InsightInput;
}

/** SHA-256 hex digest, used for the same content-hash dedup braindump-ingest applies. */
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sanitizeTags(raw: unknown): string[] {
  const tags = Array.isArray(raw) ? raw.map((t) => String(t).trim().toLowerCase()).filter(Boolean) : [];
  return Array.from(new Set(["claude-chat", ...tags])).slice(0, 8);
}

function sanitizeKeyPoints(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((p) => String(p).trim()).filter(Boolean).slice(0, 20);
}

function sanitizeInsight(raw: InsightInput | undefined): { category: string | null; takeaway: string; application: string } | null {
  if (!raw) return null;
  const takeaway = String(raw.takeaway ?? "").trim();
  const application = String(raw.application ?? "").trim();
  if (!takeaway || !application) return null;
  const category = raw.category && VALID_LEARNING_CATEGORIES.includes(raw.category) ? raw.category : null;
  return { category, takeaway, application };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight(CORS);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const secret = req.headers.get("x-webhook-secret") ?? bearerToken(req);
  if (!CLAUDE_INGEST_SECRET || secret !== CLAUDE_INGEST_SECRET) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const summary = (body.summary ?? "").trim();
  if (!summary) return json({ error: "summary is required" }, 400);

  const title = (body.title ?? "").trim() || null;
  const keyPoints = sanitizeKeyPoints(body.keyPoints);
  const tags = sanitizeTags(body.tags);
  const domain = body.domain && VALID_DOMAINS.includes(body.domain) ? body.domain : "personal";
  const sourceUrl = (body.sourceUrl ?? "").trim() || null;
  const conversationTitle = (body.conversationTitle ?? "").trim() || null;
  const requestedEntryId = (body.entryId ?? "").trim() || null;

  const markdown = [
    `# ${title ?? conversationTitle ?? "Claude-gesprek"}`,
    summary,
    keyPoints.length ? `## Kernpunten\n${keyPoints.map((p) => `- ${p}`).join("\n")}` : "",
    sourceUrl ? `\n(bron: ${sourceUrl})` : "",
  ].filter(Boolean).join("\n\n");

  const contentHash = await sha256Hex(`${title ?? ""}|${summary}|${keyPoints.join("|")}`.trim().toLowerCase());
  const insight = sanitizeInsight(body.insight);

  /** Shared best-effort enrichment for a just-written row. `withCognee` is
   *  false on updates — cognee has no update semantics, so a live-updated
   *  conversation only ever feeds it once (see create path below). */
  async function enrich(entryId: string, withCognee: boolean) {
    const embedText = [title, summary, markdown].filter(Boolean).join("\n");
    const vector = await embed(embedText, "document");
    if (vector) {
      await sb.from("braindump_entries").update({ embedding: vector }).eq("id", entryId);
    }

    try {
      const note = renderNote(
        { kind: "note", domain, tags, sentiment: "neutral", source_url: sourceUrl, created: new Date().toISOString().slice(0, 10) },
        markdown,
      );
      await sb.storage.from("vault").upload(`braindump/${entryId}.md`, new Blob([note], { type: "text/markdown" }), {
        contentType: "text/markdown",
        upsert: true,
      });
    } catch {
      // best-effort — the nightly embed-memory-backfill sweep will retry
    }

    if (withCognee) cogneeRemember(`[claude-gesprek]\n${markdown}`).catch(() => {});

    // Optional: Claude flagged a reusable idea/insight worth a spot in the
    // Kennisbank — same suggested-status shape braindump-ingest writes. Can
    // fire on an update too (a conversation may only reveal this partway
    // through), so this isn't gated on withCognee/create-vs-update.
    if (insight) {
      await sb.from("wiki_entries").insert({
        user_id: USER_ID,
        braindump_entry_id: entryId,
        status: "suggested",
        title: title ?? "Claude-gesprek",
        transcript: markdown,
        takeaway: insight.takeaway,
        application: insight.application,
        category: insight.category,
        domain,
        tags,
        source_url: sourceUrl,
      });
    }
  }

  // ── Update path: an earlier call's entryId means "keep this row current" ──
  if (requestedEntryId) {
    const { data: existing } = await sb
      .from("braindump_entries")
      .select("id")
      .eq("id", requestedEntryId)
      .eq("user_id", USER_ID)
      .maybeSingle();
    if (!existing) return json({ error: "entryId not found" }, 404);

    const { error: updateErr } = await sb
      .from("braindump_entries")
      .update({
        title,
        source_url: sourceUrl,
        markdown,
        summary: summary.length > 240 ? `${summary.slice(0, 237)}...` : summary,
        domain,
        tags,
        content_hash: contentHash,
        meta: { source: "claude-chat", conversationTitle },
      })
      .eq("id", requestedEntryId);
    if (updateErr) return json({ ok: false, error: updateErr.message }, 500);

    await enrich(requestedEntryId, false);
    return json({ ok: true, id: requestedEntryId, status: "updated" });
  }

  // ── Create path ────────────────────────────────────────────────────────────
  // Dedup: same shared-secret client can (and will) log the same recap twice
  // across retries/reconnects — same lookback + `duplicate` status shape as
  // braindump-ingest, so a re-log never pollutes search_memory() twice.
  const cutoff = new Date(Date.now() - DEDUP_LOOKBACK_MS).toISOString();
  const { data: dup } = await sb
    .from("braindump_entries")
    .select("id")
    .eq("user_id", USER_ID)
    .eq("content_hash", contentHash)
    .eq("status", "ready")
    .gte("created_at", cutoff)
    .limit(1)
    .maybeSingle();
  if (dup) return json({ ok: true, id: dup.id, status: "duplicate" });

  const { data: row, error: insertErr } = await sb
    .from("braindump_entries")
    .insert({
      user_id: USER_ID,
      source_kind: "text",
      status: "ready",
      title,
      source_url: sourceUrl,
      markdown,
      summary: summary.length > 240 ? `${summary.slice(0, 237)}...` : summary,
      domain,
      kind: "note",
      sentiment: "neutral",
      tags,
      content_hash: contentHash,
      meta: { source: "claude-chat", conversationTitle },
    })
    .select("id")
    .single();

  if (insertErr || !row) {
    return json({ ok: false, error: insertErr?.message ?? "Insert failed" }, 500);
  }

  const entryId = row.id as string;
  await enrich(entryId, true);
  return json({ ok: true, id: entryId, status: "ready" });
});
